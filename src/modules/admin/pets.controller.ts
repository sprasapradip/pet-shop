import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { shortCode, slugify, uniqueSlug } from '../../lib/slug.js';
import { dateOnly } from '../../lib/dates.js';
import { normalizePhone } from '../../lib/phone.js';
import { pageMeta, pageParams, pageUrl } from '../../lib/pagination.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { deleteImage, uploadedImages } from '../../middleware/upload.js';
import { RESERVATION_HOURS } from '../../config/constants.js';
import { adminPage, f, qs } from './admin.helpers.js';

const listingSchema = z.object({
  title: f.text(191, 3),
  species: f.species,
  breedId: f.int(1),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: f.date,
  color: f.nullableText(60),
  origin: z.enum(['LOCAL', 'IMPORTED']),
  pricePaisa: f.rupees,
  depositPaisa: f.rupees,
  vaccinated: f.bool,
  dewormed: f.bool,
  healthCertificate: f.bool,
  microchipNo: f.nullableText(40),
  registrationNo: f.nullableText(60),
  parentsInfo: f.nullableText(5000),
  description: f.nullableText(10_000),
  videoUrl: z.preprocess((v) => (v === '' ? null : v), z.string().url().max(255).nullable()),
  status: z.enum(['AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN']),
});

export async function listingsIndex(req: Request, res: Response) {
  const status = qs(req, 'status');
  const q = qs(req, 'q');
  const { page, take, skip } = pageParams(req.query.page, 30, 10_000);
  const where: Prisma.PetListingWhereInput = {
    ...(status ? { status: status as never } : {}),
    ...(q ? { OR: [{ code: { contains: q } }, { title: { contains: q } }, { breed: { name: { contains: q } } }] } : {}),
  };
  const [total, listings] = await Promise.all([
    prisma.petListing.count({ where }),
    prisma.petListing.findMany({
      where,
      include: { breed: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  adminPage(res, 'Pet listings');
  res.render('admin/pets/index', {
    listings,
    filters: { status, q },
    meta: pageMeta(total, page, 30),
    pageLink: (p: number) => pageUrl('/admin/pets', req.query as Record<string, unknown>, p),
  });
}

const breeds = () => prisma.breed.findMany({ orderBy: [{ species: 'asc' }, { name: 'asc' }] });

export async function listingNew(_req: Request, res: Response) {
  adminPage(res, 'New pet listing');
  res.render('admin/pets/form', { listing: null, breeds: await breeds(), buyer: null });
}

export async function listingEdit(req: Request, res: Response) {
  const listing = await prisma.petListing.findUnique({
    where: { id: intParam(req.params.id) },
    include: { images: { orderBy: { sortOrder: 'asc' } }, breed: true },
  });
  if (!listing) throw notFound('Listing');
  const [buyer, payments] = await Promise.all([
    listing.buyerUserId ? prisma.user.findUnique({ where: { id: listing.buyerUserId }, select: { id: true, name: true, phone: true } }) : null,
    prisma.payment.findMany({ where: { listingId: listing.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  adminPage(res, `Edit ${listing.code}`);
  res.render('admin/pets/form', { listing, breeds: await breeds(), buyer, payments });
}

async function assertBreedMatches(breedId: number, species: string) {
  const breed = await prisma.breed.findUnique({ where: { id: breedId } });
  if (!breed || breed.species !== species) throw new AppError(422, 'validation_error', 'Choose a breed of the selected species');
}

export async function listingCreate(req: Request, res: Response) {
  const data = parse(listingSchema, req.body);
  await assertBreedMatches(data.breedId, data.species);
  const listing = await prisma.petListing.create({
    data: {
      ...data,
      code: shortCode('PUP'),
      slug: uniqueSlug(data.title),
      dateOfBirth: dateOnly(data.dateOfBirth),
      soldAt: data.status === 'SOLD' ? new Date() : null,
    },
  });
  await audit(req, 'create', 'PetListing', listing.id, null, listing);
  flash(req, 'success', `Listing ${listing.code} created. Now add photos.`);
  res.redirect(303, `/admin/pets/${listing.id}/edit`);
}

export async function listingUpdate(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const before = await prisma.petListing.findUnique({ where: { id } });
  if (!before) throw notFound('Listing');
  const data = parse(listingSchema, req.body);
  await assertBreedMatches(data.breedId, data.species);
  const statusChange: Prisma.PetListingUncheckedUpdateInput = {};
  if (data.status === 'SOLD' && before.status !== 'SOLD') statusChange.soldAt = new Date();
  if (data.status === 'AVAILABLE') Object.assign(statusChange, { reservedUntil: null, soldAt: null, buyerUserId: null });
  if (data.status === 'RESERVED' && before.status !== 'RESERVED') {
    statusChange.reservedUntil = new Date(Date.now() + RESERVATION_HOURS * 60 * 60_000);
  }
  const after = await prisma.petListing.update({
    where: { id },
    data: { ...data, dateOfBirth: dateOnly(data.dateOfBirth), ...statusChange },
  });
  await audit(req, 'update', 'PetListing', id, before, after);
  flash(req, 'success', 'Listing saved.');
  res.redirect(303, `/admin/pets/${id}/edit`);
}

/** Links a sale to a customer account by phone (creates no account if none exists). */
export async function listingSell(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const before = await prisma.petListing.findUnique({ where: { id } });
  if (!before) throw notFound('Listing');
  const phone = typeof req.body.buyerPhone === 'string' && req.body.buyerPhone.trim() ? normalizePhone(req.body.buyerPhone) : null;
  const buyer = phone ? await prisma.user.findUnique({ where: { phone } }) : null;
  if (phone && !buyer) throw new AppError(422, 'validation_error', `No customer account with phone ${phone}. Leave blank to sell without linking.`);
  const after = await prisma.petListing.update({
    where: { id },
    data: { status: 'SOLD', soldAt: new Date(), reservedUntil: null, buyerUserId: buyer?.id ?? before.buyerUserId },
  });
  await audit(req, 'sell', 'PetListing', id, before, after);
  flash(req, 'success', `${after.code} marked as sold${buyer ? ` to ${buyer.name}` : ''}. It stays visible as "Sold" for 30 days.`);
  res.redirect(303, `/admin/pets/${id}/edit`);
}

export async function listingDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const listing = await prisma.petListing.findUnique({ where: { id }, include: { images: true } });
  if (!listing) throw notFound('Listing');
  const payments = await prisma.payment.count({ where: { listingId: id } });
  if (payments) {
    await prisma.petListing.update({ where: { id }, data: { status: 'HIDDEN' } });
    flash(req, 'info', 'This listing has payments, so it was hidden instead of deleted.');
  } else {
    await prisma.petListing.delete({ where: { id } });
    await Promise.all(listing.images.map((i) => deleteImage(i.path)));
    flash(req, 'success', 'Listing deleted.');
  }
  await audit(req, payments ? 'hide' : 'delete', 'PetListing', id, listing, null);
  res.redirect(303, '/admin/pets');
}

export async function listingImagesUpload(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const listing = await prisma.petListing.findUnique({ where: { id }, include: { _count: { select: { images: true } } } });
  if (!listing) throw notFound('Listing');
  const paths = uploadedImages(req);
  await prisma.petListingImage.createMany({
    data: paths.map((path, i) => ({ listingId: id, path, alt: listing.title, sortOrder: listing._count.images + i })),
  });
  await audit(req, 'upload_images', 'PetListing', id, null, { paths });
  flash(req, 'success', `${paths.length} photo(s) added.`);
  res.redirect(303, `/admin/pets/${id}/edit#images`);
}

export async function listingImageUpdate(req: Request, res: Response) {
  const image = await prisma.petListingImage.findUnique({ where: { id: intParam(req.params.imageId) } });
  if (!image) throw notFound('Image');
  if (req.body.action === 'delete') {
    await prisma.petListingImage.delete({ where: { id: image.id } });
    await deleteImage(image.path);
    await audit(req, 'delete_image', 'PetListing', image.listingId, image, null);
  } else {
    const { alt, sortOrder } = parse(z.object({ alt: f.text(191, 1), sortOrder: f.int(0, 1000) }), req.body);
    await prisma.petListingImage.update({ where: { id: image.id }, data: { alt, sortOrder } });
  }
  res.redirect(303, `/admin/pets/${image.listingId}/edit#images`);
}

// Breeds are managed on the same screen group.
const breedSchema = z.object({ species: f.species, name: f.text(120, 2) });

export async function breedsIndex(_req: Request, res: Response) {
  const list = await prisma.breed.findMany({
    include: { _count: { select: { listings: true, pets: true } } },
    orderBy: [{ species: 'asc' }, { name: 'asc' }],
  });
  adminPage(res, 'Breeds');
  res.render('admin/pets/breeds', { breeds: list });
}

export async function breedCreate(req: Request, res: Response) {
  const data = parse(breedSchema, req.body);
  const base = slugify(data.name);
  const taken = await prisma.breed.findUnique({ where: { slug: base } });
  const breed = await prisma.breed.create({ data: { ...data, slug: taken ? `${base}-${data.species.toLowerCase()}` : base } });
  await audit(req, 'create', 'Breed', breed.id, null, breed);
  flash(req, 'success', 'Breed added.');
  res.redirect(303, '/admin/pets/breeds');
}

export async function breedDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const breed = await prisma.breed.findUnique({ where: { id }, include: { _count: { select: { listings: true, pets: true } } } });
  if (!breed) throw notFound('Breed');
  if (breed._count.listings || breed._count.pets) throw new AppError(422, 'in_use', 'This breed is in use.');
  await prisma.breed.delete({ where: { id } });
  await audit(req, 'delete', 'Breed', id, breed, null);
  flash(req, 'success', 'Breed deleted.');
  res.redirect(303, '/admin/pets/breeds');
}
