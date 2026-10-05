import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { setSeo } from '../../lib/seo.js';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { intParam } from '../../lib/session-helpers.js';
import { deleteImage, uploadedImages } from '../../middleware/upload.js';
import { ACTIVE_BOOKING_STATUSES, CUSTOMER_CHANGE_CUTOFF_HOURS } from '../../config/constants.js';
import { changePasswordSchema, profileSchema } from '../auth/auth.schema.js';
import { changePassword, deleteAccount, endSession } from '../auth/auth.service.js';
import { customerPetSchema, weightSchema } from '../customer-pets/customer-pet.schema.js';
import { addWeight, createPet, deletePet, getPet, listPets, updatePet } from '../customer-pets/customer-pet.service.js';
import { getOrderForCustomer } from '../orders/order.service.js';
import { getSettings } from '../settings/settings.service.js';

const uid = (req: Request) => req.session.user!.id;
const page = (res: Response, title: string) => {
  setSeo(res, { title: `${title} | My account`, noindex: true });
  res.set('Cache-Control', 'no-store');
};

export async function dashboard(req: Request, res: Response) {
  const userId = uid(req);
  const [orders, upcoming, pets, dueVaccines] = await Promise.all([
    prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 3 }),
    prisma.booking.findMany({
      where: { userId, startAt: { gte: new Date() }, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
      include: { service: true },
      orderBy: { startAt: 'asc' },
      take: 3,
    }),
    listPets(userId),
    prisma.vaccinationRecord.findMany({
      where: { pet: { userId }, nextDueOn: { gte: new Date(Date.now() - 30 * 86_400_000), lte: new Date(Date.now() + 30 * 86_400_000) } },
      include: { pet: true },
      orderBy: { nextDueOn: 'asc' },
    }),
  ]);
  page(res, 'Overview');
  res.render('account/dashboard', { orders, upcoming, pets, dueVaccines });
}

export async function orders(req: Request, res: Response) {
  const list = await prisma.order.findMany({
    where: { userId: uid(req) },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  page(res, 'Orders');
  res.render('account/orders', { orders: list });
}

export async function orderDetail(req: Request, res: Response) {
  const order = await getOrderForCustomer(String(req.params.orderNo), uid(req));
  if (!order) throw notFound('Order');
  page(res, `Order ${order.orderNo}`);
  res.render('account/order', { order });
}

/** Printable invoice (use the browser's "Save as PDF"). Also used by admin. */
export async function invoice(req: Request, res: Response) {
  const isStaff = res.locals.isStaff as boolean;
  const order = await prisma.order.findFirst({
    where: { orderNo: String(req.params.orderNo), ...(isStaff ? {} : { userId: uid(req) }) },
    include: { items: true, payments: { where: { status: 'COMPLETED' } } },
  });
  if (!order) throw notFound('Order');
  const settings = await getSettings();
  res.set('Cache-Control', 'no-store');
  res.render('account/invoice', { layout: false, order, settings, packingSlip: req.query.slip === '1' && isStaff });
}

export async function bookings(req: Request, res: Response) {
  const list = await prisma.booking.findMany({
    where: { userId: uid(req) },
    include: { service: true, pet: true },
    orderBy: { startAt: 'desc' },
    take: 100,
  });
  const cutoff = Date.now() + CUSTOMER_CHANGE_CUTOFF_HOURS * 60 * 60_000;
  page(res, 'Bookings');
  res.render('account/bookings', {
    bookings: list,
    canChange: (b: (typeof list)[number]) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.startAt.getTime() > cutoff,
  });
}

export async function pets(req: Request, res: Response) {
  const list = await listPets(uid(req));
  page(res, 'My pets');
  res.render('account/pets', { pets: list });
}

export async function petNewPage(_req: Request, res: Response) {
  const breeds = await prisma.breed.findMany({ orderBy: [{ species: 'asc' }, { name: 'asc' }] });
  page(res, 'Add a pet');
  res.render('account/pet-form', { pet: null, breeds });
}

export async function petCreate(req: Request, res: Response) {
  const [photo] = uploadedImages(req);
  try {
    const input = parse(customerPetSchema, req.body);
    const pet = await createPet(uid(req), input, photo);
    flash(req, 'success', `${pet.name} was added.`);
    res.redirect(303, `/account/pets/${pet.id}`);
  } catch (err) {
    await deleteImage(photo);
    throw err;
  }
}

export async function petDetail(req: Request, res: Response) {
  const pet = await getPet(uid(req), intParam(req.params.id));
  page(res, pet.name);
  res.render('account/pet', { pet });
}

export async function petEditPage(req: Request, res: Response) {
  const [pet, breeds] = await Promise.all([
    getPet(uid(req), intParam(req.params.id)),
    prisma.breed.findMany({ orderBy: [{ species: 'asc' }, { name: 'asc' }] }),
  ]);
  page(res, `Edit ${pet.name}`);
  res.render('account/pet-form', { pet, breeds });
}

export async function petUpdate(req: Request, res: Response) {
  const [photo] = uploadedImages(req);
  try {
    const input = parse(customerPetSchema, req.body);
    const pet = await updatePet(uid(req), intParam(req.params.id), input, photo);
    flash(req, 'success', 'Saved.');
    res.redirect(303, `/account/pets/${pet.id}`);
  } catch (err) {
    await deleteImage(photo);
    throw err;
  }
}

export async function petDelete(req: Request, res: Response) {
  await deletePet(uid(req), intParam(req.params.id));
  flash(req, 'info', 'Pet removed.');
  res.redirect(303, '/account/pets');
}

export async function petAddWeight(req: Request, res: Response) {
  const input = parse(weightSchema, req.body);
  const id = intParam(req.params.id);
  await addWeight(uid(req), id, input.weightKg, input.recordedOn);
  flash(req, 'success', 'Weight recorded.');
  res.redirect(303, `/account/pets/${id}`);
}

export async function profilePage(req: Request, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: uid(req) },
    include: { addresses: { orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] } },
  });
  page(res, 'Profile');
  res.render('account/profile', { profile: user });
}

export async function profileUpdate(req: Request, res: Response) {
  const input = parse(profileSchema, req.body);
  const user = await prisma.user.update({ where: { id: uid(req) }, data: { name: input.name, email: input.email ?? null } });
  req.session.user!.name = user.name;
  flash(req, 'success', 'Profile updated.');
  res.redirect(303, '/account/profile');
}

export async function passwordUpdate(req: Request, res: Response) {
  const input = parse(changePasswordSchema, req.body);
  await changePassword(uid(req), input.currentPassword, input.password);
  flash(req, 'success', 'Password changed.');
  res.redirect(303, '/account/profile');
}

export async function addressDelete(req: Request, res: Response) {
  await prisma.address.deleteMany({ where: { id: intParam(req.params.id), userId: uid(req) } });
  flash(req, 'info', 'Address removed.');
  res.redirect(303, '/account/profile');
}

export async function accountDelete(req: Request, res: Response) {
  if (req.body.confirm !== 'DELETE') {
    flash(req, 'error', 'Type DELETE to confirm account deletion.');
    return res.redirect(303, '/account/profile');
  }
  await deleteAccount(uid(req));
  await endSession(req);
  res.clearCookie('ek.sid');
  return res.redirect(303, '/?deleted=1');
}

// ----- JSON API: /api/v1/me/pets -----

export async function apiMyPets(req: Request, res: Response) {
  const list = await listPets(uid(req));
  res.json({
    data: list.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed?.name ?? null,
      gender: p.gender,
      dateOfBirth: p.dateOfBirth,
      weightKg: p.weightKg ? Number(p.weightKg) : null,
      nextVaccinationDue: p.vaccinations[0]?.nextDueOn ?? null,
    })),
  });
}

export async function apiAddPet(req: Request, res: Response) {
  const input = parse(customerPetSchema, req.body);
  const pet = await createPet(uid(req), input);
  res.status(201).location(`/account/pets/${pet.id}`).json({ data: { id: pet.id, name: pet.name } });
}
