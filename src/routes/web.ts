import { Router } from 'express';
import { requireAuth, redirectIfAuthenticated } from '../middleware/auth.js';
import { authLimiter, formLimiter, otpLimiter } from '../middleware/rate-limit.js';
import { antiSpam } from '../middleware/anti-spam.js';
import { uploadImages } from '../middleware/upload.js';
import * as pages from '../modules/pages/pages.controller.js';
import * as shop from '../modules/products/product.controller.js';
import * as cart from '../modules/cart/cart.controller.js';
import * as checkout from '../modules/orders/checkout.controller.js';
import * as payments from '../modules/payments/payment.controller.js';
import * as pets from '../modules/pets/pet.controller.js';
import * as booking from '../modules/bookings/booking.controller.js';
import * as shelter from '../modules/shelter/shelter.controller.js';
import * as blog from '../modules/blog/blog.controller.js';
import * as auth from '../modules/auth/auth.controller.js';
import * as account from '../modules/account/account.controller.js';
import * as seo from '../modules/seo/seo.controller.js';

const router = Router();

// Health and SEO
router.get('/healthz', pages.healthz);
router.get('/sitemap.xml', seo.sitemap);
router.get('/robots.txt', seo.robots);

// Pages
router.get('/', pages.home);
router.get('/about', pages.about);
router.get('/faq', pages.faq);
router.get('/contact', pages.contactPage);
router.post('/contact', formLimiter, antiSpam, pages.contactSubmit);
for (const p of ['/privacy-policy', '/terms', '/refund-policy', '/animal-sale-policy']) router.get(p, pages.policy);

// Shop
router.get('/shop', shop.shopIndex);
router.get('/shop/category/:slug', shop.shopCategory);
router.get('/shop/product/:slug', shop.productDetail);
router.post('/shop/notify', formLimiter, antiSpam, shop.stockNotify);

// Cart and checkout
router.get('/cart', cart.cartPage);
router.post('/cart/add', cart.addToCartForm);
router.post('/cart/items/:id', cart.updateCartForm);
router.post('/cart/items/:id/remove', cart.removeCartForm);
router.get('/checkout', checkout.checkoutPage);
router.post('/checkout', formLimiter, checkout.checkoutSubmit);
router.get('/checkout/success', checkout.checkoutSuccess);
router.get('/checkout/failed', checkout.checkoutFailed);
router.post('/checkout/pay/:orderNo', checkout.retryPayment);

// Payment gateway callbacks (GET redirects from the gateway)
router.get('/payments/esewa/success', payments.esewaSuccess);
router.get('/payments/esewa/failure', payments.esewaFailure);
router.get('/payments/khalti/return', payments.khaltiReturn);

// Pets for sale
router.get('/pets', pets.petsIndex);
router.get('/pets/:slug', pets.petDetail);
router.post('/pets/:slug/reserve', requireAuth, pets.reservePet);
router.post('/pets/:slug/visit', formLimiter, antiSpam, pets.requestVisit);
router.get('/sell-your-pet', pets.sellPage);
router.post('/sell-your-pet', formLimiter, ...uploadImages('photos', 'sell-offers', 6), antiSpam, pets.sellSubmit);

// Services and booking
router.get('/services', pages.servicesIndex);
router.get('/services/:slug', pages.serviceDetail);
router.get('/book', booking.bookingWizard);
router.post('/book', formLimiter, antiSpam, booking.bookingSubmit);
router.get('/book/verify', booking.verifyPage);
router.post('/book/verify', otpLimiter, booking.verifySubmit);
router.get('/book/confirmation/:reference', booking.confirmation);
router.post('/book/:reference/pay', booking.payAdvance);
router.post('/book/:reference/cancel', booking.cancelSubmit);

// Shelter
router.get('/shelter', shelter.shelterHome);
router.get('/shelter/adopt', shelter.adoptList);
router.get('/shelter/adopt/:slug', shelter.adoptDetail);
router.post('/shelter/adopt/:slug/apply', formLimiter, antiSpam, shelter.adoptApply);
router.get('/shelter/report-animal', shelter.reportPage);
router.post('/shelter/report-animal', formLimiter, ...uploadImages('photos', 'shelter-reports', 4), antiSpam, shelter.reportSubmit);

// Blog
router.get('/blog', blog.blogIndex);
router.get('/blog/:slug', blog.blogPost);

// Auth
router.get('/login', redirectIfAuthenticated, auth.loginPage);
router.post('/login', authLimiter, auth.loginSubmit);
router.get('/register', redirectIfAuthenticated, auth.registerPage);
router.post('/register', authLimiter, antiSpam, auth.registerSubmit);
router.post('/logout', auth.logout);
router.get('/forgot-password', auth.forgotPage);
router.post('/forgot-password', authLimiter, auth.forgotSubmit);
router.get('/reset-password/:token', auth.resetPage);
router.post('/reset-password/:token', authLimiter, auth.resetSubmit);

// Customer account
const acc = Router();
acc.use(requireAuth);
acc.get('/', account.dashboard);
acc.get('/orders', account.orders);
acc.get('/orders/:orderNo', account.orderDetail);
acc.get('/orders/:orderNo/invoice', account.invoice);
acc.get('/bookings', account.bookings);
acc.get('/bookings/:reference/reschedule', booking.reschedulePage);
acc.post('/bookings/:reference/reschedule', booking.rescheduleSubmit);
acc.post('/bookings/:reference/cancel', booking.cancelSubmit);
acc.get('/pets', account.pets);
acc.get('/pets/new', account.petNewPage);
acc.post('/pets', ...uploadImages('photo', 'pets', 1), account.petCreate);
acc.get('/pets/:id', account.petDetail);
acc.get('/pets/:id/edit', account.petEditPage);
acc.post('/pets/:id', ...uploadImages('photo', 'pets', 1), account.petUpdate);
acc.post('/pets/:id/delete', account.petDelete);
acc.post('/pets/:id/weights', account.petAddWeight);
acc.get('/profile', account.profilePage);
acc.post('/profile', account.profileUpdate);
acc.post('/profile/password', authLimiter, account.passwordUpdate);
acc.post('/addresses/:id/delete', account.addressDelete);
acc.post('/delete', account.accountDelete);
router.use('/account', acc);

export default router;
