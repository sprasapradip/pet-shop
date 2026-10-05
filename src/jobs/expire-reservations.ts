import { logger } from '../lib/logger.js';
import { expireReservations as expireListingReservations } from '../modules/pets/pet.service.js';
import { cancelStalePendingOrders } from '../modules/orders/order.service.js';
import { cancelUnpaidBookings } from '../modules/bookings/booking.service.js';
import { purgeExpiredOtps } from '../modules/auth/otp.service.js';

/** Every 10 minutes: pet reservations, unpaid orders/bookings, and old OTP codes. */
export async function expireReservations() {
  const [listings, orders, bookings, otps] = await Promise.all([
    expireListingReservations(),
    cancelStalePendingOrders(),
    cancelUnpaidBookings(),
    purgeExpiredOtps(),
  ]);
  logger.info({ listings, orders, bookings, otps: otps.count }, 'Expiry job done');
  return { listings, orders, bookings };
}
