import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import { addDays, nptDate } from '../../src/lib/dates.js';

/** A date far enough ahead to pass every service's lead time. */
export const futureDate = (offset = 5) => addDays(nptDate(), offset);

export async function makeVariant(stock: number, priceRupees = 500) {
  const category = await prisma.category.findFirstOrThrow();
  const product = await prisma.product.create({
    data: {
      name: `Test product ${randomUUID().slice(0, 8)}`,
      slug: `test-${randomUUID()}`,
      categoryId: category.id,
      variants: { create: { label: '1 kg', sku: `T-${randomUUID().slice(0, 12)}`, pricePaisa: priceRupees * 100, stock, weightGrams: 1000 } },
    },
    include: { variants: true },
  });
  return product.variants[0]!;
}

export async function makeCart(variantId: number, quantity: number) {
  const cart = await prisma.cart.create({ data: { token: randomUUID(), items: { create: { variantId, quantity } } } });
  return cart.token;
}

export const checkoutInput = (paymentMethod: 'COD' | 'ESEWA' | 'KHALTI' = 'COD') => ({
  customerName: 'Test Buyer',
  customerPhone: '9841234567',
  deliveryZone: 'RING_ROAD' as const,
  line1: 'House 1',
  area: 'Kalanki',
  city: 'Kathmandu',
  district: 'Kathmandu',
  paymentMethod,
});
