import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { createOrder, updateOrderStatus } from '../../src/modules/orders/order.service.js';
import { completePayment, startPayment } from '../../src/modules/payments/payment.service.js';
import { checkoutInput, makeCart, makeVariant } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('checkout and stock', () => {
  it('COD decrements stock once, writes movements and clears the cart', async () => {
    const v = await makeVariant(5);
    const token = await makeCart(v.id, 2);
    const order = await createOrder(token, checkoutInput('COD'));
    expect(order.status).toBe('PLACED');
    expect(order.totalPaisa).toBe(2 * 500_00 + order.deliveryPaisa);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(3);
    expect(await prisma.stockMovement.count({ where: { variantId: v.id, reason: 'ORDER' } })).toBe(1);
    expect(await prisma.cartItem.count({ where: { cart: { token } } })).toBe(0);

    await updateOrderStatus(order.id, 'CANCELLED', 'test');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(5);
  });

  it('refuses to oversell when many buyers race for the last items', async () => {
    const v = await makeVariant(3);
    const tokens = await Promise.all(Array.from({ length: 6 }, () => makeCart(v.id, 1)));
    const results = await Promise.allSettled(tokens.map((t) => createOrder(t, checkoutInput('COD'))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(0);
  });

  it('online orders keep stock until the payment is confirmed', async () => {
    const v = await makeVariant(4);
    const token = await makeCart(v.id, 1);
    const order = await createOrder(token, checkoutInput('ESEWA'));
    expect(order.status).toBe('PENDING_PAYMENT');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(4);
  });
});

describe('payment completion', () => {
  async function pendingOrderPayment() {
    const v = await makeVariant(10);
    const order = await createOrder(await makeCart(v.id, 1), checkoutInput('ESEWA'));
    await startPayment({
      kind: 'order',
      targetId: order.id,
      gateway: 'ESEWA',
      amountPaisa: order.totalPaisa,
      name: 'test',
      customer: { name: 'x', phone: '9841234567' },
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    return { v, order, payment };
  }

  it('is idempotent: concurrent and repeated callbacks deduct stock once', async () => {
    const { v, order, payment } = await pendingOrderPayment();
    const results = await Promise.all([
      completePayment(payment.transactionId, order.totalPaisa, 'REF1', { test: 1 }),
      completePayment(payment.transactionId, order.totalPaisa, 'REF1', { test: 2 }),
      completePayment(payment.transactionId, order.totalPaisa, 'REF1', { test: 3 }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.alreadyProcessed)).toHaveLength(2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PLACED');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(9);
  });

  it('rejects a verified amount that differs from the order total', async () => {
    const { order, payment } = await pendingOrderPayment();
    const r = await completePayment(payment.transactionId, order.totalPaisa - 100, 'REF2', {});
    expect(r.ok).toBe(false);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
  });

  it('only one deposit can reserve a pet', async () => {
    const breed = await prisma.breed.findFirstOrThrow({ where: { species: 'DOG' } });
    const listing = await prisma.petListing.create({
      data: {
        code: `T${Date.now().toString(36)}`.slice(0, 20),
        title: 'Test puppy',
        slug: `test-puppy-${Date.now()}`,
        species: 'DOG',
        breedId: breed.id,
        gender: 'MALE',
        dateOfBirth: new Date('2026-08-01'),
        origin: 'LOCAL',
        pricePaisa: 30_000_00,
        depositPaisa: 5_000_00,
      },
    });
    const users = await Promise.all(
      [0, 1].map((i) =>
        prisma.user.create({ data: { name: `Buyer ${i}`, phone: `98${String(Date.now() + i).slice(-8)}`, passwordHash: 'x' } }),
      ),
    );
    for (const u of users) {
      await startPayment({ kind: 'listing', targetId: listing.id, gateway: 'ESEWA', amountPaisa: listing.depositPaisa, name: 't', customer: { name: u.name, phone: u.phone }, userId: u.id });
    }
    const payments = await prisma.payment.findMany({ where: { listingId: listing.id }, orderBy: { id: 'asc' } });
    const results = await Promise.all(payments.map((p) => completePayment(p.transactionId, p.amountPaisa, 'R', {})));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.reason).toBe('listing_unavailable');
    const after = await prisma.petListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.status).toBe('RESERVED');
    expect(after.reservedUntil!.getTime()).toBeGreaterThan(Date.now() + 71 * 3600_000);
    expect(users.map((u) => u.id)).toContain(after.buyerUserId);
  });
});
