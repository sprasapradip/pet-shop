import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { notifyBookingStatus } from '../../lib/notify.js';
import { addDays, dateOnly, nptDate, toNpt } from '../../lib/dates.js';
import { normalizePhone } from '../../lib/phone.js';
import { pageMeta, pageParams, pageUrl } from '../../lib/pagination.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { uploadedImages } from '../../middleware/upload.js';
import { BOOKING_STATUS_LABELS, VALLEY_DISTRICTS } from '../../config/constants.js';
import { adminBookingUpdateSchema, createBookingSchema } from '../bookings/booking.schema.js';
import { createBooking, listBookableServices } from '../bookings/booking.service.js';
import { adminPage, f, qs } from './admin.helpers.js';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const isVet = (req: Request) => req.session.user?.role === 'VET';

// ---------------- Bookings ----------------

export async function bookingsIndex(req: Request, res: Response) {
  const status = qs(req, 'status');
  const serviceId = intParam(req.query.service);
  const from = dateRe.test(qs(req, 'from')) ? qs(req, 'from') : '';
  const to = dateRe.test(qs(req, 'to')) ? qs(req, 'to') : '';
  const q = qs(req, 'q');
  const { page, take, skip } = pageParams(req.query.page, 40, 10_000);
  const where: Prisma.BookingWhereInput = {
    ...(isVet(req) ? { assignedToId: req.session.user!.id } : {}),
    ...(status ? { status: status as never } : {}),
    ...(serviceId ? { serviceId } : {}),
    ...(from || to ? { startAt: { gte: from ? toNpt(from) : undefined, lt: to ? toNpt(addDays(to, 1)) : undefined } } : {}),
    ...(q ? { OR: [{ reference: { contains: q } }, { contactPhone: { contains: q } }, { contactName: { contains: q } }] } : {}),
  };
  const [total, bookings, services] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: { service: true, assignedTo: { select: { name: true } }, kennelUnit: true },
      orderBy: { startAt: from ? 'asc' : 'desc' },
      skip,
      take,
    }),
    listBookableServices(),
  ]);
  adminPage(res, 'Bookings');
  res.render('admin/bookings/index', {
    bookings,
    services,
    filters: { status, serviceId, from, to, q },
    statuses: Object.keys(BOOKING_STATUS_LABELS),
    meta: pageMeta(total, page, 40),
    pageLink: (p: number) => pageUrl('/admin/bookings', req.query as Record<string, unknown>, p),
  });
}

/** Week calendar: one column per day, bookings sorted by time. */
export async function bookingsCalendar(req: Request, res: Response) {
  const start = dateRe.test(qs(req, 'start')) ? qs(req, 'start') : nptDate();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const bookings = await prisma.booking.findMany({
    where: {
      ...(isVet(req) ? { assignedToId: req.session.user!.id } : {}),
      status: { notIn: ['CANCELLED'] },
      startAt: { lt: toNpt(addDays(start, 7)) },
      endAt: { gt: toNpt(start) },
    },
    include: { service: true, assignedTo: { select: { name: true } }, kennelUnit: true },
    orderBy: { startAt: 'asc' },
  });
  const byDay = new Map(days.map((d) => [d, [] as typeof bookings]));
  for (const b of bookings) {
    if (b.service.type === 'BOARDING') continue; // boarding has its own occupancy view
    const d = nptDate(b.startAt);
    byDay.get(d)?.push(b);
  }
  adminPage(res, 'Booking calendar');
  res.render('admin/bookings/calendar', { days, byDay, start, prev: addDays(start, -7), next: addDays(start, 7) });
}

export async function bookingDetail(req: Request, res: Response) {
  const booking = await prisma.booking.findUnique({
    where: { id: intParam(req.params.id) },
    include: {
      service: true,
      user: { select: { id: true, name: true, phone: true, email: true } },
      pet: { include: { breed: true } },
      assignedTo: { select: { id: true, name: true } },
      kennelUnit: true,
      careLogs: { orderBy: { logDate: 'asc' } },
    },
  });
  if (!booking) throw notFound('Booking');
  if (isVet(req) && booking.assignedToId !== req.session.user!.id) throw notFound('Booking');
  const [staff, payments] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'VET', 'ADMIN'] }, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.payment.findMany({ where: { bookingId: booking.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  adminPage(res, `Booking ${booking.reference}`);
  res.render('admin/bookings/detail', { booking, staff, payments, statuses: Object.keys(BOOKING_STATUS_LABELS) });
}

export async function bookingUpdate(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const before = await prisma.booking.findUnique({ where: { id } });
  if (!before) throw notFound('Booking');
  if (isVet(req) && before.assignedToId !== req.session.user!.id) throw notFound('Booking');
  const input = parse(adminBookingUpdateSchema, req.body);
  const after = await prisma.booking.update({
    where: { id },
    data: {
      status: input.status,
      // Vets cannot reassign bookings.
      assignedToId: isVet(req) ? before.assignedToId : input.assignedToId,
      pricePaisa: input.pricePaisa === null ? null : Math.round(input.pricePaisa * 100),
      paidPaisa: input.paidRupees !== undefined ? Math.round(input.paidRupees * 100) : before.paidPaisa,
      staffNotes: input.staffNotes ?? null,
    },
    include: { service: true },
  });
  await audit(req, 'update', 'Booking', id, before, after);
  if (before.status !== after.status && req.body.notify === 'on') void notifyBookingStatus(after);
  flash(req, 'success', 'Booking updated.');
  res.redirect(303, `/admin/bookings/${id}`);
}

export async function bookingNewPage(req: Request, res: Response) {
  const services = await listBookableServices();
  adminPage(res, 'New booking (phone / walk-in)');
  res.render('admin/bookings/new', { services, districts: VALLEY_DISTRICTS, today: nptDate(), serviceType: qs(req, 'service') });
}

export async function bookingCreate(req: Request, res: Response) {
  const input = parse(createBookingSchema, req.body);
  const customer = await prisma.user.findUnique({ where: { phone: input.contactPhone } });
  const booking = await createBooking({ ...input, petId: undefined }, customer?.id, true);
  await audit(req, 'create', 'Booking', booking.id, null, booking);
  flash(req, 'success', `Booking ${booking.reference} created and confirmed.`);
  res.redirect(303, `/admin/bookings/${booking.id}`);
}

// ---------------- Boarding ----------------

export async function boardingIndex(req: Request, res: Response) {
  const start = dateRe.test(qs(req, 'start')) ? qs(req, 'start') : nptDate();
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const [units, stays] = await Promise.all([
    prisma.kennelUnit.findMany({ orderBy: { code: 'asc' } }),
    prisma.booking.findMany({
      where: {
        service: { type: 'BOARDING' },
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
        startAt: { lt: toNpt(addDays(start, 14), '12:00') },
        endAt: { gt: toNpt(start, '12:00') },
      },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  // grid[unitId][day] = booking occupying that night
  const grid = new Map<number, Map<string, (typeof stays)[number]>>();
  for (const s of stays) {
    if (!s.kennelUnitId) continue;
    const row = grid.get(s.kennelUnitId) ?? new Map();
    for (const d of days) {
      const night = toNpt(d, '12:00').getTime();
      if (s.startAt.getTime() <= night && s.endAt.getTime() > night) row.set(d, s);
    }
    grid.set(s.kennelUnitId, row);
  }
  const today = nptDate();
  const arrivals = stays.filter((s) => nptDate(s.startAt) === today && s.status !== 'IN_PROGRESS' && s.status !== 'COMPLETED');
  const departures = stays.filter((s) => nptDate(s.endAt) === today && s.status === 'IN_PROGRESS');
  const inHouse = stays.filter((s) => s.status === 'IN_PROGRESS');
  adminPage(res, 'Boarding');
  res.render('admin/boarding/index', {
    units,
    days,
    grid,
    start,
    prev: addDays(start, -14),
    next: addDays(start, 14),
    arrivals,
    departures,
    inHouse,
  });
}

export async function boardingCheck(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const booking = await prisma.booking.findUnique({ where: { id }, include: { service: true } });
  if (!booking || booking.service.type !== 'BOARDING') throw notFound('Boarding booking');
  const action = req.body.action === 'out' ? 'out' : 'in';
  if (action === 'in' && !['PENDING', 'CONFIRMED'].includes(booking.status)) throw new AppError(422, 'invalid_state', 'Only pending/confirmed stays can be checked in');
  if (action === 'out' && booking.status !== 'IN_PROGRESS') throw new AppError(422, 'invalid_state', 'Only checked in stays can be checked out');
  const status = action === 'in' ? 'IN_PROGRESS' : 'COMPLETED';
  await prisma.booking.update({ where: { id }, data: { status } });
  await audit(req, `check_${action}`, 'Booking', id, { status: booking.status }, { status });
  flash(req, 'success', action === 'in' ? `${booking.reference} checked in.` : `${booking.reference} checked out.`);
  res.redirect(303, req.body.back === 'booking' ? `/admin/bookings/${id}` : '/admin/boarding');
}

const careLogSchema = z.object({
  logDate: f.date,
  fed: f.bool,
  walked: f.bool,
  medsGiven: f.bool,
  notes: f.nullableText(2000),
});

export async function boardingLog(req: Request, res: Response) {
  const bookingId = intParam(req.params.id);
  const input = parse(careLogSchema, req.body);
  const [photo] = uploadedImages(req);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw notFound('Booking');
  const data = { fed: input.fed, walked: input.walked, medsGiven: input.medsGiven, notes: input.notes, ...(photo ? { photoPath: photo } : {}) };
  await prisma.boardingLog.upsert({
    where: { bookingId_logDate: { bookingId, logDate: dateOnly(input.logDate) } },
    create: { bookingId, logDate: dateOnly(input.logDate), ...data },
    update: data,
  });
  await audit(req, 'care_log', 'Booking', bookingId, null, input);
  flash(req, 'success', 'Care log saved.');
  res.redirect(303, `/admin/bookings/${bookingId}#care`);
}

const unitSchema = z.object({
  code: f.text(20, 1),
  size: z.enum(['SMALL', 'MEDIUM', 'LARGE']),
  dailyRate: f.rupees,
  isActive: f.bool,
});

export async function unitSave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const data = parse(unitSchema, req.body);
  if (id) {
    const before = await prisma.kennelUnit.findUniqueOrThrow({ where: { id } });
    await prisma.kennelUnit.update({ where: { id }, data });
    await audit(req, 'update', 'KennelUnit', id, before, data);
  } else {
    const unit = await prisma.kennelUnit.create({ data });
    await audit(req, 'create', 'KennelUnit', unit.id, null, unit);
  }
  flash(req, 'success', 'Kennel unit saved.');
  res.redirect(303, '/admin/boarding#units');
}

// ---------------- Medical ----------------

export async function medicalIndex(req: Request, res: Response) {
  const q = qs(req, 'q');
  const pets = q
    ? await prisma.customerPet.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { user: { name: { contains: q } } },
            { user: { phone: { contains: q.length >= 7 ? normalizePhone(q) : q } } },
          ],
        },
        include: { user: { select: { name: true, phone: true } }, breed: true },
        take: 50,
      })
    : [];
  const dueSoon = await prisma.vaccinationRecord.findMany({
    where: { nextDueOn: { gte: dateOnly(nptDate()), lte: dateOnly(addDays(nptDate(), 14)) } },
    include: { pet: { include: { user: { select: { name: true, phone: true } } } } },
    orderBy: { nextDueOn: 'asc' },
    take: 50,
  });
  adminPage(res, 'Medical records');
  res.render('admin/medical/index', { q, pets, dueSoon });
}

export async function medicalPet(req: Request, res: Response) {
  const pet = await prisma.customerPet.findUnique({
    where: { id: intParam(req.params.petId) },
    include: {
      user: { select: { id: true, name: true, phone: true } },
      breed: true,
      vaccinations: { orderBy: { givenOn: 'desc' } },
      medicals: { orderBy: { visitDate: 'desc' } },
      bookings: { include: { service: true }, orderBy: { startAt: 'desc' }, take: 10 },
    },
  });
  if (!pet) throw notFound('Pet');
  adminPage(res, `${pet.name}: medical`);
  res.render('admin/medical/pet', { pet, today: nptDate(), bookingId: intParam(req.query.booking) || '' });
}

const vaccinationSchema = z.object({
  vaccine: f.text(120, 2),
  batchNo: f.nullableText(60),
  givenOn: f.date,
  nextDueOn: f.optDate,
  givenBy: f.nullableText(120),
  bookingId: f.optInt(1),
});

export async function addVaccination(req: Request, res: Response) {
  const petId = intParam(req.params.petId);
  const input = parse(vaccinationSchema, req.body);
  if (input.nextDueOn && input.nextDueOn <= input.givenOn) throw new AppError(422, 'validation_error', 'Next due date must be after the given date');
  const record = await prisma.vaccinationRecord.create({
    data: {
      petId,
      vaccine: input.vaccine,
      batchNo: input.batchNo,
      givenOn: dateOnly(input.givenOn),
      nextDueOn: input.nextDueOn ? dateOnly(input.nextDueOn) : null,
      givenBy: input.givenBy ?? req.session.user!.name,
      bookingId: input.bookingId,
    },
  });
  await audit(req, 'create', 'VaccinationRecord', record.id, null, record);
  flash(req, 'success', 'Vaccination recorded. The owner will get reminders before the next due date.');
  res.redirect(303, `/admin/medical/pets/${petId}`);
}

const medicalSchema = z.object({
  visitDate: f.date,
  complaint: f.text(5000, 2),
  diagnosis: f.nullableText(5000),
  treatment: f.nullableText(5000),
  prescription: f.nullableText(5000),
  vetName: f.nullableText(120),
  bookingId: f.optInt(1),
});

export async function addMedical(req: Request, res: Response) {
  const petId = intParam(req.params.petId);
  const input = parse(medicalSchema, req.body);
  const record = await prisma.medicalRecord.create({
    data: { ...input, petId, visitDate: toNpt(input.visitDate, '12:00'), vetName: input.vetName ?? req.session.user!.name },
  });
  await audit(req, 'create', 'MedicalRecord', record.id, null, record);
  flash(req, 'success', 'Medical record saved.');
  res.redirect(303, `/admin/medical/pets/${petId}`);
}

export async function deleteMedicalRecord(req: Request, res: Response) {
  const petId = intParam(req.params.petId);
  const kind = req.params.kind === 'vaccination' ? 'vaccination' : 'medical';
  const id = intParam(req.params.recordId);
  if (kind === 'vaccination') {
    const rec = await prisma.vaccinationRecord.findFirst({ where: { id, petId } });
    if (!rec) throw notFound('Record');
    await prisma.vaccinationRecord.delete({ where: { id } });
    await audit(req, 'delete', 'VaccinationRecord', id, rec, null);
  } else {
    const rec = await prisma.medicalRecord.findFirst({ where: { id, petId } });
    if (!rec) throw notFound('Record');
    await prisma.medicalRecord.delete({ where: { id } });
    await audit(req, 'delete', 'MedicalRecord', id, rec, null);
  }
  flash(req, 'info', 'Record deleted.');
  res.redirect(303, `/admin/medical/pets/${petId}`);
}
