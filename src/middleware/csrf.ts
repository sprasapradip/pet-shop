import { doubleCsrf } from 'csrf-csrf';
import type { Request, RequestHandler } from 'express';
import { env, isProd } from '../config/env.js';

const { doubleCsrfProtection, generateToken, validateRequest, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  cookieName: isProd ? '__Host-ek.csrf' : 'ek.csrf',
  cookieOptions: { sameSite: 'lax', secure: isProd, httpOnly: true, path: '/' },
  getTokenFromRequest: (req) => (req.body?._csrf as string) ?? (req.headers['x-csrf-token'] as string),
});

const isMultipart = (req: Request) => (req.headers['content-type'] ?? '').startsWith('multipart/form-data');

/**
 * Issues a token for every request and validates state changing requests.
 * Multipart bodies are not parsed yet at this point, so their check is deferred to
 * `verifyCsrfAfterUpload`, which the upload middleware always runs right after multer.
 */
export const csrfProtection: RequestHandler = (req, res, next) => {
  res.locals.csrfToken = generateToken(req, res);
  if (isMultipart(req) && req.method === 'POST') {
    (req as Request & { csrfDeferred?: boolean }).csrfDeferred = true;
    return next();
  }
  return doubleCsrfProtection(req, res, next);
};

export const verifyCsrfAfterUpload: RequestHandler = (req, _res, next) => {
  if (!validateRequest(req)) return next(invalidCsrfTokenError);
  (req as Request & { csrfDeferred?: boolean }).csrfDeferred = false;
  return next();
};

/** Guard for multipart routes that do not upload files. */
export const assertCsrfChecked: RequestHandler = (req, _res, next) => {
  if ((req as Request & { csrfDeferred?: boolean }).csrfDeferred) return next(invalidCsrfTokenError);
  return next();
};
