import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { AppError } from '../../src/lib/errors.js';
import { createBooking, listSlots, cancelBooking } from '../../src/modules/bookings/booking.service.js';
import { futureDate } from './helpers.js';

afterAll(() => prisma.$disconnect());

const base = {
  petSummary: 'Labrador, 4 months',
  contactName: 'Guest',
  contactPhone: '9841111111',
  addressText: undefined,
  district: undefined,
  latitude: undefined,
  longitude: undefined,
  notes: undefined,
  petId: undefined,
};

describe('booking capacity', () => {
  it('creates exactly slotCapacity bookings when many customers race for one slot', async () => {
    const date = futureDate(6);
    const service = await prisma.service.findUniqueOrThrow({ where: { type: 'VACCINATION' } });
    const attempts = 20;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        createBooking({ ...base, serviceType: 'VACCINATION', date, slot: '11:00', endDate: undefined }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const conflicts = results.filter((r) => r.status === 'rejected' && r.reason instanceof AppError && r.reason.status === 409).length;
    expect(ok).toBe(service.slotCapacity);
    expect(conflicts).toBe(attempts - service.slotCapacity);

    const slots = await listSlots('VACCINATION', date);
    expect(slots.find((s) => s.time === '11:00')).toBeUndefined();
  });

  it('frees the place again when a booking is cancelled', async () => {
    const date = futureDate(7);
    const booking = await createBooking({ ...base, serviceType: 'MATING', date, slot: '09:00', endDate: undefined });
    await expect(createBooking({ ...base, serviceType: 'MATING', date, slot: '09:00', endDate: undefined })).rejects.toThrow(/just booked/);
    // Guests can cancel only after verifying the booking phone in their session.
    await expect(cancelBooking(booking.reference, undefined, '9800000000')).rejects.toThrow(/not found/i);
    await cancelBooking(booking.reference, undefined, base.contactPhone);
    await expect(createBooking({ ...base, serviceType: 'MATING', date, slot: '09:00', endDate: undefined })).resolves.toBeTruthy();
  });

  it('requires the advance for services that need one', async () => {
    const b = await createBooking({ ...base, serviceType: 'MATING', date: futureDate(8), slot: '13:00', endDate: undefined });
    expect(b.advancePaisa).toBeGreaterThan(0);
  });

  it('rejects slots outside the generated list and closed days', async () => {
    await expect(createBooking({ ...base, serviceType: 'VACCINATION', date: futureDate(6), slot: '09:07', endDate: undefined })).rejects.toThrow(
      /listed time slots/,
    );
    const date = futureDate(9);
    await prisma.blockedDate.create({ data: { date: new Date(`${date}T00:00:00Z`), reason: 'Holiday' } });
    await expect(createBooking({ ...base, serviceType: 'VACCINATION', date, slot: '10:00', endDate: undefined })).rejects.toThrow(/closed/);
    expect(await listSlots('VACCINATION', date)).toEqual([]);
  });

  it('respects lead time', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
    await expect(createBooking({ ...base, serviceType: 'MATING', date: today, slot: '09:00', endDate: undefined })).rejects.toThrow(/in advance/);
  });
});

describe('boarding', () => {
  it('assigns distinct kennels and refuses when all are occupied', async () => {
    const units = await prisma.kennelUnit.count({ where: { isActive: true } });
    const from = futureDate(20);
    const to = futureDate(23);
    const results = await Promise.allSettled(
      Array.from({ length: units + 3 }, () => createBooking({ ...base, serviceType: 'BOARDING', date: from, endDate: to, slot: undefined })),
    );
    const created = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<{ kennelUnitId: number | null; pricePaisa: number | null }>).value);
    expect(created).toHaveLength(units);
    expect(new Set(created.map((b) => b.kennelUnitId)).size).toBe(units);
    expect(created.every((b) => (b.pricePaisa ?? 0) > 0)).toBe(true);

    // A stay that starts on another stay's check out day does not overlap.
    await expect(createBooking({ ...base, serviceType: 'BOARDING', date: to, endDate: futureDate(24), slot: undefined })).resolves.toBeTruthy();
  });
});
