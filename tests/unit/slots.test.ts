import { describe, expect, it } from 'vitest';
import { generateSlots } from '../../src/modules/bookings/booking.service.js';
import { toNpt } from '../../src/lib/dates.js';

const base = { date: '2026-10-08', opensAt: '09:00', closesAt: '11:00', durationMinutes: 30, capacity: 2, taken: new Map<number, number>(), earliest: 0 };

describe('slot generation', () => {
  it('creates slots that fit inside opening hours (Nepal time)', () => {
    expect(generateSlots(base).map((s) => s.time)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('does not create a slot that would end after closing', () => {
    expect(generateSlots({ ...base, durationMinutes: 45 }).map((s) => s.time)).toEqual(['09:00', '09:45']);
  });

  it('subtracts booked places and hides full slots', () => {
    const taken = new Map([
      [toNpt('2026-10-08', '09:00').getTime(), 2],
      [toNpt('2026-10-08', '09:30').getTime(), 1],
    ]);
    const slots = generateSlots({ ...base, taken });
    expect(slots[0]).toEqual({ time: '09:30', available: 1 });
    expect(slots.map((s) => s.time)).not.toContain('09:00');
  });

  it('respects the lead time', () => {
    const earliest = toNpt('2026-10-08', '10:00').getTime();
    expect(generateSlots({ ...base, earliest }).map((s) => s.time)).toEqual(['10:00', '10:30']);
  });

  it('stores Nepal time correctly in UTC (+05:45)', () => {
    expect(toNpt('2026-10-08', '09:40').toISOString()).toBe('2026-10-08T03:55:00.000Z');
  });
});
