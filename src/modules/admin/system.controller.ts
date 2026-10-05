import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { cache } from '../../lib/cache.js';
import { cleanHtml } from '../../lib/html.js';
import { hashPassword, passwordSchema } from '../../lib/password.js';
import { nepalPhone } from '../../lib/phone.js';
import { addDays, dateOnly, nptDate, toNpt } from '../../lib/dates.js';
import { pageMeta, pageParams, pageUrl } from '../../lib/pagination.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { getSettings, saveSettings } from '../settings/settings.service.js';
import { adminPage, f, qs } from './admin.helpers.js';

// ---------------- Settings ----------------

export async function settingsPage(_req: Request, res: Response) {
  const [settings, hours, blocked, services] = await Promise.all([
    getSettings(),
    prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
    prisma.blockedDate.findMany({ where: { date: { gte: dateOnly(nptDate()) } }, orderBy: { date: 'asc' } }),
    prisma.service.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  adminPage(res, 'Settings');
  res.render('admin/settings', { s: settings, hoursList: hours, blocked, services });
}

const lines = (v: unknown) =>
  String(v ?? '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

const businessSchema = z.object({
  mobile: f.text(30),
  whatsapp: z.string().trim().regex(/^\d{10,15}$/, 'WhatsApp number: digits only with country code, e.g. 9779812345678').or(z.literal('')),
  email: z.string().trim().email().or(z.literal('')),
  geoLat: z.coerce.number().min(26).max(31),
  geoLng: z.coerce.number().min(80).max(89),
  mapEmbedUrl: z.string().trim().url().startsWith('https://www.google.com/').or(z.literal('')),
  socialLinks: z.preprocess(lines, z.array(z.string().url()).max(10)),
  googleRating: z.coerce.number().min(0).max(5),
  googleReviewCount: f.int(0, 1_000_000),
  googleReviewUrl: z.string().trim().url().or(z.literal('')),
  vetName: f.text(120),
  vetRegistrationNo: f.text(60),
});

const deliverySchema = z.object({
  ringRoadPaisa: f.rupees,
  valleyPaisa: f.rupees,
  outsideBasePaisa: f.rupees,
  outsidePerKgPaisa: f.rupees,
  freeAbovePaisa: f.rupees,
});

const seoSchema = z.object({
  defaultTitle: f.text(70, 10),
  defaultDescription: f.text(160, 20),
  ogImage: f.text(255, 1),
});

const homeSchema = z.object({ heroTitle: f.text(120, 5), heroSubtitle: f.text(300, 5), announcement: f.text(200) });
const paymentsSchema = z.object({ esewaEnabled: f.bool, khaltiEnabled: f.bool, codEnabled: f.bool });

export async function settingsSave(req: Request, res: Response) {
  const section = String(req.params.section);
  const before = await getSettings();
  switch (section) {
    case 'business':
      await saveSettings('business', parse(businessSchema, req.body));
      break;
    case 'delivery':
      await saveSettings('delivery', parse(deliverySchema, req.body));
      break;
    case 'seo':
      await saveSettings('seo', parse(seoSchema, req.body));
      break;
    case 'home':
      await saveSettings('home', parse(homeSchema, req.body));
      break;
    case 'payments':
      await saveSettings('payments', parse(paymentsSchema, req.body));
      break;
    default:
      throw notFound('Settings section');
  }
  const after = await getSettings();
  await audit(req, 'update', 'Setting', section, before[section as keyof typeof before], after[section as keyof typeof after]);
  flash(req, 'success', 'Settings saved.');
  res.redirect(303, `/admin/settings#${section}`);
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function hoursSave(req: Request, res: Response) {
  const rows = Array.from({ length: 7 }, (_, d) => ({
    weekday: d,
    opensAt: String(req.body[`opens_${d}`] ?? '09:00'),
    closesAt: String(req.body[`closes_${d}`] ?? '18:00'),
    isClosed: req.body[`closed_${d}`] === 'on',
  }));
  for (const r of rows) {
    if (!timeRe.test(r.opensAt) || !timeRe.test(r.closesAt) || (!r.isClosed && r.closesAt <= r.opensAt)) {
      throw new AppError(422, 'validation_error', 'Each open day needs a valid opening and closing time (HH:MM, closing after opening)');
    }
  }
  const before = await prisma.businessHour.findMany();
  await prisma.$transaction(
    rows.map((r) => prisma.businessHour.upsert({ where: { weekday: r.weekday }, create: r, update: r })),
  );
  cache.forget('settings:');
  await audit(req, 'update', 'BusinessHour', null, before, rows);
  flash(req, 'success', 'Opening hours saved.');
  res.redirect(303, '/admin/settings#hours');
}

export async function blockedDateAdd(req: Request, res: Response) {
  const input = parse(z.object({ date: f.date, reason: f.nullableText(120) }), req.body);
  const row = await prisma.blockedDate.upsert({
    where: { date: dateOnly(input.date) },
    create: { date: dateOnly(input.date), reason: input.reason },
    update: { reason: input.reason },
  });
  await audit(req, 'create', 'BlockedDate', row.id, null, row);
  flash(req, 'success', `${input.date} blocked for bookings.`);
  res.redirect(303, '/admin/settings#hours');
}

export async function blockedDateDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const row = await prisma.blockedDate.findUnique({ where: { id } });
  if (row) {
    await prisma.blockedDate.delete({ where: { id } });
    await audit(req, 'delete', 'BlockedDate', id, row, null);
  }
  res.redirect(303, '/admin/settings#hours');
}

const serviceSchema = z.object({
  name: f.text(120, 2),
  shortDesc: f.text(300, 5),
  content: f.nullableText(20_000),
  included: z.preprocess(lines, z.array(z.string().max(200)).max(20)),
  basePricePaisa: f.optRupees,
  durationMinutes: f.int(10, 24 * 60),
  slotCapacity: f.int(1, 100),
  leadMinutes: f.int(0, 14 * 24 * 60),
  advancePaisa: f.rupees,
  sortOrder: f.int(0, 100),
  isActive: f.bool,
  metaTitle: f.nullableText(70),
  metaDesc: f.nullableText(160),
});

export async function serviceForm(req: Request, res: Response) {
  const service = await prisma.service.findUnique({ where: { id: intParam(req.params.id) } });
  if (!service) throw notFound('Service');
  const faqs = await prisma.faq.findMany({ where: { group: `service:${service.type}` }, orderBy: { sortOrder: 'asc' } });
  adminPage(res, `Service: ${service.name}`);
  res.render('admin/service-form', { service, faqs });
}

export async function serviceSave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const before = await prisma.service.findUnique({ where: { id } });
  if (!before) throw notFound('Service');
  const data = parse(serviceSchema, req.body);
  const after = await prisma.service.update({
    where: { id },
    data: { ...data, content: data.content ? cleanHtml(data.content) : null, included: data.included },
  });
  await audit(req, 'update', 'Service', id, before, after);
  flash(req, 'success', 'Service saved.');
  res.redirect(303, `/admin/services/${id}`);
}

// ---------------- Users (staff) ----------------

const userCreateSchema = z.object({
  name: f.text(120, 2),
  phone: nepalPhone,
  email: z.string().trim().toLowerCase().email().or(z.literal('')).transform((v) => v || null),
  role: z.enum(['CUSTOMER', 'STAFF', 'VET', 'ADMIN']),
  password: passwordSchema,
});

export async function usersIndex(req: Request, res: Response) {
  const role = qs(req, 'role');
  const users = await prisma.user.findMany({
    where: { deletedAt: null, ...(role ? { role: role as never } : { role: { in: ['STAFF', 'VET', 'ADMIN'] } }) },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  adminPage(res, 'Users');
  res.render('admin/users', { users, role });
}

export async function userCreate(req: Request, res: Response) {
  const input = parse(userCreateSchema, req.body);
  const user = await prisma.user.create({
    data: { name: input.name, phone: input.phone, email: input.email, role: input.role, passwordHash: await hashPassword(input.password) },
  });
  await audit(req, 'create', 'User', user.id, null, { name: user.name, role: user.role });
  flash(req, 'success', `${user.name} added as ${user.role}.`);
  res.redirect(303, '/admin/users');
}

export async function userUpdate(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const input = parse(z.object({ role: z.enum(['CUSTOMER', 'STAFF', 'VET', 'ADMIN']), isActive: f.bool }), req.body);
  if (id === req.session.user!.id && (input.role !== 'ADMIN' || !input.isActive)) {
    throw new AppError(422, 'validation_error', 'You cannot remove your own admin access');
  }
  const before = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  if (!before) throw notFound('User');
  await prisma.user.update({ where: { id }, data: input });
  // Role changes take effect on the user's next login; deactivated users are blocked at login.
  await audit(req, 'update', 'User', id, before, input);
  flash(req, 'success', 'User updated.');
  res.redirect(303, '/admin/users');
}

// ---------------- Reports ----------------

const PAID = ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

export async function reports(req: Request, res: Response) {
  const today = nptDate();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(qs(req, 'from')) ? qs(req, 'from') : addDays(today, -29);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(qs(req, 'to')) ? qs(req, 'to') : today;
  const range = { gte: toNpt(from), lt: toNpt(addDays(to, 1)) };

  const [orders, topItems, bookings, byMethod] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: range, status: { in: [...PAID] } }, select: { createdAt: true, totalPaisa: true, deliveryPaisa: true } }),
    prisma.orderItem.groupBy({
      by: ['sku', 'name'],
      where: { order: { createdAt: range, status: { in: [...PAID] } } },
      _sum: { quantity: true, totalPaisa: true },
      orderBy: { _sum: { totalPaisa: 'desc' } },
      take: 15,
    }),
    prisma.booking.findMany({
      where: { startAt: range, status: { notIn: ['CANCELLED'] } },
      select: { status: true, pricePaisa: true, paidPaisa: true, service: { select: { name: true } } },
    }),
    prisma.order.groupBy({
      by: ['paymentMethod'],
      where: { createdAt: range, status: { in: [...PAID] } },
      _sum: { totalPaisa: true },
      _count: { _all: true },
    }),
  ]);

  const daily = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) daily.set(d, 0);
  for (const o of orders) {
    const d = nptDate(o.createdAt);
    daily.set(d, (daily.get(d) ?? 0) + o.totalPaisa);
  }

  const services = new Map<string, { name: string; count: number; completed: number; revenue: number }>();
  for (const b of bookings) {
    const s = services.get(b.service.name) ?? { name: b.service.name, count: 0, completed: 0, revenue: 0 };
    s.count++;
    if (b.status === 'COMPLETED') {
      s.completed++;
      s.revenue += b.pricePaisa ?? b.paidPaisa;
    }
    services.set(b.service.name, s);
  }

  if (req.query.format === 'csv') {
    const rows = [...daily.entries()].map(([date, paisa]) => `${date},${paisa / 100}`);
    return res
      .type('text/csv')
      .set('Content-Disposition', `attachment; filename="sales-${from}-to-${to}.csv"`)
      .send(`date,sales_npr\r\n${rows.join('\r\n')}\r\n`);
  }

  adminPage(res, 'Reports');
  return res.render('admin/reports', {
    from,
    to,
    totals: {
      sales: orders.reduce((s, o) => s + o.totalPaisa, 0),
      orders: orders.length,
      delivery: orders.reduce((s, o) => s + o.deliveryPaisa, 0),
      serviceRevenue: [...services.values()].reduce((s, x) => s + x.revenue, 0),
    },
    daily: [...daily.entries()].map(([date, paisa]) => ({ date, paisa })),
    topItems,
    services: [...services.values()].sort((a, b) => b.count - a.count),
    byMethod,
  });
}

// ---------------- Audit log ----------------

export async function auditLog(req: Request, res: Response) {
  const entity = qs(req, 'entity');
  const userId = intParam(req.query.user);
  const { page, take, skip } = pageParams(req.query.page, 50, 10_000);
  const where: Prisma.AuditLogWhereInput = { ...(entity ? { entity } : {}), ...(userId ? { userId } : {}) };
  const [total, logs, entities] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
  ]);
  adminPage(res, 'Audit log');
  res.render('admin/audit', {
    logs,
    entities: entities.map((e) => e.entity),
    filters: { entity, userId },
    meta: pageMeta(total, page, 50),
    pageLink: (p: number) => pageUrl('/admin/audit-log', req.query as Record<string, unknown>, p),
  });
}
