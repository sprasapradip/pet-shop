import rateLimit, { type Options } from 'express-rate-limit';
import { isTest } from '../config/env.js';

const handler: Options['handler'] = (req, res, _next, options) => {
  if (req.originalUrl.startsWith('/api/') || req.accepts(['html', 'json']) === 'json') {
    return res
      .status(options.statusCode)
      .json({ error: { code: 'rate_limited', message: 'Too many requests. Please wait a little and try again.' } });
  }
  return res.status(options.statusCode).render('errors/429', { seo: { title: 'Too many requests', noindex: true } });
};

const make = (windowMs: number, limit: number, skipInTest = true) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
    skip: () => skipInTest && isTest,
  });

export const globalLimiter = make(60_000, 300);
export const authLimiter = make(15 * 60_000, 10);
export const formLimiter = make(60 * 60_000, 15);
export const otpLimiter = make(60 * 60_000, 5);
