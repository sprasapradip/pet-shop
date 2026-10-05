import { Router, type RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireRole, requireStaff, STAFF_ROLES } from '../middleware/auth.js';
import { uploadCsv, uploadImages } from '../middleware/upload.js';
import * as dash from '../modules/admin/dashboard.controller.js';
import * as catalog from '../modules/admin/catalog.controller.js';
import * as pets from '../modules/admin/pets.controller.js';
import * as orders from '../modules/admin/orders.controller.js';
import * as bookings from '../modules/admin/bookings.controller.js';
import * as shelter from '../modules/admin/shelter.controller.js';
import * as inquiries from '../modules/admin/inquiries.controller.js';
import * as content from '../modules/admin/content.controller.js';
import * as system from '../modules/admin/system.controller.js';
import { invoice } from '../modules/account/account.controller.js';

const router = Router();

/** Re-reads role/active flag from the DB so demotions and deactivations apply immediately. */
const refreshUser: RequestHandler = async (req, res, next) => {
  const sessionUser = req.session.user;
  if (!sessionUser) return next();
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id }, select: { role: true, isActive: true, name: true } });
  if (!user || !user.isActive) {
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return res.redirect('/login');
  }
  if (user.role !== sessionUser.role) {
    // Privilege change: regenerate the session id.
    await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    req.session.user = { id: sessionUser.id, name: user.name, role: user.role };
    res.locals.user = req.session.user;
    res.locals.isStaff = STAFF_ROLES.includes(user.role);
    res.locals.isAdmin = user.role === 'ADMIN';
  }
  return next();
};

router.use(refreshUser, requireStaff, (req, res, next) => {
  res.locals.layout = 'layouts/admin';
  res.locals.role = req.session.user!.role;
  next();
});

const ops: Role[] = ['STAFF', 'ADMIN'];
const opsOnly = requireRole(...ops);
const clinical = requireRole('VET', 'STAFF', 'ADMIN');

router.get('/', dash.dashboard);

// Catalog
router.get('/products', opsOnly, catalog.productsIndex);
router.get('/products/new', opsOnly, catalog.productNew);
router.get('/products/export.csv', opsOnly, catalog.productsExport);
router.post('/products/import', opsOnly, ...uploadCsv('file'), catalog.productsImport);
router.post('/products', opsOnly, catalog.productCreate);
router.get('/products/:id/edit', opsOnly, catalog.productEdit);
router.post('/products/:id', opsOnly, catalog.productUpdate);
router.post('/products/:id/delete', opsOnly, catalog.productDelete);
router.post('/products/:id/images', opsOnly, ...uploadImages('images', 'products', 6), catalog.productImagesUpload);
router.post('/product-images/:imageId', opsOnly, catalog.productImageUpdate);
router.post('/variants/:variantId/adjust', opsOnly, catalog.stockAdjust);
router.get('/categories', opsOnly, catalog.categoriesIndex);
router.post('/categories', opsOnly, catalog.categorySave);
router.post('/categories/:id', opsOnly, catalog.categorySave);
router.post('/categories/:id/delete', opsOnly, catalog.categoryDelete);
router.get('/brands', opsOnly, catalog.brandsIndex);
router.post('/brands', opsOnly, catalog.brandSave);
router.post('/brands/:id', opsOnly, catalog.brandSave);
router.post('/brands/:id/delete', opsOnly, catalog.brandDelete);

// Pet listings
router.get('/pets', opsOnly, pets.listingsIndex);
router.get('/pets/new', opsOnly, pets.listingNew);
router.get('/pets/breeds', opsOnly, pets.breedsIndex);
router.post('/pets/breeds', opsOnly, pets.breedCreate);
router.post('/pets/breeds/:id/delete', opsOnly, pets.breedDelete);
router.post('/pets', opsOnly, pets.listingCreate);
router.get('/pets/:id/edit', opsOnly, pets.listingEdit);
router.post('/pets/:id', opsOnly, pets.listingUpdate);
router.post('/pets/:id/sell', opsOnly, pets.listingSell);
router.post('/pets/:id/delete', opsOnly, pets.listingDelete);
router.post('/pets/:id/images', opsOnly, ...uploadImages('images', 'pets', 6), pets.listingImagesUpload);
router.post('/pet-images/:imageId', opsOnly, pets.listingImageUpdate);

// Orders
router.get('/orders', opsOnly, orders.ordersIndex);
router.get('/orders/cod', opsOnly, orders.codReport);
router.get('/orders/:id', opsOnly, orders.orderDetail);
router.post('/orders/:id/status', opsOnly, orders.orderStatus);
router.post('/orders/:id/cod', opsOnly, orders.orderCodCollected);
router.post('/orders/:id/note', opsOnly, orders.orderNote);
router.get('/invoices/:orderNo', opsOnly, invoice);

// Bookings, boarding, medical
router.get('/bookings', clinical, bookings.bookingsIndex);
router.get('/bookings/calendar', clinical, bookings.bookingsCalendar);
router.get('/bookings/new', opsOnly, bookings.bookingNewPage);
router.post('/bookings', opsOnly, bookings.bookingCreate);
router.get('/bookings/:id', clinical, bookings.bookingDetail);
router.post('/bookings/:id', clinical, bookings.bookingUpdate);
router.get('/boarding', opsOnly, bookings.boardingIndex);
router.post('/boarding/units', requireAdmin, bookings.unitSave);
router.post('/boarding/units/:id', requireAdmin, bookings.unitSave);
router.post('/boarding/:id/check', opsOnly, bookings.boardingCheck);
router.post('/boarding/:id/log', opsOnly, ...uploadImages('photo', 'boarding', 1), bookings.boardingLog);
router.get('/medical', clinical, bookings.medicalIndex);
router.get('/medical/pets/:petId', clinical, bookings.medicalPet);
router.post('/medical/pets/:petId/vaccinations', clinical, bookings.addVaccination);
router.post('/medical/pets/:petId/records', clinical, bookings.addMedical);
router.post('/medical/pets/:petId/:kind/:recordId/delete', clinical, bookings.deleteMedicalRecord);

// Shelter
router.get('/shelter', opsOnly, shelter.shelterIndex);
router.get('/shelter/new', opsOnly, shelter.animalNew);
router.post('/shelter', opsOnly, ...uploadImages('photo', 'shelter', 1), shelter.animalSave);
router.get('/shelter/applications', opsOnly, shelter.applicationsIndex);
router.get('/shelter/applications/:id', opsOnly, shelter.applicationDetail);
router.post('/shelter/applications/:id/status', opsOnly, shelter.applicationStatus);
router.get('/shelter/:id/edit', opsOnly, shelter.animalEdit);
router.post('/shelter/:id', opsOnly, ...uploadImages('photo', 'shelter', 1), shelter.animalSave);

// Inquiries and customers
router.get('/inquiries', opsOnly, inquiries.inquiriesIndex);
router.get('/inquiries/:id', opsOnly, inquiries.inquiryDetail);
router.post('/inquiries/:id/status', opsOnly, inquiries.inquiryStatus);
router.get('/customers', opsOnly, inquiries.customersIndex);
router.get('/customers/:id', opsOnly, inquiries.customerDetail);
router.post('/customers/:id/notes', opsOnly, inquiries.customerNotes);

// Content
router.get('/posts', opsOnly, content.postsIndex);
router.get('/posts/new', opsOnly, content.postForm);
router.post('/posts', opsOnly, ...uploadImages('cover', 'blog', 1), content.postSave);
router.get('/posts/:id/edit', opsOnly, content.postForm);
router.post('/posts/:id', opsOnly, ...uploadImages('cover', 'blog', 1), content.postSave);
router.post('/posts/:id/delete', opsOnly, content.postDelete);
router.get('/faqs', opsOnly, content.faqsIndex);
router.post('/faqs', opsOnly, content.faqSave);
router.post('/faqs/:id', opsOnly, content.faqSave);
router.post('/faqs/:id/delete', opsOnly, content.faqDelete);
router.get('/testimonials', opsOnly, content.testimonialsIndex);
router.post('/testimonials', opsOnly, content.testimonialSave);
router.post('/testimonials/:id', opsOnly, content.testimonialSave);
router.post('/testimonials/:id/delete', opsOnly, content.testimonialDelete);

// Reports (staff + admin), settings/users/audit (admin only)
router.get('/reports', opsOnly, system.reports);
router.get('/settings', requireAdmin, system.settingsPage);
router.post('/settings/hours', requireAdmin, system.hoursSave);
router.post('/settings/blocked-dates', requireAdmin, system.blockedDateAdd);
router.post('/settings/blocked-dates/:id/delete', requireAdmin, system.blockedDateDelete);
router.post('/settings/:section', requireAdmin, system.settingsSave);
router.get('/services/:id', requireAdmin, system.serviceForm);
router.post('/services/:id', requireAdmin, system.serviceSave);
router.get('/users', requireAdmin, system.usersIndex);
router.post('/users', requireAdmin, system.userCreate);
router.post('/users/:id', requireAdmin, system.userUpdate);
router.get('/audit-log', requireAdmin, system.auditLog);

export default router;
