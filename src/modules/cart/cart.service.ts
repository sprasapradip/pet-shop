import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';

const MAX_QTY = 50;

const cartInclude = {
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      variant: {
        include: {
          product: { select: { id: true, name: true, slug: true, isActive: true, images: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } },
        },
      },
    },
  },
};

export async function cartCount(token: string | undefined): Promise<number> {
  if (!token) return 0;
  const agg = await prisma.cartItem.aggregate({ where: { cart: { token } }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

/** Returns the session cart, creating one on first use. Logged in users keep one cart across devices. */
export async function getOrCreateCart(req: Request) {
  const userId = req.session.user?.id;
  if (req.session.cartToken) {
    const cart = await prisma.cart.findUnique({ where: { token: req.session.cartToken } });
    if (cart) return cart;
  }
  if (userId) {
    const existing = await prisma.cart.findUnique({ where: { userId } });
    if (existing) {
      req.session.cartToken = existing.token;
      return existing;
    }
  }
  const cart = await prisma.cart.create({ data: { token: randomUUID(), userId } });
  req.session.cartToken = cart.token;
  return cart;
}

export async function getCart(token: string | undefined) {
  if (!token) return null;
  return prisma.cart.findUnique({ where: { token }, include: cartInclude });
}

export type DetailedCart = NonNullable<Awaited<ReturnType<typeof getCart>>>;

export function summarizeCart(cart: DetailedCart | null) {
  const items = (cart?.items ?? []).filter((i) => i.variant.isActive && i.variant.product.isActive);
  const subtotalPaisa = items.reduce((s, i) => s + i.variant.pricePaisa * i.quantity, 0);
  const weightGrams = items.reduce((s, i) => s + (i.variant.weightGrams ?? 500) * i.quantity, 0);
  const problems = items
    .filter((i) => i.quantity > i.variant.stock)
    .map((i) => ({ itemId: i.id, message: `${i.variant.product.name} (${i.variant.label}): only ${i.variant.stock} in stock` }));
  return { items, subtotalPaisa, weightGrams, count: items.reduce((s, i) => s + i.quantity, 0), problems };
}

async function loadVariant(variantId: number) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant || !variant.isActive || !variant.product.isActive) throw notFound('Product');
  return variant;
}

export async function addItem(cartId: number, variantId: number, quantity: number) {
  const variant = await loadVariant(variantId);
  const existing = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const nextQty = Math.min(MAX_QTY, (existing?.quantity ?? 0) + quantity);
  if (variant.stock <= 0) throw new AppError(409, 'out_of_stock', `${variant.product.name} is out of stock`);
  if (nextQty > variant.stock) {
    throw new AppError(409, 'insufficient_stock', `Only ${variant.stock} of ${variant.product.name} (${variant.label}) available`);
  }
  return prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    create: { cartId, variantId, quantity: nextQty },
    update: { quantity: nextQty },
  });
}

export async function setItemQuantity(cartId: number, itemId: number, quantity: number) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId }, include: { variant: true } });
  if (!item) throw notFound('Cart item');
  if (quantity <= 0) return prisma.cartItem.delete({ where: { id: item.id } });
  const qty = Math.min(MAX_QTY, quantity);
  if (qty > item.variant.stock) throw new AppError(409, 'insufficient_stock', `Only ${item.variant.stock} available`);
  return prisma.cartItem.update({ where: { id: item.id }, data: { quantity: qty } });
}

export async function removeItem(cartId: number, itemId: number) {
  const { count } = await prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
  if (!count) throw notFound('Cart item');
}

export async function clearCart(token: string) {
  await prisma.cartItem.deleteMany({ where: { cart: { token } } });
}

/** After login: merge the guest cart into the user's saved cart. Returns the token to keep in session. */
export async function attachCartToUser(guestToken: string | undefined, userId: number): Promise<string | undefined> {
  const userCart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  const guestCart = guestToken ? await prisma.cart.findUnique({ where: { token: guestToken }, include: { items: true } }) : null;

  if (!guestCart || guestCart.userId === userId) return userCart?.token ?? guestCart?.token;
  if (!userCart) {
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userId } });
    return guestCart.token;
  }
  await prisma.$transaction(async (tx) => {
    for (const item of guestCart.items) {
      const existing = userCart.items.find((i) => i.variantId === item.variantId);
      if (existing) {
        await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: Math.min(MAX_QTY, existing.quantity + item.quantity) } });
      } else {
        await tx.cartItem.create({ data: { cartId: userCart.id, variantId: item.variantId, quantity: item.quantity } });
      }
    }
    await tx.cart.delete({ where: { id: guestCart.id } });
  });
  return userCart.token;
}
