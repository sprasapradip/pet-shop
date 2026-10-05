import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { setSeo } from '../../lib/seo.js';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { notifyNewOrder } from '../../lib/notify.js';
import { hasRecent, pushRecent } from '../../lib/session-helpers.js';
import { DELIVERY_ZONES } from '../../config/constants.js';
import { checkoutSchema } from './order.schema.js';
import { createOrder, getOrderByNo, quote } from './order.service.js';
import { startPayment, type PaymentStart } from '../payments/payment.service.js';

const zoneSchema = z.enum(['RING_ROAD', 'VALLEY', 'OUTSIDE']).catch('RING_ROAD');

export function renderPaymentStart(res: Response, start: PaymentStart, label: string) {
  if (start.type === 'redirect') return res.redirect(303, start.url);
  setSeo(res, { title: 'Redirecting to eSewa', noindex: true });
  return res.render('payments/redirect', { start, label });
}

export async function checkoutPage(req: Request, res: Response) {
  const zone = zoneSchema.parse(req.query.zone ?? res.locals.old?.deliveryZone);
  const summary = await quote(req.session.cartToken, zone);
  if (!summary.items.length) {
    flash(req, 'info', 'Your cart is empty.');
    return res.redirect(303, '/cart');
  }
  const userId = req.session.user?.id;
  const [user, addresses] = userId
    ? await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true, email: true } }),
        prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }),
      ])
    : [null, []];

  setSeo(res, { title: 'Checkout | The Everest Kennel', noindex: true });
  res.set('Cache-Control', 'no-store');
  return res.render('shop/checkout', { summary, zone, zones: DELIVERY_ZONES, profile: user, addresses });
}

export async function checkoutSubmit(req: Request, res: Response) {
  const input = parse(checkoutSchema, req.body);
  const order = await createOrder(req.session.cartToken, input, req.session.user?.id);
  pushRecent(req, 'recentOrders', order.orderNo);

  if (order.paymentMethod === 'COD') {
    void notifyNewOrder(order);
    return res.redirect(303, `/checkout/success?order=${order.orderNo}`);
  }

  const start = await startPayment({
    kind: 'order',
    targetId: order.id,
    gateway: order.paymentMethod,
    amountPaisa: order.totalPaisa,
    name: `Order ${order.orderNo}`,
    customer: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail },
    userId: req.session.user?.id,
  });
  return renderPaymentStart(res, start, `order ${order.orderNo}`);
}

async function ownedOrder(req: Request) {
  const orderNo = String(req.query.order ?? req.params.orderNo ?? '');
  const order = await getOrderByNo(orderNo);
  const userId = req.session.user?.id;
  if (!order || !((userId && order.userId === userId) || hasRecent(req, 'recentOrders', orderNo))) throw notFound('Order');
  return order;
}

export async function checkoutSuccess(req: Request, res: Response) {
  const order = await ownedOrder(req);
  setSeo(res, { title: 'Thank you for your order', noindex: true });
  res.set('Cache-Control', 'no-store');
  res.render('shop/success', { order });
}

export async function checkoutFailed(req: Request, res: Response) {
  const order = await ownedOrder(req);
  setSeo(res, { title: 'Payment not completed', noindex: true });
  res.set('Cache-Control', 'no-store');
  res.render('shop/failed', { order });
}

/** Retry payment for an unpaid online order, optionally with another gateway or switching to COD. */
export async function retryPayment(req: Request, res: Response) {
  const order = await ownedOrder(req);
  if (order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELLED') {
    flash(req, 'info', 'This order is already paid or being processed.');
    return res.redirect(303, `/checkout/success?order=${order.orderNo}`);
  }
  if (order.status === 'CANCELLED') throw new AppError(422, 'expired', 'This order expired. Please place it again from your cart.');
  const gateway = z.enum(['ESEWA', 'KHALTI']).parse(req.body.gateway);
  await prisma.order.update({ where: { id: order.id }, data: { paymentMethod: gateway } });
  const start = await startPayment({
    kind: 'order',
    targetId: order.id,
    gateway,
    amountPaisa: order.totalPaisa,
    name: `Order ${order.orderNo}`,
    customer: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail },
    userId: req.session.user?.id,
  });
  return renderPaymentStart(res, start, `order ${order.orderNo}`);
}

export async function apiQuote(req: Request, res: Response) {
  const zone = zoneSchema.parse(req.query.zone);
  const q = await quote(req.session.cartToken, zone);
  res.set('Cache-Control', 'no-store').json({
    data: { zone, subtotalPaisa: q.subtotalPaisa, deliveryPaisa: q.deliveryPaisa, totalPaisa: q.totalPaisa },
  });
}
