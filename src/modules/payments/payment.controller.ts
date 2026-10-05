import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { flash } from '../../lib/flash.js';
import { notifyNewBooking, notifyNewOrder } from '../../lib/notify.js';
import { clearCart } from '../cart/cart.service.js';
import { verifyEsewaCallback } from './esewa.js';
import { lookupKhalti } from './khalti.js';
import { completePayment, failPayment, findPaymentByRef, type CompletionResult, type PaymentKind } from './payment.service.js';

async function successRedirect(req: Request, res: Response, result: CompletionResult) {
  if (result.kind === 'order') {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.targetId } });
    if (!result.ok) {
      flash(req, 'error', 'We could not confirm your payment amount. Our team will contact you.');
      return res.redirect(303, `/checkout/failed?order=${order.orderNo}`);
    }
    if (req.session.cartToken) await clearCart(req.session.cartToken);
    if (!result.alreadyProcessed) void notifyNewOrder(order);
    return res.redirect(303, `/checkout/success?order=${order.orderNo}`);
  }
  if (result.kind === 'booking') {
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.targetId }, include: { service: true } });
    if (result.ok) {
      flash(req, 'success', 'Advance payment received. Thank you!');
      if (!result.alreadyProcessed) void notifyNewBooking(booking);
    } else flash(req, 'error', 'We could not confirm your payment. Please call us.');
    return res.redirect(303, `/book/confirmation/${booking.reference}`);
  }
  const listing = await prisma.petListing.findUniqueOrThrow({ where: { id: result.targetId } });
  if (result.ok) {
    flash(req, 'success', `Deposit received. ${listing.title} is reserved for you for 72 hours. We will call you to arrange a visit.`);
  } else if (result.reason === 'listing_unavailable') {
    flash(req, 'error', 'Sorry, this pet was reserved by someone else just before your payment. Your deposit will be refunded in full.');
  } else {
    flash(req, 'error', 'We could not confirm your deposit. Please call us.');
  }
  return res.redirect(303, `/pets/${listing.slug}`);
}

async function failureRedirect(req: Request, res: Response, kind: PaymentKind, targetId: number) {
  flash(req, 'error', 'Payment was not completed. You can try again.');
  if (kind === 'order') {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: targetId } });
    return res.redirect(303, `/checkout/failed?order=${order.orderNo}`);
  }
  if (kind === 'booking') {
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: targetId } });
    return res.redirect(303, `/book/confirmation/${booking.reference}`);
  }
  const listing = await prisma.petListing.findUniqueOrThrow({ where: { id: targetId } });
  return res.redirect(303, `/pets/${listing.slug}`);
}

const targetOf = (p: { orderId: number | null; bookingId: number | null; listingId: number | null }): [PaymentKind, number] =>
  p.orderId ? ['order', p.orderId] : p.bookingId ? ['booking', p.bookingId] : ['listing', p.listingId!];

export async function esewaSuccess(req: Request, res: Response) {
  const data = String(req.query.data ?? '');
  let verified: Awaited<ReturnType<typeof verifyEsewaCallback>>;
  try {
    verified = await verifyEsewaCallback(data);
  } catch (err) {
    logger.warn({ err }, 'eSewa callback rejected');
    flash(req, 'error', 'We could not verify the eSewa payment. If money was deducted, please contact us.');
    return res.redirect(303, '/');
  }
  const payment = await prisma.payment.findUnique({ where: { transactionId: verified.transactionUuid } });
  if (!payment) return res.redirect(303, '/');
  if (!verified.ok) {
    await failPayment(payment.transactionId, verified.payload);
    const [kind, id] = targetOf(payment);
    return failureRedirect(req, res, kind, id);
  }
  const result = await completePayment(
    payment.transactionId,
    Math.round(verified.amountRupees * 100),
    verified.refId,
    verified.payload,
  );
  return successRedirect(req, res, result);
}

export async function esewaFailure(req: Request, res: Response) {
  const tx = String(req.query.tx ?? '');
  const payment = tx ? await prisma.payment.findUnique({ where: { transactionId: tx } }) : null;
  if (!payment) {
    flash(req, 'error', 'Payment was cancelled.');
    return res.redirect(303, '/cart');
  }
  await failPayment(payment.transactionId, { reason: 'esewa_failure_redirect' });
  const [kind, id] = targetOf(payment);
  return failureRedirect(req, res, kind, id);
}

export async function khaltiReturn(req: Request, res: Response) {
  const pidx = String(req.query.pidx ?? '');
  const payment = pidx ? await findPaymentByRef(pidx) : null;
  if (!payment) {
    flash(req, 'error', 'Payment not found.');
    return res.redirect(303, '/');
  }
  // Never trust the status in the query string: always look it up.
  const lookup = await lookupKhalti(pidx);
  if (lookup.status !== 'Completed') {
    await failPayment(payment.transactionId, lookup);
    const [kind, id] = targetOf(payment);
    return failureRedirect(req, res, kind, id);
  }
  const result = await completePayment(payment.transactionId, Number(lookup.total_amount), lookup.transaction_id ?? pidx, lookup);
  return successRedirect(req, res, result);
}
