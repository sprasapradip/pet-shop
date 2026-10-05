import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { verifyCsrfAfterUpload } from './csrf.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const IMAGE_WIDTHS = [400, 800, 1200] as const;
export const UPLOAD_ROOT = path.resolve('public/uploads');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 6, fields: 80 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new AppError(422, 'invalid_file', 'Only JPG, PNG or WebP images')),
});

/** Saves each image as 400/800/1200 px WebP (EXIF stripped). Returns paths like `uploads/pets/2026-10/<uuid>`. */
export async function saveImages(files: Express.Multer.File[], folder: string): Promise<string[]> {
  const dir = path.join(UPLOAD_ROOT, folder, new Date().toISOString().slice(0, 7));
  await fs.mkdir(dir, { recursive: true });

  const saved: string[] = [];
  for (const file of files) {
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer).metadata(); // throws on non image content
    } catch {
      throw new AppError(422, 'invalid_file', `${file.originalname} is not a valid image`);
    }
    if (!meta.width) throw new AppError(422, 'invalid_file', 'Invalid image');
    const base = randomUUID();
    await Promise.all(
      IMAGE_WIDTHS.map((w) =>
        sharp(file.buffer)
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(path.join(dir, `${base}-${w}.webp`)),
      ),
    );
    saved.push(path.relative(path.resolve('public'), path.join(dir, base)).replaceAll('\\', '/'));
  }
  return saved;
}

/** Deletes all size variants of a stored image path. Ignores missing files. */
export async function deleteImage(storedPath: string | null | undefined) {
  if (!storedPath || !storedPath.startsWith('uploads/')) return;
  const base = path.resolve('public', storedPath);
  if (!base.startsWith(UPLOAD_ROOT)) return;
  await Promise.all(IMAGE_WIDTHS.map((w) => fs.rm(`${base}-${w}.webp`, { force: true })));
}

/**
 * Multer + CSRF check + Sharp processing in one chain, so CSRF is never skipped on upload routes.
 * Processed paths are available as `req.uploadedImages`.
 */
export function uploadImages(field: string, folder: string, maxCount = 6): RequestHandler[] {
  const process: RequestHandler = async (req, _res, next) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    (req as Request & { uploadedImages: string[] }).uploadedImages = files.length ? await saveImages(files, folder) : [];
    next();
  };
  return [imageUpload.array(field, maxCount), verifyCsrfAfterUpload, process];
}

const csvMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    /\.csv$/i.test(file.originalname) ? cb(null, true) : cb(new AppError(422, 'invalid_file', 'Upload a .csv file')),
});

/** Single CSV file upload (admin import), CSRF verified after parsing. */
export const uploadCsv = (field = 'file'): RequestHandler[] => [csvMulter.single(field), verifyCsrfAfterUpload];

export const uploadedImages =(req: Request) => (req as Request & { uploadedImages?: string[] }).uploadedImages ?? [];
