import { z } from 'zod';

const PHONE_RE = /^(\+977-?)?(98|97|96)\d{8}$|^(\+977-?)?0?1-?\d{7}$/;

/** Normalizes Nepali numbers: mobiles to 98XXXXXXXX, Kathmandu landlines to 01XXXXXXX. */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s()]/g, '').replace(/^00977/, '+977');
  p = p.replace(/^\+977-?/, '').replace(/-/g, '');
  if (/^1\d{7}$/.test(p)) p = `0${p}`;
  return p;
}

export const isValidNepalPhone = (raw: string) => PHONE_RE.test(raw.trim().replace(/[\s()]/g, ''));

export const nepalPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()]/g, ''))
  .refine((v) => PHONE_RE.test(v), 'Enter a valid Nepali phone number')
  .transform(normalizePhone);

export const isMobile = (p: string) => /^(98|97|96)\d{8}$/.test(normalizePhone(p));
