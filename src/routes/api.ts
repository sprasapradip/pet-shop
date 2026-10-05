import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { formLimiter, otpLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { productQuerySchema } from '../modules/products/product.schema.js';
import { listProducts } from '../modules/products/product.service.js';
import { listingQuerySchema, listListings } from '../modules/pets/pet.service.js';
import { createBookingSchema } from '../modules/bookings/booking.schema.js';
import * as booking from '../modules/bookings/booking.controller.js';
import * as cart from '../modules/cart/cart.controller.js';
import * as account from '../modules/account/account.controller.js';
import { apiQuote } from '../modules/orders/checkout.controller.js';

const router = Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/products', async (req: Request, res: Response) => {
  const query = productQuerySchema.parse(req.query);
  const { products, meta } = await listProducts(query);
  res.json({
    data: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      url: `/shop/product/${p.slug}`,
      brand: p.brand?.name ?? null,
      category: p.category.slug,
      species: p.species,
      image: p.images[0] ? `/${p.images[0].path}-400.webp` : null,
      fromPaisa: p.variants[0]?.pricePaisa ?? null,
      inStock: p.variants.some((v) => v.stock > 0),
    })),
    meta,
  });
});

router.get('/pet-listings', async (req: Request, res: Response) => {
  const q = listingQuerySchema.parse(req.query);
  const { listings, meta } = await listListings(q);
  res.json({
    data: listings.map((l) => ({
      code: l.code,
      title: l.title,
      url: `/pets/${l.slug}`,
      species: l.species,
      breed: l.breed.name,
      gender: l.gender,
      origin: l.origin,
      dateOfBirth: l.dateOfBirth,
      pricePaisa: l.pricePaisa,
      status: l.status,
      image: l.images[0] ? `/${l.images[0].path}-400.webp` : null,
    })),
    meta,
  });
});

router.get('/services/:type/slots', booking.apiSlots);
router.get('/boarding/availability', booking.apiBoardingAvailability);

router.get('/cart', cart.apiGetCart);
router.post('/cart/items', cart.apiAddItem);
router.patch('/cart/items/:id', cart.apiUpdateItem);
router.delete('/cart/items/:id', cart.apiRemoveItem);
router.get('/checkout/quote', apiQuote);

router.post('/otp', otpLimiter, booking.apiSendOtp);
router.post('/otp/verify', otpLimiter, booking.apiVerifyOtp);

router.post('/bookings', formLimiter, validate(createBookingSchema), booking.apiCreateBooking);
router.post('/bookings/:reference/cancel', booking.cancelSubmit);

router.get('/me/pets', requireAuth, account.apiMyPets);
router.post('/me/pets', requireAuth, account.apiAddPet);

export default router;
