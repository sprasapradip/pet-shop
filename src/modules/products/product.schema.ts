import { z } from 'zod';

const optionalStr = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const productQuerySchema = z.object({
  q: optionalStr,
  category: optionalStr,
  brand: optionalStr,
  species: z.enum(['DOG', 'CAT', 'BIRD', 'FISH', 'RABBIT', 'OTHER']).optional().catch(undefined),
  lifeStage: z.enum(['puppy', 'adult', 'senior', 'all']).optional().catch(undefined),
  minPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  sort: z.enum(['popular', 'newest', 'price_asc', 'price_desc', 'name']).default('popular').catch('popular'),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;
