import { randomBytes } from 'node:crypto';

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Slug plus a short random suffix, for records whose titles repeat (pet listings, shelter animals). */
export const uniqueSlug = (input: string) => `${slugify(input)}-${randomBytes(2).toString('hex')}`;

/** Upper case code such as EK4F2A9C. */
export const shortCode = (prefix: string) => `${prefix}${randomBytes(3).toString('hex').toUpperCase()}`;
