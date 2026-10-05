import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { notifyOrderStatus } from '../../lib/notify.js';
import { pageMeta, pageParams, pageUrl } from '../../lib/pagination.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { ORDER_STATUS_LABELS } from '../../config/constants.js';
import { orderStatusSchema } from '../orders/order.schema.js';
import { allowedNextStatuses, updateOrderStatus } from '../orders/order.service.js';
import { adminPage, qs } from './admin.helpers.js';

export async function ordersIndex(req: Request, res: Response) {
  const status = qs(req, 'status');
  const q = qs(req, 'q');
  const method = qs(req, 'method');
  const { page, take, skip } = pageParams(req.query.page, 30, 10_000);
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status: status as never } : {}),
    ...(method ? { paymentMethod: method as never } : {}),
    ...(q ? { OR: [{ orderNo: { contains: q } }, { customerPhone: { contains: q } }, { customerName: { contains: q } }] } : {}),
  };
  const [total, orders, counts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { _count: { select: { items: true } } } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  adminPage(res, 'Orders');
  res.render('admin/orders/index', {
    orders,
    filters: { status, q, method },
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    statuses: Object.keys(ORDER_STATUS_LABELS),
    meta: pageMeta(total, page, 30),
    pageLink: (p: number) => pageUrl('/admin/orders', req.query as Record<string, unknown>, p),
  });
}

export async function orderDetail(req: Request, res: Response) {
  const order = await prisma.order.findUnique({
    where: { id: intParam(req.params.id) },
    include: {
      items: { include: { variant: { include: { product: { select: { id: true, slug: true } } } } } },
      events: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!order) throw notFound('Order');
  adminPage(res, `Order ${order.orderNo}`);
  res.render('admin/orders/detail', { order, nextStatuses: allowedNextStatuses(order.status) });
}

export async function orderStatus(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const input = parse(orderStatusSchema, req.body);
  const before = await prisma.order.findUnique({ where: { id } });
  if (!before) throw notFound('Order');
  const after = await updateOrderStatus(id, input.status, input.note, req.session.user!.id);
  await audit(req, 'status', 'Order', id, { status: before.status }, { status: after.status, note: input.note });
  if (before.status !== after.status && req.body.notify === 'on') void notifyOrderStatus(after, ORDER_STATUS_LABELS[after.status] ?? after.status);
  flash(req, 'success', `Order moved to ${ORDER_STATUS_LABELS[after.status]}.`);
  res.redirect(303, `/admin/orders/${id}`);
}

/** COD reconciliation: rider handed over the cash. */
export async function orderCodCollected(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw notFound('Order');
  const collected = req.body.collected === '1';
  await prisma.$transaction([
    prisma.order.update({ where: { id }, data: { codCollected: collected } }),
    prisma.orderEvent.create({ data: { orderId: id, status: order.status, note: collected ? 'COD cash collected' : 'COD collection reverted' } }),
  ]);
  await audit(req, 'cod_collected', 'Order', id, { codCollected: order.codCollected }, { codCollected: collected });
  flash(req, 'success', collected ? 'Marked cash as collected.' : 'Cash collection reverted.');
  res.redirect(303, `/admin/orders/${id}`);
}

export async function orderNote(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw notFound('Order');
  const note = String(req.body.note ?? '').trim().slice(0, 255);
  if (note) {
    await prisma.orderEvent.create({ data: { orderId: id, status: order.status, note } });
    await audit(req, 'note', 'Order', id, null, { note });
  }
  res.redirect(303, `/admin/orders/${id}`);
}

export async function codReport(req: Request, res: Response) {
  const orders = await prisma.order.findMany({
    where: { paymentMethod: 'COD', status: 'DELIVERED', codCollected: false },
    orderBy: { updatedAt: 'asc' },
  });
  adminPage(res, 'COD to collect');
  res.render('admin/orders/cod', { orders, total: orders.reduce((s, o) => s + o.totalPaisa, 0) });
}
