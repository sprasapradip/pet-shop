import { z } from 'zod';
import { nepalPhone } from '../../lib/phone.js';

export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2, 'Enter your full name').max(120),
  customerPhone: nepalPhone,
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().email('Enter a valid email').max(191).optional()),
  deliveryZone: z.enum(['RING_ROAD', 'VALLEY', 'OUTSIDE'], { errorMap: () => ({ message: 'Choose a delivery area' }) }),
  line1: z.string().trim().min(3, 'Enter street / tole / house').max(191),
  area: z.string().trim().min(2, 'Enter area or ward').max(120),
  city: z.string().trim().min(2, 'Enter city').max(80),
  district: z.string().trim().min(2, 'Enter district').max(80),
  landmark: z.string().trim().max(191).optional(),
  notes: z.string().trim().max(1000).optional(),
  paymentMethod: z.enum(['COD', 'ESEWA', 'KHALTI'], { errorMap: () => ({ message: 'Choose a payment method' }) }),
  saveAddress: z.string().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const orderStatusSchema = z.object({
  status: z.enum(['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  note: z.string().trim().max(255).optional(),
});
