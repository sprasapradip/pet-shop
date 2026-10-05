import { Prisma, type Service, type ServiceType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { isRetryableTxError, withTxRetry } from '../../lib/tx.js';
import { addDays, daysBetween, dateOnly, nptTime, toNpt, weekdayOf } from '../../lib/dates.js';
import { ACTIVE_BOOKING_STATUSES, CUSTOMER_CHANGE_CUTOFF_HOURS, PENDING_PAYMENT_TIMEOUT_MIN } from '../../config/constants.js';
import type { CreateBookingInput } from './booking.schema.js';

const reference = () => `EK${randomBytes(4).toString('hex').toUpperCase()}`;
const active = { in: [...ACTIVE_BOOKING_STATUSES] };

export const listBookableServices = () =>
  prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });

export async function getService(type: ServiceType) {
  const service = await prisma.service.findUnique({ where: { type } });
  if (!service || !service.isActive) throw notFound('Service');
  return service;
}

/** House call capacity follows the number of active vets; other services use their configured capacity. */
export async function capacityFor(service: Service, db: Prisma.TransactionClient = prisma) {
  if (service.type !== 'HOUSE_CALL') return service.slotCapacity;
  const vets = await db.user.count({ where: { role: 'VET', isActive: true, deletedAt: null } });
  return Math.max(1, vets);
}

/** Pure slot generator, unit tested separately from the database. */
export function generateSlots(opts: {
  date: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  capacity: number;
  taken: Map<number, number>;
  earliest: number;
}) {
  const dayStart = toNpt(opts.date, opts.opensAt).getTime();
  const dayEnd = toNpt(opts.date, opts.closesAt).getTime();
  const step = opts.durationMinutes * 60_000;
  const slots: { time: string; available: number }[] = [];
  for (let t = dayStart; t + step <= dayEnd; t += step) {
    if (t < opts.earliest) continue;
    const available = opts.capacity - (opts.taken.get(t) ?? 0);
    if (available > 0) slots.push({ time: nptTime(new Date(t)), available });
  }
  return slots;
}

async function dayRules(date: string) {
  const [hours, blocked] = await Promise.all([
    prisma.businessHour.findUnique({ where: { weekday: weekdayOf(date) } }),
    prisma.blockedDate.findUnique({ where: { date: dateOnly(date) } }),
  ]);
  return { hours, blocked };
}

export async function listSlots(type: ServiceType, date: string) {
  const service = await prisma.service.findUnique({ where: { type } });
  if (!service || !service.isActive || type === 'BOARDING') throw notFound('Service');

  const { hours, blocked } = await dayRules(date);
  if (!hours || hours.isClosed || blocked) return [];

  const dayStart = toNpt(date, hours.opensAt);
  const dayEnd = toNpt(date, hours.closesAt);
  const [taken, capacity] = await Promise.all([
    prisma.booking.groupBy({
      by: ['startAt'],
      where: { serviceId: service.id, startAt: { gte: dayStart, lt: dayEnd }, status: active },
      _count: { _all: true },
    }),
    capacityFor(service),
  ]);

  return generateSlots({
    date,
    opensAt: hours.opensAt,
    closesAt: hours.closesAt,
    durationMinutes: service.durationMinutes,
    capacity,
    taken: new Map(taken.map((t) => [t.startAt.getTime(), t._count._all])),
    earliest: Date.now() + service.leadMinutes * 60_000,
  });
}

export async function boardingAvailability(from: string, to: string) {
  if (to <= from) throw new AppError(422, 'validation_error', 'Check out must be after check in');
  if (daysBetween(from, to) > 60) throw new AppError(422, 'validation_error', 'Boarding can be booked for up to 60 nights online');
  const startAt = toNpt(from, '12:00');
  const endAt = toNpt(to, '12:00');
  const busy = await prisma.booking.findMany({
    where: { status: active, startAt: { lt: endAt }, endAt: { gt: startAt }, kennelUnitId: { not: null } },
    select: { kennelUnitId: true },
  });
  const busyIds = busy.map((b) => b.kennelUnitId!);
  const units = await prisma.kennelUnit.findMany({
    where: { isActive: true, id: { notIn: busyIds.length ? busyIds : [0] } },
    orderBy: [{ size: 'asc' }, { code: 'asc' }],
  });
  const nights = daysBetween(from, to);
  const bySize = new Map<string, { size: string; free: number; dailyRate: number }>();
  for (const u of units) {
    const s = bySize.get(u.size) ?? { size: u.size, free: 0, dailyRate: u.dailyRate };
    s.free += 1;
    s.dailyRate = Math.min(s.dailyRate, u.dailyRate);
    bySize.set(u.size, s);
  }
  return { nights, free: units.length, sizes: [...bySize.values()].map((s) => ({ ...s, totalPaisa: s.dailyRate * nights })) };
}

function bookingWindow(service: Service, input: { date: string; slot?: string; endDate?: string }, skipLeadTime = false) {
  const isBoarding = service.type === 'BOARDING';
  const startAt = isBoarding ? toNpt(input.date, '12:00') : toNpt(input.date, input.slot);
  const endAt = isBoarding ? toNpt(input.endDate!, '12:00') : new Date(startAt.getTime() + service.durationMinutes * 60_000);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw new AppError(422, 'validation_error', 'Invalid date');
  if (endAt <= startAt) throw new AppError(422, 'validation_error', 'End must be after start');
  if (skipLeadTime) {
    if (endAt.getTime() < Date.now()) throw new AppError(422, 'validation_error', 'This time is already over');
  } else if (startAt.getTime() < Date.now() + service.leadMinutes * 60_000) {
    const hours = Math.round(service.leadMinutes / 60);
    throw new AppError(422, 'validation_error', `Please book at least ${hours} hour${hours === 1 ? '' : 's'} in advance`);
  }
  if (isBoarding && daysBetween(input.date, input.endDate!) > 60) {
    throw new AppError(422, 'validation_error', 'Boarding can be booked for up to 60 nights online');
  }
  return { startAt, endAt };
}

/** Checks opening hours and blocked dates for a slot based service. */
async function assertOpen(service: Service, date: string, slot?: string) {
  const { hours, blocked } = await dayRules(date);
  if (blocked) throw new AppError(422, 'validation_error', `We are closed on ${date}${blocked.reason ? ` (${blocked.reason})` : ''}`);
  if (!hours || hours.isClosed) throw new AppError(422, 'validation_error', 'We are closed on that day');
  if (service.type !== 'BOARDING' && slot) {
    const valid = generateSlots({
      date,
      opensAt: hours.opensAt,
      closesAt: hours.closesAt,
      durationMinutes: service.durationMinutes,
      capacity: 1,
      taken: new Map(),
      earliest: 0,
    }).some((s) => s.time === slot);
    if (!valid) throw new AppError(422, 'validation_error', 'Please choose one of the listed time slots');
  }
}

/**
 * Finds a free kennel / checks slot capacity and writes the booking inside a SERIALIZABLE
 * transaction so two customers can never take the last place at the same time.
 */
async function reserveCapacity(
  tx: Prisma.TransactionClient,
  service: Service,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: number,
): Promise<{ kennelUnitId?: number; dailyRate?: number }> {
  const notSelf = excludeBookingId ? { id: { not: excludeBookingId } } : {};
  // Queue bookings of the same service behind one row lock: concurrent requests wait instead of
  // deadlocking, and every following read sees the bookings committed before it.
  await tx.$queryRaw`SELECT id FROM services WHERE id = ${service.id} FOR UPDATE`;
  if (service.type === 'BOARDING') {
    const busy = await tx.booking.findMany({
      where: { ...notSelf, status: active, startAt: { lt: endAt }, endAt: { gt: startAt }, kennelUnitId: { not: null } },
      select: { kennelUnitId: true },
    });
    const busyIds = busy.map((b) => b.kennelUnitId!);
    const free = await tx.kennelUnit.findFirst({
      where: { isActive: true, id: { notIn: busyIds.length ? busyIds : [0] } },
      orderBy: [{ dailyRate: 'asc' }, { id: 'asc' }],
    });
    if (!free) throw conflict('No kennel is free for these dates. Please try other dates.');
    return { kennelUnitId: free.id, dailyRate: free.dailyRate };
  }
  const [count, capacity] = await Promise.all([
    tx.booking.count({ where: { ...notSelf, serviceId: service.id, startAt, status: active } }),
    capacityFor(service, tx),
  ]);
  if (count >= capacity) throw conflict('This slot was just booked. Please pick another time.');
  return {};
}

const isSerializationFailure = isRetryableTxError;

/** `staffEntry` is for phone/walk-in bookings entered in admin: no lead time, booking starts CONFIRMED. */
export async function createBooking(input: CreateBookingInput, userId?: number, staffEntry = false) {
  const service = await getService(input.serviceType);

  let petSummary = input.petSummary;
  if (input.petId) {
    if (!userId) throw new AppError(403, 'forbidden', 'Log in to choose a saved pet');
    const pet = await prisma.customerPet.findFirst({ where: { id: input.petId, userId }, include: { breed: true } });
    if (!pet) throw new AppError(403, 'forbidden', 'Pet not found in your account');
    petSummary ??= [pet.name, pet.breed?.name ?? pet.species].filter(Boolean).join(', ');
  }

  await assertOpen(service, input.date, input.slot);
  const { startAt, endAt } = bookingWindow(service, input, staffEntry);

  try {
    return await withTxRetry(() => prisma.$transaction(
      async (tx) => {
        const { kennelUnitId, dailyRate } = await reserveCapacity(tx, service, startAt, endAt);
        const nights = service.type === 'BOARDING' ? daysBetween(input.date, input.endDate!) : 0;
        const pricePaisa = service.type === 'BOARDING' ? dailyRate! * nights : service.basePricePaisa;
        // Boarding advance is one night when the service requires an advance.
        const advancePaisa = service.type === 'BOARDING' ? (service.advancePaisa > 0 ? dailyRate! : 0) : service.advancePaisa;

        return tx.booking.create({
          data: {
            reference: reference(),
            serviceId: service.id,
            userId,
            petId: input.petId,
            petSummary,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            startAt,
            endAt,
            addressText: input.district && input.addressText ? `${input.addressText}, ${input.district}` : input.addressText,
            latitude: input.latitude,
            longitude: input.longitude,
            notes: input.notes,
            kennelUnitId,
            pricePaisa,
            advancePaisa: staffEntry ? 0 : advancePaisa,
            status: staffEntry ? 'CONFIRMED' : 'PENDING',
          },
          include: { service: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
    ));
  } catch (err) {
    if (isSerializationFailure(err)) {
      logger.warn({ serviceType: input.serviceType, date: input.date, slot: input.slot }, 'Booking serialization conflict');
      throw conflict('This slot was just booked. Please pick another time.');
    }
    throw err;
  }
}

export function getBookingByReference(reference: string) {
  return prisma.booking.findUnique({
    where: { reference },
    include: { service: true, kennelUnit: true, pet: true, assignedTo: { select: { name: true } } },
  });
}

function assertCustomerCanChange(booking: { startAt: Date; status: string }) {
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status as never) || booking.status === 'IN_PROGRESS') {
    throw new AppError(422, 'invalid_state', 'This booking can no longer be changed');
  }
  if (booking.startAt.getTime() - Date.now() < CUSTOMER_CHANGE_CUTOFF_HOURS * 60 * 60_000) {
    throw new AppError(
      422,
      'too_late',
      `Bookings can be changed online until ${CUSTOMER_CHANGE_CUTOFF_HOURS} hours before. Please call us.`,
    );
  }
}

/** Owner check: logged in owner, or the guest who verified the booking phone in this session. */
export function canManageBooking(
  booking: { userId: number | null; contactPhone: string },
  userId?: number,
  verifiedPhone?: string,
) {
  if (userId && booking.userId === userId) return true;
  return !booking.userId && !!verifiedPhone && verifiedPhone === booking.contactPhone;
}

export async function cancelBooking(reference: string, userId?: number, verifiedPhone?: string) {
  const booking = await prisma.booking.findUnique({ where: { reference }, include: { service: true } });
  if (!booking || !canManageBooking(booking, userId, verifiedPhone)) throw notFound('Booking');
  assertCustomerCanChange(booking);
  return prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' }, include: { service: true } });
}

export async function rescheduleBooking(
  reference: string,
  input: { date: string; slot?: string; endDate?: string },
  userId?: number,
) {
  const booking = await prisma.booking.findUnique({ where: { reference }, include: { service: true } });
  if (!booking || !userId || booking.userId !== userId) throw notFound('Booking');
  assertCustomerCanChange(booking);
  const service = booking.service;
  if (service.type === 'BOARDING' && !input.endDate) throw new AppError(422, 'validation_error', 'Choose a check out date');
  if (service.type !== 'BOARDING' && !input.slot) throw new AppError(422, 'validation_error', 'Choose a time slot');
  await assertOpen(service, input.date, input.slot);
  const { startAt, endAt } = bookingWindow(service, input);

  try {
    return await withTxRetry(() => prisma.$transaction(
      async (tx) => {
        const { kennelUnitId, dailyRate } = await reserveCapacity(tx, service, startAt, endAt, booking.id);
        const nights = service.type === 'BOARDING' ? daysBetween(input.date, input.endDate!) : 0;
        return tx.booking.update({
          where: { id: booking.id },
          data: {
            startAt,
            endAt,
            kennelUnitId: kennelUnitId ?? booking.kennelUnitId,
            pricePaisa: service.type === 'BOARDING' ? dailyRate! * nights : booking.pricePaisa,
            status: 'PENDING',
          },
          include: { service: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
    ));
  } catch (err) {
    if (isSerializationFailure(err)) throw conflict('That time was just booked. Please pick another.');
    throw err;
  }
}

/** Worker: PENDING bookings whose required advance was not paid within 30 minutes are cancelled. */
export async function cancelUnpaidBookings() {
  const cutoff = new Date(Date.now() - PENDING_PAYMENT_TIMEOUT_MIN * 60_000);
  const stale = await prisma.booking.findMany({
    where: { status: 'PENDING', advancePaisa: { gt: 0 }, createdAt: { lt: cutoff } },
    select: { id: true, advancePaisa: true, paidPaisa: true },
  });
  const ids = stale.filter((b) => b.paidPaisa < b.advancePaisa).map((b) => b.id);
  if (ids.length) {
    await prisma.booking.updateMany({
      where: { id: { in: ids } },
      data: { status: 'CANCELLED', staffNotes: 'Auto cancelled: advance not paid within 30 minutes' },
    });
  }
  return ids.length;
}

export const nextDays = (count: number, from = new Date()) => {
  const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(from);
  return Array.from({ length: count }, (_, i) => addDays(start, i));
};
