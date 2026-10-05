import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { addDays, nptDate, toNpt } from '../../lib/dates.js';
import { ACTIVE_BOOKING_STATUSES } from '../../config/constants.js';
import { adminPage } from './admin.helpers.js';

const PAID_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

export async function dailyRevenue(days: number) {
  const today = nptDate();
  const from = toNpt(addDays(today, -(days - 1)));
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from }, status: { in: [...PAID_STATUSES] } },
    select: { createdAt: true, totalPaisa: true },
  });
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) buckets.set(addDays(today, -i), 0);
  for (const o of orders) {
    const d = nptDate(o.createdAt);
    if (buckets.has(d)) buckets.set(d, buckets.get(d)! + o.totalPaisa);
  }
  return [...buckets.entries()].map(([date, paisa]) => ({ date, paisa }));
}

export async function dashboard(req: Request, res: Response) {
  const user = req.session.user!;
  const today = nptDate();
  const dayStart = toNpt(today);
  const dayEnd = toNpt(addDays(today, 1));
  const vetFilter = user.role === 'VET' ? { assignedToId: user.id } : {};

  const [todaysBookings, pendingOrders, lowStock, units, occupied, newInquiries, revenue, pendingBookings] = await Promise.all([
    prisma.booking.findMany({
      where: { ...vetFilter, startAt: { gte: dayStart, lt: dayEnd }, status: { in: [...ACTIVE_BOOKING_STATUSES, 'COMPLETED'] } },
      include: { service: true, assignedTo: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
    }),
    user.role === 'VET' ? Promise.resolve(0) : prisma.order.count({ where: { status: { in: ['PLACED', 'CONFIRMED', 'PACKED'] } } }),
    user.role === 'VET'
      ? Promise.resolve([])
      : prisma.$queryRaw<{ id: number; sku: string; label: string; stock: number; productId: number; name: string }[]>`
          SELECT v.id, v.sku, v.label, v.stock, v.productId, p.name
          FROM product_variants v JOIN products p ON p.id = v.productId
          WHERE v.isActive = 1 AND p.isActive = 1 AND v.stock <= v.lowStockAlert
          ORDER BY v.stock ASC LIMIT 10`,
    prisma.kennelUnit.count({ where: { isActive: true } }),
    prisma.booking.count({
      where: { service: { type: 'BOARDING' }, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'PENDING'] }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
    }),
    user.role === 'VET' ? Promise.resolve(0) : prisma.inquiry.count({ where: { status: 'NEW' } }),
    user.role === 'VET' ? Promise.resolve([]) : dailyRevenue(14),
    prisma.booking.count({ where: { ...vetFilter, status: 'PENDING' } }),
  ]);

  adminPage(res, 'Dashboard');
  res.render('admin/dashboard', {
    todaysBookings,
    pendingOrders,
    lowStock,
    occupancy: { units, occupied },
    newInquiries,
    revenue,
    pendingBookings,
  });
}
