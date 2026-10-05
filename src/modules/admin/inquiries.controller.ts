import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { pageMeta, pageParams, pageUrl } from '../../lib/pagination.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { INQUIRY_STATUSES } from '../inquiries/inquiry.service.js';
import { adminPage, f, qs } from './admin.helpers.js';

const TYPES = ['CONTACT', 'PET_SELL_OFFER', 'PET_BUY_REQUEST', 'MATING_REQUEST', 'SHELTER_REPORT', 'STOCK_NOTIFY'];

export async function inquiriesIndex(req: Request, res: Response) {
  const type = TYPES.includes(qs(req, 'type')) ? qs(req, 'type') : '';
  const status = qs(req, 'status') || 'open';
  const { page, take, skip } = pageParams(req.query.page, 40, 10_000);
  const where: Prisma.InquiryWhereInput = {
    ...(type ? { type: type as never } : {}),
    ...(status === 'open' ? { status: { in: ['NEW', 'IN_PROGRESS'] } } : status === 'all' ? {} : { status }),
  };
  const [total, inquiries, counts] = await Promise.all([
    prisma.inquiry.count({ where }),
    prisma.inquiry.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.inquiry.groupBy({ by: ['type'], where: { status: 'NEW' }, _count: { _all: true } }),
  ]);
  adminPage(res, 'Inquiries');
  res.render('admin/inquiries/index', {
    inquiries,
    types: TYPES,
    statuses: INQUIRY_STATUSES,
    filters: { type, status },
    counts: Object.fromEntries(counts.map((c) => [c.type, c._count._all])),
    meta: pageMeta(total, page, 40),
    pageLink: (p: number) => pageUrl('/admin/inquiries', req.query as Record<string, unknown>, p),
  });
}

export async function inquiryDetail(req: Request, res: Response) {
  const inquiry = await prisma.inquiry.findUnique({ where: { id: intParam(req.params.id) } });
  if (!inquiry) throw notFound('Inquiry');
  const meta = (inquiry.meta ?? {}) as Record<string, unknown>;
  const history = await prisma.inquiry.findMany({
    where: { phone: inquiry.phone, id: { not: inquiry.id } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  adminPage(res, `Inquiry #${inquiry.id}`);
  res.render('admin/inquiries/detail', { inquiry, meta, history, statuses: INQUIRY_STATUSES });
}

export async function inquiryStatus(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const { status } = parse(z.object({ status: z.enum(INQUIRY_STATUSES) }), req.body);
  const before = await prisma.inquiry.findUnique({ where: { id } });
  if (!before) throw notFound('Inquiry');
  await prisma.inquiry.update({ where: { id }, data: { status } });
  await audit(req, 'status', 'Inquiry', id, { status: before.status }, { status });
  flash(req, 'success', 'Inquiry updated.');
  res.redirect(303, `/admin/inquiries/${id}`);
}

// ---------------- Customers ----------------

export async function customersIndex(req: Request, res: Response) {
  const q = qs(req, 'q');
  const { page, take, skip } = pageParams(req.query.page, 40, 10_000);
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] } : {}),
  };
  const [total, customers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { _count: { select: { orders: true, bookings: true, pets: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  adminPage(res, 'Customers');
  res.render('admin/customers/index', {
    customers,
    q,
    meta: pageMeta(total, page, 40),
    pageLink: (p: number) => pageUrl('/admin/customers', req.query as Record<string, unknown>, p),
  });
}

export async function customerDetail(req: Request, res: Response) {
  const customer = await prisma.user.findFirst({
    where: { id: intParam(req.params.id) },
    include: {
      pets: { include: { breed: true } },
      orders: { orderBy: { createdAt: 'desc' }, take: 20 },
      bookings: { include: { service: true }, orderBy: { startAt: 'desc' }, take: 20 },
      addresses: true,
    },
  });
  if (!customer) throw notFound('Customer');
  const [spent, guestOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { userId: customer.id, status: { in: ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } },
      _sum: { totalPaisa: true },
    }),
    prisma.order.count({ where: { userId: null, customerPhone: customer.phone } }),
  ]);
  adminPage(res, customer.name);
  res.render('admin/customers/detail', { customer, spent: spent._sum.totalPaisa ?? 0, guestOrders });
}

export async function customerNotes(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const { adminNotes } = parse(z.object({ adminNotes: f.nullableText(5000) }), req.body);
  const before = await prisma.user.findUnique({ where: { id }, select: { adminNotes: true } });
  if (!before) throw notFound('Customer');
  await prisma.user.update({ where: { id }, data: { adminNotes } });
  await audit(req, 'notes', 'User', id, before, { adminNotes });
  flash(req, 'success', 'Notes saved.');
  res.redirect(303, `/admin/customers/${id}`);
}
