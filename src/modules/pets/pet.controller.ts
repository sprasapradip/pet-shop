import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { absoluteUrl, breadcrumbLd, setSeo } from '../../lib/seo.js';
import { pageUrl } from '../../lib/pagination.js';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { SPECIES_LABELS } from '../../config/constants.js';
import { deleteImage, uploadedImages } from '../../middleware/upload.js';
import { buyRequestSchema, sellPetSchema } from '../inquiries/inquiry.schema.js';
import { createInquiry } from '../inquiries/inquiry.service.js';
import { breedsWithListings, getListingBySlug, listingQuerySchema, listListings, videoEmbedUrl } from './pet.service.js';
import { startPayment } from '../payments/payment.service.js';
import { renderPaymentStart } from '../orders/checkout.controller.js';

export async function petsIndex(req: Request, res: Response) {
  const q = listingQuerySchema.parse(req.query);
  const [{ listings, meta }, breeds] = await Promise.all([listListings(q), breedsWithListings()]);
  const filterCount = ['species', 'breed', 'gender', 'origin', 'minAge', 'maxAge', 'minPrice', 'maxPrice'].filter(
    (k) => q[k as keyof typeof q] !== undefined,
  ).length;
  const speciesName = q.species ? SPECIES_LABELS[q.species] : null;
  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Pets for sale', url: '/pets' },
  ];
  setSeo(res, {
    title: speciesName
      ? `${speciesName === 'Dog' ? 'Puppies' : `${speciesName}s`} for Sale in Kathmandu`
      : 'Puppies and Pets for Sale in Kathmandu',
    description:
      'Healthy local and imported puppies, kittens and birds for sale in Kathmandu with vaccination records, deworming and registration papers.',
    canonical: q.species && filterCount === 1 ? `/pets?species=${q.species.toLowerCase()}` : '/pets',
    noindex: filterCount > 1,
    jsonLd: [breadcrumbLd(crumbs)],
  });
  res.render('pets/index', {
    listings,
    meta,
    breeds,
    filters: q,
    pageLink: (p: number) => pageUrl('/pets', req.query as Record<string, unknown>, p),
  });
}

export async function petDetail(req: Request, res: Response) {
  const listing = await getListingBySlug(String(req.params.slug));
  if (!listing) throw notFound('Pet');
  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Pets for sale', url: '/pets' },
    { name: listing.title, url: `/pets/${listing.slug}` },
  ];
  const cover = listing.images[0];
  setSeo(res, {
    title: `${listing.title} | ${listing.breed.name} for Sale in Kathmandu`,
    description: `${listing.breed.name} ${listing.gender.toLowerCase()} ${listing.origin === 'IMPORTED' ? 'imported' : 'locally bred'} ${listing.vaccinated ? 'vaccinated ' : ''}for sale at The Everest Kennel, Kathmandu. Code ${listing.code}.`,
    canonical: `/pets/${listing.slug}`,
    ogImage: cover ? `/${cover.path}-1200.webp` : undefined,
    noindex: listing.status === 'SOLD',
    jsonLd: [
      breadcrumbLd(crumbs),
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: listing.title,
        sku: listing.code,
        category: `${SPECIES_LABELS[listing.species]} / ${listing.breed.name}`,
        image: listing.images.map((i) => absoluteUrl(`/${i.path}-1200.webp`)),
        offers: {
          '@type': 'Offer',
          priceCurrency: 'NPR',
          price: (listing.pricePaisa / 100).toFixed(0),
          availability: listing.status === 'AVAILABLE' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
          seller: { '@id': `${res.locals.baseUrl}/#business` },
        },
      },
    ],
  });
  res.render('pets/detail', { listing, videoEmbed: videoEmbedUrl(listing.videoUrl) });
}

/** "Reserve with deposit": logged in buyers pay the deposit via eSewa/Khalti. */
export async function reservePet(req: Request, res: Response) {
  const listing = await prisma.petListing.findUnique({ where: { slug: String(req.params.slug) } });
  if (!listing) throw notFound('Pet');
  if (listing.status !== 'AVAILABLE') throw new AppError(409, 'unavailable', 'This pet is already reserved or sold.');
  if (listing.depositPaisa <= 0) throw new AppError(422, 'no_deposit', 'Online reservation is not available for this pet. Please call us.');
  const gateway = z.enum(['ESEWA', 'KHALTI'], { errorMap: () => ({ message: 'Choose eSewa or Khalti' }) }).parse(req.body.gateway);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session.user!.id } });

  const start = await startPayment({
    kind: 'listing',
    targetId: listing.id,
    gateway,
    amountPaisa: listing.depositPaisa,
    name: `Deposit ${listing.code}`,
    customer: { name: user.name, phone: user.phone, email: user.email },
    userId: user.id,
  });
  return renderPaymentStart(res, start, `the deposit for ${listing.code}`);
}

/** "Schedule a visit" request from a listing page. */
export async function requestVisit(req: Request, res: Response) {
  const listing = await prisma.petListing.findUnique({ where: { slug: String(req.params.slug) }, include: { breed: true } });
  if (!listing) throw notFound('Pet');
  const input = parse(buyRequestSchema, req.body);
  await createInquiry({
    type: 'PET_BUY_REQUEST',
    name: input.name,
    phone: input.phone,
    subject: `Visit request for ${listing.code} (${listing.breed.name})`,
    message: input.message ?? `I would like to see ${listing.title}.`,
    meta: { listingId: listing.id, code: listing.code, visitDate: input.visitDate ?? null },
    ip: req.ip,
  });
  flash(req, 'success', 'Visit request sent. We will call you to confirm a time.');
  res.redirect(303, `/pets/${listing.slug}`);
}

export function sellPage(_req: Request, res: Response) {
  setSeo(res, {
    title: 'Sell Your Puppy or Pet in Kathmandu',
    description: 'Have puppies or a pet to sell? Send photos and details to The Everest Kennel and get an offer.',
    canonical: '/sell-your-pet',
  });
  res.render('pets/sell');
}

export async function sellSubmit(req: Request, res: Response) {
  const photos = uploadedImages(req);
  try {
    const input = parse(sellPetSchema, req.body);
    await createInquiry({
      type: 'PET_SELL_OFFER',
      name: input.name,
      phone: input.phone,
      subject: `Sell offer: ${input.breed} (${SPECIES_LABELS[input.species]}), ${input.ageMonths} months`,
      message: input.message ?? '',
      meta: {
        species: input.species,
        breed: input.breed,
        ageMonths: input.ageMonths,
        gender: input.gender,
        askingPrice: input.askingPrice,
        location: input.location,
        vaccinated: input.vaccinated === 'on',
        photos,
      },
      ip: req.ip,
    });
  } catch (err) {
    await Promise.all(photos.map(deleteImage));
    throw err;
  }
  flash(req, 'success', 'Thank you! We received your pet details and will call you within a day.');
  res.redirect(303, '/sell-your-pet');
}
