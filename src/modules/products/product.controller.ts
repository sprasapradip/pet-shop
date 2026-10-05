import type { Request, Response } from 'express';
import { notFound } from '../../lib/errors.js';
import { breadcrumbLd, setSeo, absoluteUrl } from '../../lib/seo.js';
import { pageUrl } from '../../lib/pagination.js';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { prisma } from '../../lib/prisma.js';
import { productQuerySchema } from './product.schema.js';
import { getProductBySlug, listProducts, relatedProducts, stockState } from './product.service.js';
import { getCategoryBySlug, listActiveCategories, listBrands } from '../categories/category.service.js';
import { stockNotifySchema } from '../inquiries/inquiry.schema.js';
import { createInquiry } from '../inquiries/inquiry.service.js';

const FILTER_KEYS = ['q', 'brand', 'species', 'lifeStage', 'minPrice', 'maxPrice', 'category'] as const;

/** Anonymous catalog pages may be cached by the browser (private: pages carry a per-visitor CSRF token). */
function catalogCache(req: Request, res: Response) {
  if (!req.session.user && !req.session.cartToken) res.set('Cache-Control', 'private, max-age=300');
}

async function renderListing(req: Request, res: Response, categorySlug?: string) {
  const query = productQuerySchema.parse(req.query);
  const category = categorySlug ? await getCategoryBySlug(categorySlug) : null;
  if (categorySlug && !category) throw notFound('Category');

  const [{ products, meta }, categories, brands] = await Promise.all([
    listProducts(query, category?.id),
    listActiveCategories(),
    listBrands(),
  ]);

  const basePath = category ? `/shop/category/${category.slug}` : '/shop';
  const activeFilters = FILTER_KEYS.filter((k) => query[k] !== undefined).length + (category ? 1 : 0);
  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Shop', url: '/shop' },
    ...(category ? [{ name: category.name, url: basePath }] : []),
  ];

  setSeo(res, {
    title: category
      ? (category.metaTitle ?? `${category.name} in Kathmandu | The Everest Kennel`)
      : query.q
        ? `Search: ${query.q} | The Everest Kennel Shop`
        : 'Pet Shop Kathmandu: Dog Food, Accessories & Toys',
    description:
      category?.metaDesc ??
      category?.description ??
      'Buy dog food, cat food, accessories, toys, supplements and kennel accessories online in Nepal. Cash on delivery, eSewa and Khalti.',
    canonical: meta.page > 1 ? `${basePath}?page=${meta.page}` : basePath,
    noindex: activeFilters > 1 || !!query.q,
    breadcrumbs: crumbs,
    jsonLd: [breadcrumbLd(crumbs)],
  });
  catalogCache(req, res);

  res.render('shop/index', {
    products,
    meta,
    categories,
    brands,
    category,
    filters: query,
    basePath,
    pageLink: (p: number) => pageUrl(basePath, req.query as Record<string, unknown>, p),
  });
}

export const shopIndex = (req: Request, res: Response) => renderListing(req, res);
export const shopCategory = (req: Request, res: Response) => renderListing(req, res, String(req.params.slug));

export async function productDetail(req: Request, res: Response) {
  const product = await getProductBySlug(String(req.params.slug));
  if (!product) throw notFound('Product');
  const related = await relatedProducts(product.id, product.categoryId, product.species);

  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Shop', url: '/shop' },
    { name: product.category.name, url: `/shop/category/${product.category.slug}` },
    { name: product.name, url: `/shop/product/${product.slug}` },
  ];
  const cover = product.images[0];
  setSeo(res, {
    title: product.metaTitle ?? `${product.name} Price in Nepal`,
    description: product.metaDesc ?? product.shortDesc ?? `Buy ${product.name} online in Kathmandu with fast delivery.`,
    canonical: `/shop/product/${product.slug}`,
    ogImage: cover ? `/${cover.path}-1200.webp` : undefined,
    ogType: 'product',
    breadcrumbs: crumbs,
    jsonLd: [
      breadcrumbLd(crumbs),
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.shortDesc ?? undefined,
        sku: product.variants[0]?.sku,
        brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
        image: product.images.map((i) => absoluteUrl(`/${i.path}-1200.webp`)),
        offers: product.variants.map((v) => ({
          '@type': 'Offer',
          sku: v.sku,
          name: v.label,
          priceCurrency: 'NPR',
          price: (v.pricePaisa / 100).toFixed(2),
          availability: v.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: absoluteUrl(`/shop/product/${product.slug}`),
          seller: { '@id': `${res.locals.baseUrl}/#business` },
        })),
      },
    ],
  });
  catalogCache(req, res);

  res.render('shop/product', {
    product,
    related,
    stockState,
    selectedVariantId: Number(req.query.variant) || product.variants.find((v) => v.stock > 0)?.id || product.variants[0]?.id,
  });
}

export async function stockNotify(req: Request, res: Response) {
  const input = parse(stockNotifySchema, req.body);
  const variant = await prisma.productVariant.findUnique({ where: { id: input.variantId }, include: { product: true } });
  if (!variant) throw notFound('Product');
  await createInquiry({
    type: 'STOCK_NOTIFY',
    name: input.name,
    phone: input.phone,
    subject: `Notify when back in stock: ${variant.product.name} (${variant.label})`,
    message: `Please notify ${input.name} when ${variant.sku} is back in stock.`,
    meta: { variantId: variant.id, sku: variant.sku },
    ip: req.ip,
  });
  flash(req, 'success', 'We will SMS you as soon as it is back in stock.');
  res.redirect(303, `/shop/product/${variant.product.slug}`);
}
