import { TIMEZONE, TZ_OFFSET } from '../config/constants.js';

/** Builds an absolute Date from a Nepal local date and time. */
export const toNpt = (date: string, time = '00:00') => new Date(`${date}T${time}:00${TZ_OFFSET}`);

/** YYYY-MM-DD in Nepal time. */
export const nptDate = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** HH:MM in Nepal time. */
export const nptTime = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

/** 0 = Sunday ... 6 = Saturday for a calendar date. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Date-only columns are stored at UTC midnight. */
export const dateOnly = (date: string) => new Date(`${date}T00:00:00Z`);

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, ...opts }).format(new Date(d));
}

/** Date-only values (stored at UTC midnight) are formatted in UTC so they never shift a day. */
export function formatDay(d: Date | string | null | undefined) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(d));
}

export const formatDateTime = (d: Date | string | null | undefined) =>
  formatDate(d, { dateStyle: 'medium', timeStyle: 'short' });

export const ageInMonths = (dob: Date | string, now = new Date()) => {
  const b = new Date(dob);
  let months = (now.getUTCFullYear() - b.getUTCFullYear()) * 12 + (now.getUTCMonth() - b.getUTCMonth());
  if (now.getUTCDate() < b.getUTCDate()) months -= 1;
  return months;
};

/** "3 months", "1 year 2 months" from a date of birth. */
export function ageFrom(dob: Date | string, now = new Date()): string {
  const months = ageInMonths(dob, now);
  if (months < 1) {
    const weeks = Math.max(1, Math.floor((now.getTime() - new Date(dob).getTime()) / (7 * 86_400_000)));
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} year${y === 1 ? '' : 's'}${m ? ` ${m} month${m === 1 ? '' : 's'}` : ''}`;
}
