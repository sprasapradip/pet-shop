import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { slugify } from '../../lib/slug.js';
import { toCsv, parseCsv } from '../../lib/csv.js';
import { pageMeta, pageParams, pageUrl } from '../../lib/pagination.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { deleteImage, uploadedImages } from '../../middleware/upload.js';
import { bustCatalogCache } from '../categories/category.service.js';
import { adminPage, f, qs } from './admin.helpers.js';

// ---------------- Products ----------------

const productSchema = z.object({
  name: f.text(191, 2),
  slug: f.slug,
  categoryId: f.int(1),
  brandId: f.optInt(1),
  shortDesc: f.nullableText(300),
  description: f.nullableText(20_000),
  species: z.preprocess((v) => (v === '' ? null : v), f.species.nullable()),
  lifeStage: z.preprocess((v) => (v === '' ? null : v), z.enum(['puppy', 'adult', 'senior', 'all']).nullable()),
  isFeatured: f.bool,
  isActive: f.bool,
  metaTitle: f.nullableText(70),
  metaDesc: f.nullableText(160),
});

const variantRowSchema = z.object({
  id: f.optInt(1),
  label: f.text(80, 1),
  sku: f.text(60, 2),
  pricePaisa: f.rupees,
  comparePaisa: f.optRupees,
  lowStockAlert: f.int(0, 100_000),
  weightGrams: f.optInt(0, 1_000_000),
  isActive: f.bool,
  stock: f.optInt(0, 1_000_000),
});

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);

/** Variants are submitted as parallel arrays (v_label, v_sku, ...) so the form works with flat urlencoded bodies. */
function parseVariants(body: Record<string, unknown>) {
  const labels = arr(body.v_label);
  const rows = labels.map((_, i) => ({
    id: arr(body.v_id)[i] ?? '',
    label: labels[i],
    sku: arr(body.v_sku)[i],
    pricePaisa: arr(body.v_price)[i],
    comparePaisa: arr(body.v_compare)[i] ?? '',
    lowStockAlert: arr(body.v_low)[i] || '5',
    weightGrams: arr(body.v_weight)[i] ?? '',
    isActive: arr(body.v_active).includes(String(i)) ? 'on' : '',
    stock: arr(body.v_stock)[i] ?? '',
  }));
  return rows
    .filter((r) => r.label?.trim() || r.sku?.trim())
    .map((r, i) => {
      const parsed = variantRowSchema.safeParse(r);
      if (!parsed.success) {
        throw new AppError(422, 'validation_error', `Variant ${i + 1}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      }
      return parsed.data;
    });
}

export async function productsIndex(req: Request, res: Response) {
  const q = qs(req, 'q');
  const categoryId = intParam(req.query.category);
  const low = req.query.low === '1';
  const { page, take, skip } = pageParams(req.query.page, 30, 10_000);
  const where: Prisma.ProductWhereInput = {
    ...(q ? { OR: [{ name: { contains: q } }, { variants: { some: { sku: { contains: q } } } }] } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  if (low) {
    const lowIds = await prisma.$queryRaw<{ productId: number }[]>`SELECT DISTINCT productId FROM product_variants WHERE stock <= lowStockAlert`;
    where.id = { in: lowIds.map((r) => r.productId) };
  }
  const [total, products, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, brand: true, variants: { orderBy: { pricePaisa: 'asc' } }, images: { take: 1, orderBy: { sortOrder: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
  ]);
  adminPage(res, 'Products');
  res.render('admin/products/index', {
    products,
    categories,
    filters: { q, categoryId, low },
    meta: pageMeta(total, page, 30),
    pageLink: (p: number) => pageUrl('/admin/products', req.query as Record<string, unknown>, p),
  });
}

async function productFormData() {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.brand.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return { categories, brands };
}

export async function productNew(_req: Request, res: Response) {
  adminPage(res, 'New product');
  res.render('admin/products/form', { product: null, ...(await productFormData()) });
}

export async function productEdit(req: Request, res: Response) {
  const product = await prisma.product.findUnique({
    where: { id: intParam(req.params.id) },
    include: {
      variants: { orderBy: { id: 'asc' }, include: { stockMovements: { orderBy: { createdAt: 'desc' }, take: 5 } } },
      images: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!product) throw notFound('Product');
  adminPage(res, `Edit ${product.name}`);
  res.render('admin/products/form', { product, ...(await productFormData()) });
}

export async function productCreate(req: Request, res: Response) {
  const data = parse(productSchema, req.body);
  const variants = parseVariants(req.body);
  if (!variants.length) throw new AppError(422, 'validation_error', 'Add at least one variant (size/weight) with a price');
  const userId = req.session.user!.id;
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        ...data,
        slug: data.slug || slugify(data.name),
        variants: {
          create: variants.map(({ id: _id, stock, ...v }) => ({ ...v, stock: stock ?? 0 })),
        },
      },
      include: { variants: true },
    });
    for (const v of created.variants) {
      if (v.stock > 0) await tx.stockMovement.create({ data: { variantId: v.id, change: v.stock, reason: 'INITIAL', userId } });
    }
    return created;
  });
  bustCatalogCache();
  await audit(req, 'create', 'Product', product.id, null, product);
  flash(req, 'success', 'Product created. Now add photos.');
  res.redirect(303, `/admin/products/${product.id}/edit`);
}

export async function productUpdate(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const before = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!before) throw notFound('Product');
  const data = parse(productSchema, req.body);
  const variants = parseVariants(req.body);
  const userId = req.session.user!.id;

  const after = await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { ...data, slug: data.slug || slugify(data.name) } });
    for (const v of variants) {
      const { id: variantId, stock, ...fields } = v;
      if (variantId && before.variants.some((b) => b.id === variantId)) {
        // Stock is only changed through adjustments so every change has a movement.
        await tx.productVariant.update({ where: { id: variantId }, data: fields });
      } else {
        const created = await tx.productVariant.create({ data: { ...fields, productId: id, stock: stock ?? 0 } });
        if (created.stock > 0) await tx.stockMovement.create({ data: { variantId: created.id, change: created.stock, reason: 'INITIAL', userId } });
      }
    }
    return tx.product.findUnique({ where: { id }, include: { variants: true } });
  });
  bustCatalogCache();
  await audit(req, 'update', 'Product', id, before, after);
  flash(req, 'success', 'Product saved.');
  res.redirect(303, `/admin/products/${id}/edit`);
}

export async function productDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const product = await prisma.product.findUnique({ where: { id }, include: { images: true, variants: { include: { _count: { select: { orderItems: true } } } } } });
  if (!product) throw notFound('Product');
  const hasOrders = product.variants.some((v) => v._count.orderItems > 0);
  if (hasOrders) {
    // Keep order history intact: deactivate instead of deleting.
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    flash(req, 'info', 'This product has orders, so it was hidden instead of deleted.');
  } else {
    await prisma.product.delete({ where: { id } });
    await Promise.all(product.images.map((i) => deleteImage(i.path)));
    flash(req, 'success', 'Product deleted.');
  }
  bustCatalogCache();
  await audit(req, hasOrders ? 'deactivate' : 'delete', 'Product', id, product, null);
  res.redirect(303, '/admin/products');
}

export async function productImagesUpload(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const product = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { images: true } } } });
  if (!product) throw notFound('Product');
  const paths = uploadedImages(req);
  await prisma.productImage.createMany({
    data: paths.map((path, i) => ({ productId: id, path, alt: product.name, sortOrder: product._count.images + i })),
  });
  bustCatalogCache();
  await audit(req, 'upload_images', 'Product', id, null, { paths });
  flash(req, 'success', `${paths.length} photo(s) added.`);
  res.redirect(303, `/admin/products/${id}/edit#images`);
}

export async function productImageUpdate(req: Request, res: Response) {
  const image = await prisma.productImage.findUnique({ where: { id: intParam(req.params.imageId) } });
  if (!image) throw notFound('Image');
  if (req.body.action === 'delete') {
    await prisma.productImage.delete({ where: { id: image.id } });
    await deleteImage(image.path);
    await audit(req, 'delete_image', 'Product', image.productId, image, null);
  } else {
    const { alt, sortOrder } = parse(z.object({ alt: f.text(191, 1), sortOrder: f.int(0, 1000) }), req.body);
    await prisma.productImage.update({ where: { id: image.id }, data: { alt, sortOrder } });
  }
  bustCatalogCache();
  res.redirect(303, `/admin/products/${image.productId}/edit#images`);
}

const adjustSchema = z.object({
  change: z.coerce.number().int().refine((n) => n !== 0, 'Change cannot be zero'),
  reason: z.enum(['RESTOCK', 'DAMAGED', 'EXPIRED', 'CORRECTION', 'RETURN', 'SHOP_SALE']),
  reference: f.optText(80),
});

export async function stockAdjust(req: Request, res: Response) {
  const variantId = intParam(req.params.variantId);
  const input = parse(adjustSchema, req.body);
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw notFound('Variant');
  if (variant.stock + input.change < 0) throw new AppError(422, 'validation_error', `Stock cannot go below zero (current ${variant.stock})`);
  await prisma.$transaction([
    prisma.productVariant.update({ where: { id: variantId }, data: { stock: { increment: input.change } } }),
    prisma.stockMovement.create({
      data: { variantId, change: input.change, reason: input.reason, reference: input.reference, userId: req.session.user!.id },
    }),
  ]);
  bustCatalogCache();
  await audit(req, 'stock_adjust', 'ProductVariant', variantId, { stock: variant.stock }, { stock: variant.stock + input.change, ...input });
  flash(req, 'success', `Stock for ${variant.sku} adjusted by ${input.change > 0 ? '+' : ''}${input.change}.`);
  res.redirect(303, `/admin/products/${variant.productId}/edit#variants`);
}

const CSV_COLUMNS = [
  'product_slug', 'product_name', 'category_slug', 'brand', 'species', 'life_stage', 'short_desc',
  'featured', 'active', 'sku', 'variant_label', 'price', 'compare_price', 'stock', 'low_stock_alert', 'weight_grams',
];

export async function productsExport(req: Request, res: Response) {
  const variants = await prisma.productVariant.findMany({
    include: { product: { include: { category: true, brand: true } } },
    orderBy: [{ productId: 'asc' }, { id: 'asc' }],
  });
  const rows = variants.map((v) => ({
    product_slug: v.product.slug,
    product_name: v.product.name,
    category_slug: v.product.category.slug,
    brand: v.product.brand?.name ?? '',
    species: v.product.species ?? '',
    life_stage: v.product.lifeStage ?? '',
    short_desc: v.product.shortDesc ?? '',
    featured: v.product.isFeatured ? 1 : 0,
    active: v.product.isActive && v.isActive ? 1 : 0,
    sku: v.sku,
    variant_label: v.label,
    price: v.pricePaisa / 100,
    compare_price: v.comparePaisa ? v.comparePaisa / 100 : '',
    stock: v.stock,
    low_stock_alert: v.lowStockAlert,
    weight_grams: v.weightGrams ?? '',
  }));
  await audit(req, 'export', 'Product', null, null, { rows: rows.length });
  res
    .type('text/csv')
    .set('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(toCsv(rows, CSV_COLUMNS));
}

const csvRowSchema = z.object({
  product_slug: z.string().trim().optional(),
  product_name: z.string().trim().min(2),
  category_slug: z.string().trim().min(1),
  brand: z.string().trim().optional(),
  species: z.preprocess((v) => (v ? String(v).toUpperCase() : null), f.species.nullable()),
  life_stage: z.preprocess((v) => (v ? String(v).toLowerCase() : null), z.enum(['puppy', 'adult', 'senior', 'all']).nullable()),
  short_desc: z.string().trim().max(300).optional(),
  featured: z.string().optional(),
  active: z.string().optional(),
  sku: z.string().trim().min(2).max(60),
  variant_label: z.string().trim().min(1).max(80),
  price: z.coerce.number().min(0),
  compare_price: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(0).optional()),
  stock: z.coerce.number().int().min(0),
  low_stock_alert: z.preprocess((v) => (v === '' ? 5 : v), z.coerce.number().int().min(0)),
  weight_grams: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).optional()),
});

/** Upserts products by slug and variants by SKU. Stock differences are written as CSV_IMPORT movements. */
export async function productsImport(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new AppError(422, 'validation_error', 'Choose a CSV file');
  const rows = parseCsv(file.buffer.toString('utf8'));
  if (!rows.length) throw new AppError(422, 'validation_error', 'The CSV has no rows');
  if (rows.length > 5000) throw new AppError(422, 'validation_error', 'Import at most 5000 rows at a time');

  const userId = req.session.user!.id;
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  for (const [i, raw] of rows.entries()) {
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
      continue;
    }
    const r = parsed.data;
    const categoryId = categories.get(r.category_slug);
    if (!categoryId) {
      errors.push(`Row ${i + 2}: unknown category "${r.category_slug}"`);
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        let brandId: number | null = null;
        if (r.brand) {
          const brand = await tx.brand.upsert({
            where: { slug: slugify(r.brand) },
            create: { name: r.brand, slug: slugify(r.brand) },
            update: {},
          });
          brandId = brand.id;
        }
        const slug = r.product_slug || slugify(r.product_name);
        const productData = {
          name: r.product_name,
          categoryId,
          brandId,
          species: r.species,
          lifeStage: r.life_stage,
          shortDesc: r.short_desc || null,
          isFeatured: r.featured === '1',
          isActive: r.active !== '0',
        };
        const product = await tx.product.upsert({ where: { slug }, create: { slug, ...productData }, update: productData });
        const existing = await tx.productVariant.findUnique({ where: { sku: r.sku } });
        const variantData = {
          label: r.variant_label,
          pricePaisa: Math.round(r.price * 100),
          comparePaisa: r.compare_price ? Math.round(r.compare_price * 100) : null,
          lowStockAlert: r.low_stock_alert,
          weightGrams: r.weight_grams ?? null,
          isActive: r.active !== '0',
        };
        if (existing) {
          if (existing.productId !== product.id) throw new Error(`SKU ${r.sku} belongs to another product`);
          await tx.productVariant.update({ where: { id: existing.id }, data: { ...variantData, stock: r.stock } });
          if (r.stock !== existing.stock) {
            await tx.stockMovement.create({ data: { variantId: existing.id, change: r.stock - existing.stock, reason: 'CSV_IMPORT', userId } });
          }
          updated++;
        } else {
          const v = await tx.productVariant.create({ data: { ...variantData, sku: r.sku, productId: product.id, stock: r.stock } });
          if (r.stock) await tx.stockMovement.create({ data: { variantId: v.id, change: r.stock, reason: 'CSV_IMPORT', userId } });
          created++;
        }
      });
    } catch (err) {
      errors.push(`Row ${i + 2}: ${(err as Error).message.split('\n').pop()}`);
    }
  }
  bustCatalogCache();
  await audit(req, 'import', 'Product', null, null, { created, updated, errors: errors.length });
  flash(req, errors.length ? 'error' : 'success', `Import finished: ${created} variants created, ${updated} updated, ${errors.length} errors.`);
  for (const e of errors.slice(0, 10)) flash(req, 'error', e);
  res.redirect(303, '/admin/products');
}

// ---------------- Categories ----------------

const categorySchema = z.object({
  name: f.text(120, 2),
  slug: f.slug,
  parentId: f.optInt(1),
  description: f.nullableText(5000),
  sortOrder: f.int(0, 10_000),
  isActive: f.bool,
  metaTitle: f.nullableText(70),
  metaDesc: f.nullableText(160),
});

export async function categoriesIndex(req: Request, res: Response) {
  const editing = intParam(req.query.edit);
  const categories = await prisma.category.findMany({
    include: { parent: true, _count: { select: { products: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  adminPage(res, 'Categories');
  res.render('admin/categories', { categories, editing: categories.find((c) => c.id === editing) ?? null });
}

export async function categorySave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const data = parse(categorySchema, req.body);
  const payload = { ...data, slug: data.slug || slugify(data.name) };
  if (id) {
    if (payload.parentId === id) throw new AppError(422, 'validation_error', 'A category cannot be its own parent');
    const before = await prisma.category.findUniqueOrThrow({ where: { id } });
    const after = await prisma.category.update({ where: { id }, data: payload });
    await audit(req, 'update', 'Category', id, before, after);
  } else {
    const created = await prisma.category.create({ data: payload });
    await audit(req, 'create', 'Category', created.id, null, created);
  }
  bustCatalogCache();
  flash(req, 'success', 'Category saved.');
  res.redirect(303, '/admin/categories');
}

export async function categoryDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const cat = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
  if (!cat) throw notFound('Category');
  if (cat._count.products || cat._count.children) {
    throw new AppError(422, 'in_use', 'Move its products and sub-categories first, or deactivate it instead.');
  }
  await prisma.category.delete({ where: { id } });
  bustCatalogCache();
  await audit(req, 'delete', 'Category', id, cat, null);
  flash(req, 'success', 'Category deleted.');
  res.redirect(303, '/admin/categories');
}

// ---------------- Brands ----------------

const brandSchema = z.object({ name: f.text(120, 1), slug: f.slug });

export async function brandsIndex(req: Request, res: Response) {
  const editing = intParam(req.query.edit);
  const brands = await prisma.brand.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
  adminPage(res, 'Brands');
  res.render('admin/brands', { brands, editing: brands.find((b) => b.id === editing) ?? null });
}

export async function brandSave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const data = parse(brandSchema, req.body);
  const payload = { name: data.name, slug: data.slug || slugify(data.name) };
  if (id) {
    const before = await prisma.brand.findUniqueOrThrow({ where: { id } });
    await prisma.brand.update({ where: { id }, data: payload });
    await audit(req, 'update', 'Brand', id, before, payload);
  } else {
    const created = await prisma.brand.create({ data: payload });
    await audit(req, 'create', 'Brand', created.id, null, created);
  }
  bustCatalogCache();
  flash(req, 'success', 'Brand saved.');
  res.redirect(303, '/admin/brands');
}

export async function brandDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const brand = await prisma.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!brand) throw notFound('Brand');
  if (brand._count.products) throw new AppError(422, 'in_use', 'This brand still has products.');
  await prisma.brand.delete({ where: { id } });
  bustCatalogCache();
  await audit(req, 'delete', 'Brand', id, brand, null);
  flash(req, 'success', 'Brand deleted.');
  res.redirect(303, '/admin/brands');
}
