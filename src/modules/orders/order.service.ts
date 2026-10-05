import { Prisma, type OrderStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { withTxRetry } from '../../lib/tx.js';
import { cache } from '../../lib/cache.js';
import { getSettings } from '../settings/settings.service.js';
import { getCart, summarizeCart } from '../cart/cart.service.js';
import { deliveryFee } from './delivery.js';
import type { CheckoutInput } from './order.schema.js';
import { PENDING_PAYMENT_TIMEOUT_MIN } from '../../config/constants.js';

type Tx = Prisma.TransactionClient;

const orderNumber = () => {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `EK${ymd}${randomBytes(2).toString('hex').toUpperCase()}`;
};

export function formatAddress(input: Pick<CheckoutInput, 'line1' | 'area' | 'city' | 'district' | 'landmark'>) {
  return [input.line1, input.area, input.city, input.district, input.landmark ? `Landmark: ${input.landmark}` : '']
    .filter(Boolean)
    .join(', ');
}

/** Totals shown on the checkout page before an order exists. */
export async function quote(cartToken: string | undefined, zone: CheckoutInput['deliveryZone'] = 'RING_ROAD') {
  const [cart, settings] = await Promise.all([getCart(cartToken), getSettings()]);
  const summary = summarizeCart(cart);
  const deliveryPaisa = summary.items.length ? deliveryFee(zone, summary.weightGrams, summary.subtotalPaisa, settings.delivery) : 0;
  return { ...summary, deliveryPaisa, totalPaisa: summary.subtotalPaisa + deliveryPaisa };
}

/**
 * Decrements stock for every item of an order and writes stock movements.
 * `strict` throws when stock is short (COD placement); otherwise the shortage is recorded on the order
 * so staff can resolve it (online payment already captured).
 */
/** Locking read: always sees the latest committed order state, unlike a plain read inside a transaction. */
async function lockOrder(tx: Tx, orderId: number) {
  const rows = await tx.$queryRaw<{ status: OrderStatus; stockDeducted: number | boolean }[]>`
    SELECT status, stockDeducted FROM orders WHERE id = ${orderId} FOR UPDATE`;
  if (!rows[0]) throw notFound('Order');
  return { status: rows[0].status, stockDeducted: Boolean(Number(rows[0].stockDeducted)) };
}

async function deductStock(tx: Tx, orderId: number, strict: boolean, userId?: number) {
  const locked = await lockOrder(tx, orderId);
  if (locked.stockDeducted) return;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const shortages: string[] = [];
  for (const item of order.items) {
    const { count } = await tx.productVariant.updateMany({
      where: { id: item.variantId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });
    if (!count) {
      if (strict) throw new AppError(409, 'insufficient_stock', `${item.name} just went out of stock. Please update your cart.`);
      shortages.push(item.sku);
      continue;
    }
    await tx.stockMovement.create({
      data: { variantId: item.variantId, change: -item.quantity, reason: 'ORDER', reference: order.orderNo, userId },
    });
  }
  await tx.order.update({ where: { id: orderId }, data: { stockDeducted: true } });
  if (shortages.length) {
    await tx.orderEvent.create({
      data: { orderId, status: order.status, note: `Stock shortage on ${shortages.join(', ')}: please arrange restock or refund` },
    });
    logger.warn({ orderId, shortages }, 'Paid order has stock shortage');
  }
}

async function restoreStock(tx: Tx, orderId: number, userId?: number) {
  if (!(await lockOrder(tx, orderId)).stockDeducted) return;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  for (const item of order.items) {
    await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
    await tx.stockMovement.create({
      data: { variantId: item.variantId, change: item.quantity, reason: 'ORDER_CANCELLED', reference: order.orderNo, userId },
    });
  }
  await tx.order.update({ where: { id: orderId }, data: { stockDeducted: false } });
}

export async function createOrder(cartToken: string | undefined, input: CheckoutInput, userId?: number) {
  const settings = await getSettings();
  const enabled = {
    COD: settings.payments.codEnabled,
    ESEWA: settings.payments.esewaEnabled,
    KHALTI: settings.payments.khaltiEnabled,
  };
  if (!enabled[input.paymentMethod]) throw new AppError(422, 'validation_error', 'This payment method is not available right now');

  const cart = await getCart(cartToken);
  const summary = summarizeCart(cart);
  if (!summary.items.length) throw new AppError(422, 'empty_cart', 'Your cart is empty');
  if (summary.problems.length) throw new AppError(409, 'insufficient_stock', summary.problems.map((p) => p.message).join('. '));

  const deliveryPaisa = deliveryFee(input.deliveryZone, summary.weightGrams, summary.subtotalPaisa, settings.delivery);
  const isCod = input.paymentMethod === 'COD';

  // Concurrent checkouts touching the same stock rows can deadlock; InnoDB aborts one and we retry it.
  const order = await withTxRetry(() => prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNo: orderNumber(),
        userId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        shippingAddress: formatAddress(input),
        deliveryZone: input.deliveryZone,
        subtotalPaisa: summary.subtotalPaisa,
        deliveryPaisa,
        totalPaisa: summary.subtotalPaisa + deliveryPaisa,
        paymentMethod: input.paymentMethod,
        status: isCod ? 'PLACED' : 'PENDING_PAYMENT',
        notes: input.notes,
        items: {
          create: summary.items.map((i) => ({
            variantId: i.variantId,
            name: `${i.variant.product.name} (${i.variant.label})`,
            sku: i.variant.sku,
            unitPaisa: i.variant.pricePaisa,
            quantity: i.quantity,
            totalPaisa: i.variant.pricePaisa * i.quantity,
          })),
        },
        events: { create: { status: isCod ? 'PLACED' : 'PENDING_PAYMENT', note: isCod ? 'Cash on delivery' : 'Waiting for online payment' } },
      },
    });
    if (isCod) {
      await deductStock(tx, created.id, true);
      await tx.cartItem.deleteMany({ where: { cartId: cart!.id } });
    }
    if (userId && input.saveAddress === 'on') {
      const count = await tx.address.count({ where: { userId } });
      await tx.address.create({
        data: {
          userId,
          label: count ? `Address ${count + 1}` : 'Home',
          fullName: input.customerName,
          phone: input.customerPhone,
          line1: input.line1,
          area: input.area,
          city: input.city,
          district: input.district,
          isDefault: count === 0,
        },
      });
    }
    return created;
  }));

  cache.forget('catalog:bestsellers');
  return order;
}

/** Called inside the payment transaction once the gateway confirmed the full amount. */
export async function markOrderPaid(tx: Tx, orderId: number) {
  const locked = await lockOrder(tx, orderId);
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (locked.status !== 'PENDING_PAYMENT' && locked.status !== 'CANCELLED') return order;
  const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'PLACED' } });
  await tx.orderEvent.create({ data: { orderId, status: 'PLACED', note: `Paid online via ${order.paymentMethod}` } });
  await deductStock(tx, orderId, false);
  return updated;
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['CONFIRMED', 'PACKED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export const allowedNextStatuses = (s: OrderStatus) => ALLOWED_TRANSITIONS[s];

export async function updateOrderStatus(orderId: number, status: OrderStatus, note: string | undefined, userId?: number) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockOrder(tx, orderId);
    const order = { ...(await tx.order.findUniqueOrThrow({ where: { id: orderId } })), status: locked.status };
    if (order.status === status) return order;
    if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
      throw new AppError(422, 'invalid_transition', `Cannot move an order from ${order.status} to ${status}`);
    }
    if (status === 'PLACED' && order.paymentMethod !== 'COD') {
      // Manual confirmation of an online payment received outside the gateway flow.
      await deductStock(tx, orderId, false, userId);
    }
    if (status === 'CANCELLED' || status === 'REFUNDED') await restoreStock(tx, orderId, userId);
    if (status === 'REFUNDED') {
      await tx.payment.updateMany({ where: { orderId, status: 'COMPLETED' }, data: { status: 'REFUNDED' } });
    }
    const updated = await tx.order.update({ where: { id: orderId }, data: { status } });
    await tx.orderEvent.create({ data: { orderId, status, note } });
    return updated;
  });
}

/** Worker: cancel online orders that were never paid. */
export async function cancelStalePendingOrders() {
  const cutoff = new Date(Date.now() - PENDING_PAYMENT_TIMEOUT_MIN * 60_000);
  const stale = await prisma.order.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } }, select: { id: true } });
  for (const o of stale) {
    await prisma.$transaction([
      prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } }),
      prisma.orderEvent.create({ data: { orderId: o.id, status: 'CANCELLED', note: 'Payment not completed within 30 minutes' } }),
      prisma.payment.updateMany({ where: { orderId: o.id, status: 'INITIATED' }, data: { status: 'FAILED' } }),
    ]);
  }
  return stale.length;
}

export function getOrderForCustomer(orderNo: string, userId: number) {
  return prisma.order.findFirst({
    where: { orderNo, userId },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payments: true },
  });
}

export function getOrderByNo(orderNo: string) {
  return prisma.order.findUnique({
    where: { orderNo },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payments: true },
  });
}
