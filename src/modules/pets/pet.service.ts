import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { pageMeta, pageParams } from '../../lib/pagination.js';
import { SOLD_VISIBLE_DAYS } from '../../config/constants.js';

const optionalStr = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const listingQuerySchema = z.object({
  species: z.enum(['DOG', 'CAT', 'BIRD', 'FISH', 'RABBIT', 'OTHER']).optional().catch(undefined),
  breed: optionalStr,
  gender: z.enum(['MALE', 'FEMALE']).optional().catch(undefined),
  origin: z.enum(['LOCAL', 'IMPORTED']).optional().catch(undefined),
  minAge: z.coerce.number().int().min(0).max(240).optional().catch(undefined),
  maxAge: z.coerce.number().int().min(0).max(240).optional().catch(undefined),
  minPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'youngest']).default('newest').catch('newest'),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});
export type ListingQuery = z.infer<typeof listingQuerySchema>;

const monthsAgo = (m: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - m);
  return d;
};

/** Public visibility: available and reserved pets, plus pets sold in the last 30 days as social proof. */
export const publicListingWhere = (): Prisma.PetListingWhereInput => ({
  OR: [
    { status: { in: ['AVAILABLE', 'RESERVED'] } },
    { status: 'SOLD', soldAt: { gte: new Date(Date.now() - SOLD_VISIBLE_DAYS * 86_400_000) } },
  ],
});

export const listingCardInclude = {
  breed: true,
  images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
} satisfies Prisma.PetListingInclude;

export async function listListings(q: ListingQuery) {
  const { page, take, skip } = pageParams(q.page);
  const where: Prisma.PetListingWhereInput = { AND: [publicListingWhere()] };
  const and = where.AND as Prisma.PetListingWhereInput[];
  if (q.species) and.push({ species: q.species });
  if (q.breed) and.push({ breed: { slug: q.breed } });
  if (q.gender) and.push({ gender: q.gender });
  if (q.origin) and.push({ origin: q.origin });
  // Age in months maps to a date of birth range.
  if (q.minAge !== undefined) and.push({ dateOfBirth: { lte: monthsAgo(q.minAge) } });
  if (q.maxAge !== undefined) and.push({ dateOfBirth: { gte: monthsAgo(q.maxAge + 1) } });
  if (q.minPrice !== undefined) and.push({ pricePaisa: { gte: q.minPrice * 100 } });
  if (q.maxPrice !== undefined) and.push({ pricePaisa: { lte: q.maxPrice * 100 } });

  const orderBy: Prisma.PetListingOrderByWithRelationInput[] = [{ status: 'asc' }];
  if (q.sort === 'price_asc') orderBy.push({ pricePaisa: 'asc' });
  else if (q.sort === 'price_desc') orderBy.push({ pricePaisa: 'desc' });
  else if (q.sort === 'youngest') orderBy.push({ dateOfBirth: 'desc' });
  else orderBy.push({ createdAt: 'desc' });

  const [total, listings] = await Promise.all([
    prisma.petListing.count({ where }),
    prisma.petListing.findMany({ where, include: listingCardInclude, orderBy, skip, take }),
  ]);
  return { listings, meta: pageMeta(total, page, take) };
}

export const featuredListings = (take = 6) =>
  prisma.petListing.findMany({
    where: { status: 'AVAILABLE' },
    include: listingCardInclude,
    orderBy: { createdAt: 'desc' },
    take,
  });

export const getListingBySlug = (slug: string) =>
  prisma.petListing.findFirst({
    where: { slug, ...publicListingWhere() },
    include: { breed: true, images: { orderBy: { sortOrder: 'asc' } } },
  });

export const breedsWithListings = () =>
  prisma.breed.findMany({
    where: { listings: { some: publicListingWhere() } },
    orderBy: { name: 'asc' },
  });

/** YouTube/Facebook/Vimeo links become embeddable URLs; anything else is shown as a link. */
export function videoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/** Worker: expired reservations return to AVAILABLE; sold pets older than 30 days are hidden. */
export async function expireReservations() {
  const now = new Date();
  const expired = await prisma.petListing.updateMany({
    where: { status: 'RESERVED', reservedUntil: { lt: now } },
    data: { status: 'AVAILABLE', reservedUntil: null, buyerUserId: null },
  });
  const hidden = await prisma.petListing.updateMany({
    where: { status: 'SOLD', soldAt: { lt: new Date(now.getTime() - SOLD_VISIBLE_DAYS * 86_400_000) } },
    data: { status: 'HIDDEN' },
  });
  return { expired: expired.count, hidden: hidden.count };
}
