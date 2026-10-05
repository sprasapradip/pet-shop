import { z } from 'zod';
import { nepalPhone } from '../../lib/phone.js';
import { passwordSchema } from '../../lib/password.js';

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().email('Enter a valid email address').max(191).optional());

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(120),
    phone: nepalPhone,
    email: optionalEmail,
    password: passwordSchema,
    passwordConfirm: z.string(),
    acceptTerms: z.literal('on', { errorMap: () => ({ message: 'Please accept the terms and privacy policy' }) }),
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ['passwordConfirm'], message: 'Passwords do not match' });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your phone or email').max(191),
  password: z.string().min(1, 'Enter your password').max(128),
  next: z.string().optional(),
});

export const forgotSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your phone or email').max(191),
});

export const resetSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ['passwordConfirm'], message: 'Passwords do not match' });

export const otpSendSchema = z.object({
  phone: nepalPhone,
  purpose: z.enum(['booking', 'verify_phone', 'reset']).default('booking'),
});

export const otpVerifySchema = z.object({
  phone: nepalPhone,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit code'),
  purpose: z.enum(['booking', 'verify_phone', 'reset']).default('booking'),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: optionalEmail,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ['passwordConfirm'], message: 'Passwords do not match' });

/** Only same-site relative paths are allowed as post-login redirects. */
export const safeNext = (next: string | undefined) =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : undefined;
