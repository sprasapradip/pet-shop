import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { isTest } from '../config/env.js';

const MIN_SECONDS = 3;

/**
 * Honeypot plus minimum fill time for public forms. Forms include the `form-guard` partial,
 * which renders a hidden `website` field and the render timestamp `_ts`.
 */
export const antiSpam: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  if (body.website) return next(new AppError(422, 'spam', 'Your message could not be sent.'));
  if (!isTest) {
    const ts = Number.parseInt(body._ts ?? '', 36);
    const age = (Date.now() - ts) / 1000;
    if (!Number.isFinite(age) || age < MIN_SECONDS || age > 86_400) {
      return next(new AppError(422, 'too_fast', 'Please take a moment to check the form and submit again.'));
    }
  }
  return next();
};
