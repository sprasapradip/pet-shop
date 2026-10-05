import { z } from 'zod';
import { nepalPhone } from '../../lib/phone.js';
import { VALLEY_DISTRICTS } from '../../config/constants.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const optionalNumber = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(min).max(max).optional());

export const SERVICE_TYPES = ['HOUSE_CALL', 'TREATMENT', 'VACCINATION', 'MATING', 'TRAINING', 'BOARDING'] as const;

// Rough bounding box of the Kathmandu Valley for map pins.
const VALLEY_BOUNDS = { minLat: 27.55, maxLat: 27.82, minLng: 85.18, maxLng: 85.56 };

export const createBookingSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES, { errorMap: () => ({ message: 'Choose a service' }) }),
    petId: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().optional()),
    petSummary: optionalText(255),
    contactName: z.string().trim().min(2, 'Enter your name').max(120),
    contactPhone: nepalPhone,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    slot: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    addressText: optionalText(255),
    district: z.enum(VALLEY_DISTRICTS).optional().or(z.literal('').transform(() => undefined)),
    latitude: optionalNumber(26, 31),
    longitude: optionalNumber(80, 89),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.serviceType === 'BOARDING' && !v.endDate)
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Check out date is required' });
    if (v.serviceType === 'BOARDING' && v.endDate && v.endDate <= v.date)
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Check out must be after check in' });
    if (v.serviceType !== 'BOARDING' && !v.slot)
      ctx.addIssue({ code: 'custom', path: ['slot'], message: 'Please choose a time slot' });
    if (v.serviceType === 'HOUSE_CALL') {
      if (!v.addressText) ctx.addIssue({ code: 'custom', path: ['addressText'], message: 'Address is required for house calls' });
      if (!v.district)
        ctx.addIssue({ code: 'custom', path: ['district'], message: 'House calls are available in Kathmandu, Lalitpur and Bhaktapur only' });
      if (v.latitude !== undefined && v.longitude !== undefined) {
        const b = VALLEY_BOUNDS;
        if (v.latitude < b.minLat || v.latitude > b.maxLat || v.longitude < b.minLng || v.longitude > b.maxLng)
          ctx.addIssue({ code: 'custom', path: ['addressText'], message: 'The map pin is outside the Kathmandu Valley' });
      }
    }
    if (!v.petId && !v.petSummary)
      ctx.addIssue({ code: 'custom', path: ['petSummary'], message: 'Tell us about your pet' });
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  slot: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const adminBookingUpdateSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  assignedToId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullable()),
  pricePaisa: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).nullable()),
  paidRupees: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(0).optional()),
  staffNotes: optionalText(5000),
});
