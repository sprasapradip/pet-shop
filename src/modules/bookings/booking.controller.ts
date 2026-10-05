import type { Request, Response } from 'express';
import type { ServiceType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { setSeo } from '../../lib/seo.js';
import { parse, validatedBody } from '../../middleware/validate.js';
import { flash, rememberInput } from '../../lib/flash.js';
import { notifyBookingStatus, notifyNewBooking } from '../../lib/notify.js';
import { hasRecent, pushRecent } from '../../lib/session-helpers.js';
import { nptDate, addDays } from '../../lib/dates.js';
import { VALLEY_DISTRICTS } from '../../config/constants.js';
import { sendOtp, verifyOtp } from '../auth/otp.service.js';
import { otpSendSchema, otpVerifySchema } from '../auth/auth.schema.js';
import { startPayment } from '../payments/payment.service.js';
import { renderPaymentStart } from '../orders/checkout.controller.js';
import { createBookingSchema, rescheduleSchema, SERVICE_TYPES, type CreateBookingInput } from './booking.schema.js';
import {
  boardingAvailability,
  canManageBooking,
  cancelBooking,
  createBooking,
  getBookingByReference,
  listBookableServices,
  listSlots,
  rescheduleBooking,
} from './booking.service.js';

const isServiceType = (v: unknown): v is ServiceType => SERVICE_TYPES.includes(v as never);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export async function bookingWizard(req: Request, res: Response) {
  const services = await listBookableServices();
  const old = res.locals.old as Record<string, string>;
  const selected = String(req.query.serviceType || req.query.service || old.serviceType || '').toUpperCase();
  const serviceType = isServiceType(selected) ? selected : undefined;
  const date = String(req.query.date ?? old.date ?? '');
  const endDate = String(req.query.endDate ?? old.endDate ?? '');

  // Server rendered availability for the no-JavaScript flow.
  let slots: Awaited<ReturnType<typeof listSlots>> | null = null;
  let boarding: Awaited<ReturnType<typeof boardingAvailability>> | null = null;
  if (serviceType && dateRe.test(date)) {
    if (serviceType === 'BOARDING') {
      if (dateRe.test(endDate) && endDate > date) boarding = await boardingAvailability(date, endDate).catch(() => null);
    } else slots = await listSlots(serviceType, date);
  }

  const pets = req.session.user
    ? await prisma.customerPet.findMany({ where: { userId: req.session.user.id }, include: { breed: true }, orderBy: { name: 'asc' } })
    : [];
  const profile = req.session.user
    ? await prisma.user.findUnique({ where: { id: req.session.user.id }, select: { name: true, phone: true } })
    : null;

  setSeo(res, {
    title: 'Book a Vet Visit, Vaccination or Boarding | Everest Kennel',
    description: 'Book a vet house call, vaccination, treatment, dog boarding, training or stud service online in Kathmandu.',
    canonical: '/book',
    noindex: !!req.query.service,
  });
  res.set('Cache-Control', 'no-store');
  res.render('booking/wizard', {
    services,
    serviceType,
    date,
    endDate,
    slots,
    boarding,
    pets,
    profile,
    districts: VALLEY_DISTRICTS,
    minDate: nptDate(),
    maxDate: addDays(nptDate(), 90),
    phoneVerified: req.session.verifiedPhone ?? '',
  });
}

async function finishBooking(req: Request, res: Response, input: CreateBookingInput) {
  const booking = await createBooking(input, req.session.user?.id);
  pushRecent(req, 'recentBookings', booking.reference);
  delete req.session.pendingBooking;
  if (booking.advancePaisa === 0) void notifyNewBooking(booking);
  return booking;
}

/** Web form submit. Guests without a verified phone get an OTP and a verification step. */
export async function bookingSubmit(req: Request, res: Response) {
  const input = parse(createBookingSchema, req.body);
  if (!req.session.user && req.session.verifiedPhone !== input.contactPhone) {
    const { _csrf, website, _ts, ...rest } = req.body as Record<string, unknown>;
    void _csrf;
    void website;
    void _ts;
    req.session.pendingBooking = rest;
    await sendOtp(input.contactPhone, 'booking');
    return res.redirect(303, '/book/verify');
  }
  const booking = await finishBooking(req, res, input);
  return res.redirect(303, `/book/confirmation/${booking.reference}`);
}

export function verifyPage(req: Request, res: Response) {
  const pending = req.session.pendingBooking;
  if (!pending) return res.redirect(303, '/book');
  setSeo(res, { title: 'Verify your phone', noindex: true });
  return res.render('booking/verify', { phone: String(pending.contactPhone ?? '') });
}

export async function verifySubmit(req: Request, res: Response) {
  const pending = req.session.pendingBooking;
  if (!pending) return res.redirect(303, '/book');
  const input = parse(createBookingSchema, pending);

  if (req.body.resend === '1') {
    await sendOtp(input.contactPhone, 'booking');
    flash(req, 'info', 'A new code has been sent.');
    return res.redirect(303, '/book/verify');
  }
  const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit code') }), req.body);
  await verifyOtp(input.contactPhone, code, 'booking');
  req.session.verifiedPhone = input.contactPhone;

  try {
    const booking = await finishBooking(req, res, input);
    return res.redirect(303, `/book/confirmation/${booking.reference}`);
  } catch (err) {
    // Slot taken while verifying: back to the wizard with the details kept.
    if (err instanceof AppError && (err.status === 409 || err.status === 422)) {
      req.body = pending;
      rememberInput(req);
      delete req.session.pendingBooking;
      flash(req, 'error', err.message);
      return res.redirect(303, `/book?service=${input.serviceType}`);
    }
    throw err;
  }
}

function ownsBooking(req: Request, booking: { reference: string; userId: number | null; contactPhone: string }) {
  return (
    canManageBooking(booking, req.session.user?.id, req.session.verifiedPhone) ||
    hasRecent(req, 'recentBookings', booking.reference) ||
    isStaffUser(req)
  );
}
const isStaffUser = (req: Request) => ['STAFF', 'VET', 'ADMIN'].includes(req.session.user?.role ?? '');

export async function confirmation(req: Request, res: Response) {
  const booking = await getBookingByReference(String(req.params.reference));
  if (!booking || !ownsBooking(req, booking)) throw notFound('Booking');
  setSeo(res, { title: `Booking ${booking.reference}`, noindex: true });
  res.set('Cache-Control', 'no-store');
  res.render('booking/confirmation', { booking, dueAdvance: Math.max(0, booking.advancePaisa - booking.paidPaisa) });
}

export async function payAdvance(req: Request, res: Response) {
  const booking = await getBookingByReference(String(req.params.reference));
  if (!booking || !ownsBooking(req, booking)) throw notFound('Booking');
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
    throw new AppError(422, 'invalid_state', 'This booking can no longer be paid online');
  }
  const due = booking.advancePaisa - booking.paidPaisa;
  if (due <= 0) {
    flash(req, 'info', 'The advance is already paid.');
    return res.redirect(303, `/book/confirmation/${booking.reference}`);
  }
  const gateway = z.enum(['ESEWA', 'KHALTI']).parse(req.body.gateway);
  const start = await startPayment({
    kind: 'booking',
    targetId: booking.id,
    gateway,
    amountPaisa: due,
    name: `Booking ${booking.reference}`,
    customer: { name: booking.contactName, phone: booking.contactPhone },
    userId: req.session.user?.id,
  });
  return renderPaymentStart(res, start, `the advance for booking ${booking.reference}`);
}

// ----- Customer account actions -----

export async function cancelSubmit(req: Request, res: Response) {
  const booking = await cancelBooking(String(req.params.reference), req.session.user?.id, req.session.verifiedPhone);
  void notifyBookingStatus(booking);
  if (req.originalUrl.startsWith('/api/')) return res.json({ data: { reference: booking.reference, status: booking.status } });
  flash(req, 'success', `Booking ${booking.reference} was cancelled.`);
  return res.redirect(303, req.session.user ? '/account/bookings' : `/book/confirmation/${booking.reference}`);
}

export async function reschedulePage(req: Request, res: Response) {
  const booking = await getBookingByReference(String(req.params.reference));
  if (!booking || booking.userId !== req.session.user?.id) throw notFound('Booking');
  const date = String(req.query.date ?? '');
  const endDate = String(req.query.endDate ?? '');
  let slots = null;
  if (booking.service.type !== 'BOARDING' && dateRe.test(date)) slots = await listSlots(booking.service.type, date);
  setSeo(res, { title: `Reschedule ${booking.reference}`, noindex: true });
  res.render('account/reschedule', { booking, date, endDate, slots, minDate: nptDate(), maxDate: addDays(nptDate(), 90) });
}

export async function rescheduleSubmit(req: Request, res: Response) {
  const input = parse(rescheduleSchema, req.body);
  const booking = await rescheduleBooking(String(req.params.reference), input, req.session.user?.id);
  flash(req, 'success', `Booking ${booking.reference} moved. We will confirm the new time shortly.`);
  res.redirect(303, '/account/bookings');
}

// ----- JSON API -----

export async function apiSlots(req: Request, res: Response) {
  const date = String(req.query.date ?? '');
  const type = String(req.params.type).toUpperCase();
  if (!dateRe.test(date)) throw new AppError(422, 'validation_error', 'date must be YYYY-MM-DD');
  if (!isServiceType(type)) throw notFound('Service');
  const slots = await listSlots(type, date);
  res.set('Cache-Control', 'no-store').json({ data: slots });
}

export async function apiBoardingAvailability(req: Request, res: Response) {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!dateRe.test(from) || !dateRe.test(to)) throw new AppError(422, 'validation_error', 'from and to must be YYYY-MM-DD');
  res.set('Cache-Control', 'no-store').json({ data: await boardingAvailability(from, to) });
}

export async function apiCreateBooking(req: Request, res: Response) {
  const input = validatedBody<CreateBookingInput>(req);
  if (!req.session.user && req.session.verifiedPhone !== input.contactPhone) {
    throw new AppError(403, 'phone_unverified', 'Please verify your phone number first');
  }
  const booking = await finishBooking(req, res, input);
  res
    .status(201)
    .location(`/book/confirmation/${booking.reference}`)
    .json({ data: { reference: booking.reference, advancePaisa: booking.advancePaisa, url: `/book/confirmation/${booking.reference}` } });
}

export async function apiSendOtp(req: Request, res: Response) {
  const input = parse(otpSendSchema, req.body);
  const result = await sendOtp(input.phone, input.purpose);
  res.status(201).json({ data: { phone: input.phone, ...result } });
}

export async function apiVerifyOtp(req: Request, res: Response) {
  const input = parse(otpVerifySchema, req.body);
  await verifyOtp(input.phone, input.code, input.purpose);
  req.session.verifiedPhone = input.phone;
  if (req.session.user && input.purpose === 'verify_phone') {
    await prisma.user.updateMany({ where: { id: req.session.user.id, phone: input.phone }, data: { phoneVerifiedAt: new Date() } });
  }
  res.json({ data: { verified: true, phone: input.phone } });
}
