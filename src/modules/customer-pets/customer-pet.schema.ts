import { z } from 'zod';

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const customerPetSchema = z.object({
  name: z.string().trim().min(1, 'Enter your pet’s name').max(80),
  species: z.enum(['DOG', 'CAT', 'BIRD', 'FISH', 'RABBIT', 'OTHER']),
  breedId: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
  gender: z.preprocess(blankToUndefined, z.enum(['MALE', 'FEMALE']).optional()),
  dateOfBirth: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  weightKg: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(200).optional()),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
});
export type CustomerPetInput = z.infer<typeof customerPetSchema>;

export const weightSchema = z.object({
  weightKg: z.coerce.number().min(0.01).max(200),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
