import type { Request, Response } from 'express';
import { z } from 'zod';
import { setSeo } from '../../lib/seo.js';

/** Form field helpers for admin schemas (HTML forms send strings). */
export const f = {
  bool: z.preprocess((v) => v === 'on' || v === 'true' || v === '1' || v === true, z.boolean()),
  text: (max: number, min = 0) => z.string().trim().min(min).max(max),
  optText: (max: number) =>
    z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional()),
  nullableText: (max: number) =>
    z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable()),
  int: (min = 0, max = Number.MAX_SAFE_INTEGER) => z.coerce.number().int().min(min).max(max),
  optInt: (min = 0, max = Number.MAX_SAFE_INTEGER) =>
    z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(min).max(max).nullable()),
  /** Rupees in the form, paisa in the database. */
  rupees: z.preprocess((v) => (v === '' ? 0 : v), z.coerce.number().min(0).max(100_000_000)).transform((r) => Math.round(r * 100)),
  optRupees: z
    .preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).max(100_000_000).nullable())
    .transform((r) => (r === null ? null : Math.round(r * 100))),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  optDate: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')
    .max(140)
    .or(z.literal('')),
  species: z.enum(['DOG', 'CAT', 'BIRD', 'FISH', 'RABBIT', 'OTHER']),
};

export function adminPage(res: Response, title: string) {
  setSeo(res, { title: `${title} | Admin`, noindex: true });
  res.locals.pageTitle = title;
  res.set('Cache-Control', 'no-store');
}

export const backTo = (req: Request, fallback: string) => {
  const ref = req.get('Referer');
  return ref && new URL(ref, 'http://x').pathname.startsWith('/admin') ? ref : fallback;
};

export const qs = (req: Request, key: string) => (typeof req.query[key] === 'string' ? (req.query[key] as string).trim() : '');
