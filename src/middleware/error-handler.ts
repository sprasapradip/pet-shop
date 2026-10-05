import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { flash, rememberInput } from '../lib/flash.js';

const wantsJson = (req: Parameters<RequestHandler>[0]) =>
  req.originalUrl.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';

export const notFoundHandler: RequestHandler = (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
  }
  return res.status(404).render('errors/404', { seo: { title: 'Page not found', noindex: true } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appErr: AppError;

  if (err instanceof AppError) appErr = err;
  else if (err?.code === 'EBADCSRFTOKEN' || err?.message === 'invalid csrf token')
    appErr = new AppError(403, 'csrf_invalid', 'Your session expired. Please refresh the page and try again.');
  else if (err instanceof multer.MulterError)
    appErr = new AppError(
      422,
      'invalid_file',
      err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be smaller than the upload limit' : 'Too many files or invalid upload',
    );
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
    appErr = new AppError(409, 'duplicate', 'This record already exists');
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')
    appErr = new AppError(404, 'not_found', 'Record not found');
  else if (err?.type === 'entity.too.large') appErr = new AppError(413, 'too_large', 'Request is too large');
  else {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'Unhandled error');
    appErr = new AppError(500, 'internal_error', 'Something went wrong. Please try again.');
  }

  if (res.headersSent) return;

  if (wantsJson(req)) {
    return res.status(appErr.status).json({ error: { code: appErr.code, message: appErr.message, details: appErr.details } });
  }

  // Form posts: send the user back to the form with messages and their input.
  if (req.method === 'POST' && [409, 422, 413].includes(appErr.status) && req.session) {
    if (appErr.status === 422 && Array.isArray(appErr.details)) {
      req.session.flashErrors = appErr.details as { field: string; message: string }[];
    }
    flash(req, 'error', appErr.message);
    rememberInput(req);
    return res.redirect(303, req.get('Referer') ?? '/');
  }

  if (appErr.status === 403) {
    return res.status(403).render('errors/403', { message: appErr.message, seo: { title: 'Access denied', noindex: true } });
  }

  return res
    .status(appErr.status)
    .render(appErr.status === 404 ? 'errors/404' : 'errors/500', {
      message: appErr.message,
      seo: { title: appErr.status === 404 ? 'Page not found' : 'Error', noindex: true },
    });
};
