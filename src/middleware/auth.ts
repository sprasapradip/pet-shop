import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';

export interface FlashMessages {
  success?: string[];
  error?: string[];
  info?: string[];
}

declare module 'express-session' {
  interface SessionData {
    user?: { id: number; name: string; role: Role };
    cartToken?: string;
    verifiedPhone?: string;
    flash?: FlashMessages;
    flashErrors?: { field: string; message: string }[];
    old?: Record<string, unknown>;
    /** Orders/bookings created in this session, so guests can view their confirmation pages. */
    recentOrders?: string[];
    recentBookings?: string[];
    /** Guest booking waiting for OTP verification (no-JS flow). */
    pendingBooking?: Record<string, unknown>;
  }
}

export const STAFF_ROLES: Role[] = ['STAFF', 'VET', 'ADMIN'];

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: { code: 'unauthenticated', message: 'Login required' } });
  }
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (!roles.includes(user.role)) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ error: { code: 'forbidden', message: 'You do not have access to this resource' } });
      }
      return res.status(403).render('errors/403', { layout: 'layouts/main', seo: { title: 'Access denied', noindex: true } });
    }
    return next();
  };

export const requireStaff = requireRole(...STAFF_ROLES);
export const requireAdmin = requireRole('ADMIN');

export const redirectIfAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session.user) return next();
  return res.redirect(STAFF_ROLES.includes(req.session.user.role) ? '/admin' : '/account');
};
