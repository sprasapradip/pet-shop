import type { Request, Response } from 'express';
import { setSeo } from '../../lib/seo.js';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { STAFF_ROLES } from '../../middleware/auth.js';
import { forgotSchema, loginSchema, registerSchema, resetSchema, safeNext } from './auth.schema.js';
import {
  authenticate,
  endSession,
  findValidReset,
  registerUser,
  requestPasswordReset,
  resetPassword,
  startSession,
} from './auth.service.js';

const authPage = (res: Response, title: string) => {
  setSeo(res, { title: `${title} | The Everest Kennel`, noindex: true });
  res.set('Cache-Control', 'no-store');
  res.locals.layout = 'layouts/auth';
};

export function loginPage(req: Request, res: Response) {
  authPage(res, 'Log in');
  res.render('auth/login', { next: safeNext(String(req.query.next ?? '')) ?? '' });
}

export async function loginSubmit(req: Request, res: Response) {
  const input = parse(loginSchema, req.body);
  const user = await authenticate(input.identifier, input.password);
  await startSession(req, user);
  const fallback = STAFF_ROLES.includes(user.role) ? '/admin' : '/account';
  res.redirect(303, safeNext(input.next) ?? fallback);
}

export function registerPage(req: Request, res: Response) {
  authPage(res, 'Create account');
  res.render('auth/register', { next: safeNext(String(req.query.next ?? '')) ?? '' });
}

export async function registerSubmit(req: Request, res: Response) {
  const input = parse(registerSchema, req.body);
  const user = await registerUser(input);
  await startSession(req, user);
  flash(req, 'success', `Welcome, ${user.name}! Add your pets to get vaccination reminders.`);
  res.redirect(303, safeNext(String(req.body.next ?? '')) ?? '/account');
}

export async function logout(req: Request, res: Response) {
  await endSession(req);
  res.clearCookie('ek.sid');
  res.redirect(303, '/');
}

export function forgotPage(_req: Request, res: Response) {
  authPage(res, 'Forgot password');
  res.render('auth/forgot');
}

export async function forgotSubmit(req: Request, res: Response) {
  const input = parse(forgotSchema, req.body);
  await requestPasswordReset(input.identifier);
  flash(req, 'success', 'If an account exists, we have sent a reset link by SMS and email. It is valid for 1 hour.');
  res.redirect(303, '/forgot-password');
}

export async function resetPage(req: Request, res: Response) {
  const token = String(req.params.token);
  const valid = !!(await findValidReset(token));
  authPage(res, 'Reset password');
  res.render('auth/reset', { token, valid });
}

export async function resetSubmit(req: Request, res: Response) {
  const input = parse(resetSchema, req.body);
  await resetPassword(String(req.params.token), input.password);
  flash(req, 'success', 'Your password was changed. Please log in.');
  res.redirect(303, '/login');
}
