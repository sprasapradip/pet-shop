export const BUSINESS = {
  name: 'The Everest Kennel',
  tagline: 'Pets, Care and Kennel Services in Kathmandu',
  owner: 'Aakriti',
  phone: '+977-9843944253',
  phoneDisplay: '+977 9843944253',
  address: 'Soaltee Mode, Kathmandu, Nepal',
  street: 'Soaltee Mode',
  city: 'Kathmandu',
  region: 'Bagmati',
  postalCode: '44600',
  areaServed: ['Kathmandu', 'Lalitpur', 'Bhaktapur'],
} as const;

export const TIMEZONE = 'Asia/Kathmandu';
export const TZ_OFFSET = '+05:45';

export const ACTIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;

export const VALLEY_DISTRICTS = ['Kathmandu', 'Lalitpur', 'Bhaktapur'] as const;

export const SPECIES_LABELS: Record<string, string> = {
  DOG: 'Dog',
  CAT: 'Cat',
  BIRD: 'Bird',
  FISH: 'Fish',
  RABBIT: 'Rabbit',
  OTHER: 'Other',
};

export const LIFE_STAGES = ['puppy', 'adult', 'senior', 'all'] as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
};

export const DELIVERY_ZONES = {
  RING_ROAD: 'Inside Ring Road',
  VALLEY: 'Kathmandu Valley (outside Ring Road)',
  OUTSIDE: 'Outside the valley',
} as const;
export type DeliveryZone = keyof typeof DELIVERY_ZONES;

/** Hours before startAt until which a customer may reschedule or cancel. */
export const CUSTOMER_CHANGE_CUTOFF_HOURS = 12;
export const RESERVATION_HOURS = 72;
export const PENDING_PAYMENT_TIMEOUT_MIN = 30;
export const SOLD_VISIBLE_DAYS = 30;
