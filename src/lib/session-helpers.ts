import type { Request } from 'express';

/** Remembers up to 20 references created in this session (guest access to confirmation pages). */
export function pushRecent(req: Request, key: 'recentOrders' | 'recentBookings', value: string) {
  const list = (req.session[key] ??= []);
  if (!list.includes(value)) list.unshift(value);
  req.session[key] = list.slice(0, 20);
}

export const hasRecent = (req: Request, key: 'recentOrders' | 'recentBookings', value: string) =>
  (req.session[key] ?? []).includes(value);

export const intParam = (v: unknown) => {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
