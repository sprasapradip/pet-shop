import type { Booking, Inquiry, Order, Service } from '@prisma/client';
import { env } from '../config/env.js';
import { sendMail } from './mailer.js';
import { sendSms } from './sms.js';
import { formatNpr } from './money.js';
import { formatDateTime } from './dates.js';
import { logger } from './logger.js';
import { BUSINESS } from '../config/constants.js';

const safe = (fn: () => Promise<unknown>) => fn().catch((err) => logger.error({ err }, 'Notification failed'));

export function notifyNewBooking(booking: Booking & { service: Service }) {
  return safe(async () => {
    const when = formatDateTime(booking.startAt);
    await Promise.all([
      sendSms(
        booking.contactPhone,
        `${BUSINESS.name}: booking ${booking.reference} for ${booking.service.name} on ${when} received. We will confirm shortly. Call ${BUSINESS.landlineDisplay}.`,
      ),
      sendMail({
        to: env.ADMIN_NOTIFY_EMAIL,
        subject: `New booking ${booking.reference}: ${booking.service.name}`,
        text: [
          `Service: ${booking.service.name}`,
          `When: ${when}`,
          `Customer: ${booking.contactName} (${booking.contactPhone})`,
          booking.petSummary ? `Pet: ${booking.petSummary}` : '',
          booking.addressText ? `Address: ${booking.addressText}` : '',
          booking.notes ? `Notes: ${booking.notes}` : '',
          `Admin: ${env.APP_URL}/admin/bookings/${booking.id}`,
        ]
          .filter(Boolean)
          .join('\n'),
      }),
    ]);
  });
}

export function notifyBookingStatus(booking: Booking & { service: Service }) {
  return safe(async () => {
    const when = formatDateTime(booking.startAt);
    const text: Record<string, string> = {
      CONFIRMED: `Your ${booking.service.name} booking ${booking.reference} on ${when} is confirmed.`,
      CANCELLED: `Your booking ${booking.reference} on ${when} has been cancelled. Call ${BUSINESS.landlineDisplay} for help.`,
    };
    const msg = text[booking.status];
    if (msg) await sendSms(booking.contactPhone, `${BUSINESS.name}: ${msg}`);
  });
}

export function notifyNewOrder(order: Order) {
  return safe(async () => {
    await Promise.all([
      sendSms(
        order.customerPhone,
        `${BUSINESS.name}: order ${order.orderNo} (${formatNpr(order.totalPaisa)}) received. We will call you to confirm delivery.`,
      ),
      sendMail({
        to: env.ADMIN_NOTIFY_EMAIL,
        subject: `New order ${order.orderNo}: ${formatNpr(order.totalPaisa)} (${order.paymentMethod})`,
        text: `Customer: ${order.customerName} (${order.customerPhone})\nTotal: ${formatNpr(order.totalPaisa)}\nAdmin: ${env.APP_URL}/admin/orders/${order.id}`,
      }),
      order.customerEmail
        ? sendMail({
            to: order.customerEmail,
            subject: `Your order ${order.orderNo} at ${BUSINESS.name}`,
            text: `Thank you for your order ${order.orderNo}. Total ${formatNpr(order.totalPaisa)}.\nTrack it at ${env.APP_URL}/account/orders`,
          })
        : Promise.resolve(),
    ]);
  });
}

export function notifyOrderStatus(order: Order, label: string) {
  return safe(() => sendSms(order.customerPhone, `${BUSINESS.name}: order ${order.orderNo} is now ${label}.`));
}

export function notifyNewInquiry(inquiry: Inquiry) {
  return safe(() =>
    sendMail({
      to: env.ADMIN_NOTIFY_EMAIL,
      subject: `New ${inquiry.type.replace(/_/g, ' ').toLowerCase()} from ${inquiry.name}`,
      text: `${inquiry.name} (${inquiry.phone}${inquiry.email ? `, ${inquiry.email}` : ''})\n\n${inquiry.subject ?? ''}\n${inquiry.message}\n\nAdmin: ${env.APP_URL}/admin/inquiries/${inquiry.id}`,
    }),
  );
}
