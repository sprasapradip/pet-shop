import { z } from 'zod';
import { nepalPhone } from '../../lib/phone.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().email('Enter a valid email').max(191).optional());

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: nepalPhone,
  email: optionalEmail,
  topic: z.enum(['CONTACT', 'PET_BUY_REQUEST', 'MATING_REQUEST']).default('CONTACT'),
  subject: optionalText(191),
  message: z.string().trim().min(5, 'Write a short message').max(3000),
});

export const sellPetSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: nepalPhone,
  species: z.enum(['DOG', 'CAT', 'BIRD', 'FISH', 'RABBIT', 'OTHER']),
  breed: z.string().trim().min(2, 'Enter the breed').max(120),
  ageMonths: z.coerce.number().int().min(0, 'Enter age in months').max(240),
  gender: z.enum(['MALE', 'FEMALE']),
  askingPrice: z.coerce.number().int().min(0).max(10_000_000),
  location: z.string().trim().min(2, 'Enter your location').max(191),
  vaccinated: z.string().optional(),
  message: optionalText(2000),
});

export const shelterReportSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: nepalPhone,
  species: z.enum(['DOG', 'CAT', 'BIRD', 'OTHER']).default('DOG'),
  condition: z.enum(['INJURED', 'SICK', 'STRAY', 'ABUSED', 'OTHER']),
  location: z.string().trim().min(3, 'Describe where the animal is').max(255),
  latitude: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(26).max(31).optional()),
  longitude: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(80).max(89).optional()),
  message: z.string().trim().min(5, 'Describe the animal and its condition').max(2000),
});

export const adoptionSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: nepalPhone,
  address: z.string().trim().min(5, 'Enter your address').max(255),
  homeType: z.enum(['HOUSE_WITH_YARD', 'HOUSE', 'APARTMENT', 'OTHER']),
  ownership: z.enum(['OWN', 'RENT']),
  landlordAllows: z.enum(['YES', 'NO', 'NA']).default('NA'),
  household: z.string().trim().min(2, 'Tell us who lives with you').max(500),
  otherPets: z.string().trim().max(500).optional(),
  experience: z.string().trim().min(5, 'Tell us about your experience with pets').max(1000),
  hoursAlone: z.coerce.number().int().min(0).max(24),
  whyAdopt: z.string().trim().min(10, 'Tell us why you want to adopt').max(2000),
  homeVisitOk: z.literal('on', { errorMap: () => ({ message: 'A home check is required for adoption' }) }),
});

export const stockNotifySchema = z.object({
  variantId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: nepalPhone,
});

export const buyRequestSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: nepalPhone,
  visitDate: z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  message: optionalText(1000),
});
