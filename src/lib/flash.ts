import type { Request } from 'express';
import type { FlashMessages } from '../middleware/auth.js';

export function flash(req: Request, type: keyof FlashMessages, message: string) {
  const f = (req.session.flash ??= {});
  (f[type] ??= []).push(message);
}

/** Stores submitted values (minus secrets) so a redirected form can be refilled. */
export function rememberInput(req: Request) {
  const body = { ...(req.body as Record<string, unknown>) };
  for (const k of ['password', 'passwordConfirm', 'currentPassword', '_csrf', 'otp', 'website', '_ts']) delete body[k];
  req.session.old = body;
}
