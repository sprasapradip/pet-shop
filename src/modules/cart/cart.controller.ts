import type { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { setSeo } from '../../lib/seo.js';
import { intParam } from '../../lib/session-helpers.js';
import { addItem, cartCount, getCart, getOrCreateCart, removeItem, setItemQuantity, summarizeCart } from './cart.service.js';

const addSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});
const qtySchema = z.object({ quantity: z.coerce.number().int().min(0).max(50) });

export async function cartPage(req: Request, res: Response) {
  const cart = await getCart(req.session.cartToken);
  setSeo(res, { title: 'Your cart | The Everest Kennel', noindex: true });
  res.set('Cache-Control', 'no-store');
  res.render('shop/cart', { summary: summarizeCart(cart) });
}

// ----- HTML form endpoints (work without JavaScript) -----

export async function addToCartForm(req: Request, res: Response) {
  const input = parse(addSchema, req.body);
  const cart = await getOrCreateCart(req);
  await addItem(cart.id, input.variantId, input.quantity);
  flash(req, 'success', 'Added to your cart.');
  res.redirect(303, req.body.redirect === 'back' ? (req.get('Referer') ?? '/cart') : '/cart');
}

export async function updateCartForm(req: Request, res: Response) {
  const { quantity } = parse(qtySchema, req.body);
  const cart = await getOrCreateCart(req);
  await setItemQuantity(cart.id, intParam(req.params.id), quantity);
  res.redirect(303, '/cart');
}

export async function removeCartForm(req: Request, res: Response) {
  const cart = await getOrCreateCart(req);
  await removeItem(cart.id, intParam(req.params.id));
  flash(req, 'info', 'Item removed.');
  res.redirect(303, '/cart');
}

// ----- JSON API (/api/v1/cart/items) -----

async function cartJson(req: Request) {
  const cart = await getCart(req.session.cartToken);
  const s = summarizeCart(cart);
  return {
    count: await cartCount(req.session.cartToken),
    subtotalPaisa: s.subtotalPaisa,
    items: s.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      name: i.variant.product.name,
      label: i.variant.label,
      quantity: i.quantity,
      unitPaisa: i.variant.pricePaisa,
      totalPaisa: i.variant.pricePaisa * i.quantity,
    })),
  };
}

export async function apiAddItem(req: Request, res: Response) {
  const input = parse(addSchema, req.body);
  const cart = await getOrCreateCart(req);
  const item = await addItem(cart.id, input.variantId, input.quantity);
  res.status(201).location(`/api/v1/cart/items/${item.id}`).json({ data: await cartJson(req) });
}

export async function apiUpdateItem(req: Request, res: Response) {
  const { quantity } = parse(qtySchema, req.body);
  const cart = await getOrCreateCart(req);
  await setItemQuantity(cart.id, intParam(req.params.id), quantity);
  res.json({ data: await cartJson(req) });
}

export async function apiRemoveItem(req: Request, res: Response) {
  const cart = await getOrCreateCart(req);
  await removeItem(cart.id, intParam(req.params.id));
  res.json({ data: await cartJson(req) });
}

export async function apiGetCart(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store').json({ data: await cartJson(req) });
}
