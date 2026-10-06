import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { BUSINESS, BOOKING_STATUS_LABELS, ORDER_STATUS_LABELS, SPECIES_LABELS } from '../config/constants.js';
import { formatNpr, rupeeString } from '../lib/money.js';
import { ageFrom, formatDate, formatDateTime, formatDay, isoDay, nptDate, nptTime, weekdayOf } from '../lib/dates.js';
import { jsonLd } from '../lib/seo.js';
import { icon } from '../lib/icons.js';
import { getBusinessHours, getSettings } from '../modules/settings/settings.service.js';
import { cartCount } from '../modules/cart/cart.service.js';
import { STAFF_ROLES } from './auth.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** `<img>` attributes for an uploaded image path (stored without size suffix). */
function imgSrc(stored: string | null | undefined, width: 400 | 800 | 1200 = 800) {
  if (!stored) return '/assets/img/placeholder.svg';
  if (stored.startsWith('http') || stored.startsWith('/')) return stored;
  return `/${stored}-${width}.webp`;
}

function imgSrcset(stored: string | null | undefined) {
  if (!stored || stored.startsWith('http') || stored.startsWith('/')) return '';
  return `/${stored}-400.webp 400w, /${stored}-800.webp 800w, /${stored}-1200.webp 1200w`;
}

export const locals: RequestHandler = async (req, res, next) => {
  const [settings, hours] = await Promise.all([getSettings(), getBusinessHours()]);
  const user = req.session.user;

  // Flash data is shown once.
  const flash = req.session.flash ?? {};
  const fieldErrors = req.session.flashErrors ?? [];
  const old = req.session.old ?? {};
  if (req.session.flash || req.session.flashErrors || req.session.old) {
    delete req.session.flash;
    delete req.session.flashErrors;
    delete req.session.old;
  }

  const whatsappNumber = (settings.business.whatsapp || env.WHATSAPP_NUMBER).replace(/\D/g, '');

  Object.assign(res.locals, {
    env: { appUrl: env.APP_URL, isProd: env.NODE_ENV === 'production' },
    baseUrl: env.APP_URL,
    business: BUSINESS,
    settings,
    hours,
    weekdays: WEEKDAYS,
    todayWeekday: weekdayOf(nptDate()),
    user,
    isStaff: !!user && STAFF_ROLES.includes(user.role),
    isAdmin: user?.role === 'ADMIN',
    currentPath: req.path,
    query: req.query,
    flash,
    fieldErrors,
    old,
    cartCount: await cartCount(req.session.cartToken),
    seo: {
      title: settings.seo.defaultTitle,
      description: settings.seo.defaultDescription,
      canonical: `${env.APP_URL}${req.path === '/' ? '/' : req.path}`,
      ogImage: settings.seo.ogImage,
      noindex: false,
    },
    // View helpers
    formatNpr,
    rupeeString,
    formatDate,
    formatDay,
    formatDateTime,
    nptTime,
    isoDay,
    ageFrom,
    jsonLd,
    icon,
    imgSrc,
    imgSrcset,
    speciesLabel: (s: string | null | undefined) => (s ? (SPECIES_LABELS[s] ?? s) : ''),
    orderStatusLabel: (s: string) => ORDER_STATUS_LABELS[s] ?? s,
    bookingStatusLabel: (s: string) => BOOKING_STATUS_LABELS[s] ?? s,
    titleCase: (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    fieldError: (name: string) => fieldErrors.find((e) => e.field === name)?.message,
    oldValue: (name: string, fallback: unknown = '') => (old[name] ?? fallback) as string,
    whatsappLink: (message = `Hello ${BUSINESS.name}, I have a question.`) =>
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
    telLink: (num: string = BUSINESS.landline) => `tel:${num.replace(/[^\d+]/g, '')}`,
    formTs: () => Date.now().toString(36),
    isActive: (prefix: string) => (prefix === '/' ? req.path === '/' : req.path.startsWith(prefix)),
  });
  next();
};
