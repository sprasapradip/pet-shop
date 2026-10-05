import { Prisma, type PaymentMethod } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { withTxRetry } from '../../lib/tx.js';
import { rupeeString } from '../../lib/money.js';
import { sendMail } from '../../lib/mailer.js';
import { env } from '../../config/env.js';
import { RESERVATION_HOURS } from '../../config/constants.js';
import { buildEsewaForm } from './esewa.js';
import { initiateKhalti } from './khalti.js';
import { markOrderPaid } from '../orders/order.service.js';

export type PaymentKind = 'order' | 'booking' | 'listing';

export type PaymentStart =
  | { type: 'form'; action: string; fields: Record<string, string> }
  | { type: 'redirect'; url: string };

interface StartInput {
  kind: PaymentKind;
  targetId: number;
  gateway: Exclude<PaymentMethod, 'COD'>;
  amountPaisa: number;
  name: string;
  customer: { name: string; phone: string; email?: string | null };
  userId?: number;
}

export async function startPayment(input: StartInput): Promise<PaymentStart> {
  if (input.amountPaisa <= 0) throw new AppError(422, 'validation_error', 'Nothing to pay');
  const transactionId = `${input.kind[0]!.toUpperCase()}${input.targetId}-${randomUUID().slice(0, 13)}`;

  const payment = await prisma.payment.create({
    data: {
      gateway: input.gateway,
      transactionId,
      amountPaisa: input.amountPaisa,
      userId: input.userId,
      orderId: input.kind === 'order' ? input.targetId : undefined,
      bookingId: input.kind === 'booking' ? input.targetId : undefined,
      listingId: input.kind === 'listing' ? input.targetId : undefined,
    },
  });

  if (input.gateway === 'ESEWA') {
    const form = buildEsewaForm(transactionId, rupeeString(input.amountPaisa));
    return { type: 'form', action: form.action, fields: form.fields };
  }

  try {
    const khalti = await initiateKhalti({
      purchaseOrderId: transactionId,
      purchaseOrderName: input.name,
      amountPaisa: input.amountPaisa,
      customer: input.customer,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { gatewayRef: khalti.pidx } });
    return { type: 'redirect', url: khalti.paymentUrl };
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    throw err;
  }
}

export interface CompletionResult {
  kind: PaymentKind;
  targetId: number;
  ok: boolean;
  alreadyProcessed?: boolean;
  reason?: string;
}

const kindOf = (p: { orderId: number | null; bookingId: number | null; listingId: number | null }): [PaymentKind, number] => {
  if (p.orderId) return ['order', p.orderId];
  if (p.bookingId) return ['booking', p.bookingId];
  if (p.listingId) return ['listing', p.listingId];
  throw new Error('Payment has no target');
};

/**
 * Idempotently completes a payment after the gateway confirmed it.
 * The payment row is locked so concurrent callbacks (browser + retry) process it once.
 */
export async function completePayment(
  transactionId: string,
  verifiedAmountPaisa: number,
  gatewayRef: string | undefined,
  raw: unknown,
): Promise<CompletionResult> {
  return withTxRetry(() => prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM payments WHERE transactionId = ${transactionId} FOR UPDATE`;
      if (!locked.length) throw notFound('Payment');
      const payment = await tx.payment.findUniqueOrThrow({ where: { transactionId } });
      const [kind, targetId] = kindOf(payment);

      if (payment.status === 'COMPLETED') return { kind, targetId, ok: true, alreadyProcessed: true };

      if (verifiedAmountPaisa !== payment.amountPaisa) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', rawResponse: raw as Prisma.InputJsonValue, gatewayRef },
        });
        logger.error({ transactionId, verifiedAmountPaisa, expected: payment.amountPaisa }, 'Payment amount mismatch');
        return { kind, targetId, ok: false, reason: 'amount_mismatch' };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'COMPLETED', gatewayRef: gatewayRef ?? payment.gatewayRef, rawResponse: raw as Prisma.InputJsonValue },
      });

      if (kind === 'order') {
        const order = await tx.order.findUniqueOrThrow({ where: { id: targetId } });
        if (order.totalPaisa !== payment.amountPaisa) {
          logger.error({ transactionId, orderTotal: order.totalPaisa }, 'Order total differs from payment amount');
          return { kind, targetId, ok: false, reason: 'amount_mismatch' };
        }
        await markOrderPaid(tx, targetId);
      }

      if (kind === 'booking') {
        await tx.booking.update({ where: { id: targetId }, data: { paidPaisa: { increment: payment.amountPaisa } } });
      }

      if (kind === 'listing') {
        // Row lock: only one reservation can win for a listing. The state must come from the
        // locking read itself; a plain SELECT would return the transaction's older snapshot.
        const [row] = await tx.$queryRaw<{ status: string; reservedUntil: Date | null; buyerUserId: number | null }[]>`
          SELECT status, reservedUntil, buyerUserId FROM pet_listings WHERE id = ${targetId} FOR UPDATE`;
        const listing = { ...(await tx.petListing.findUniqueOrThrow({ where: { id: targetId } })), ...row! };
        const reservedByOther =
          listing.status === 'RESERVED' &&
          listing.reservedUntil &&
          listing.reservedUntil > new Date() &&
          listing.buyerUserId !== payment.userId;
        if (listing.status === 'SOLD' || listing.status === 'HIDDEN' || reservedByOther) {
          logger.error({ transactionId, listingId: targetId }, 'Deposit paid for a listing that is no longer available');
          void sendMail({
            to: env.ADMIN_NOTIFY_EMAIL,
            subject: `Refund needed: deposit for ${listing.code} paid after it became unavailable`,
            text: `Payment ${transactionId} (${rupeeString(payment.amountPaisa)} NPR) must be refunded. Listing ${listing.code} is ${listing.status}.`,
          });
          return { kind, targetId, ok: false, reason: 'listing_unavailable' };
        }
        await tx.petListing.update({
          where: { id: targetId },
          data: {
            status: 'RESERVED',
            reservedUntil: new Date(Date.now() + RESERVATION_HOURS * 60 * 60_000),
            buyerUserId: payment.userId,
          },
        });
      }

      return { kind, targetId, ok: true };
    },
    { timeout: 15_000 },
  ));
}

export async function failPayment(transactionId: string, raw?: unknown) {
  const payment = await prisma.payment.findUnique({ where: { transactionId } });
  if (!payment || payment.status !== 'INITIATED') return payment;
  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'FAILED', rawResponse: (raw ?? Prisma.DbNull) as Prisma.InputJsonValue },
  });
}

export function findPaymentByRef(gatewayRef: string) {
  return prisma.payment.findFirst({ where: { gatewayRef } });
}
