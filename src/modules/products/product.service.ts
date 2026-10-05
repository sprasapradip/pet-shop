import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { cache } from '../../lib/cache.js';
import { pageMeta, pageParams } from '../../lib/pagination.js';
import type { ProductQuery } from './product.schema.js';

export const productCardInclude = {
  brand: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
  variants: { where: { isActive: true }, orderBy: { pricePaisa: 'asc' as const } },
} satisfies Prisma.ProductInclude;

export type ProductCard = Prisma.ProductGetPayload<{ include: typeof productCardInclude }>;

/** Builds a MySQL boolean mode query: every word required, prefix matched. */
export function booleanQuery(q: string): string {
  return q
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 8)
    .map((w) => `+${w}*`)
    .join(' ');
}

/** Product ids matching a search on name/short description (FULLTEXT), brand name or SKU. */
export async function searchProductIds(q: string): Promise<number[]> {
  const boolean = booleanQuery(q);
  const [ft, like] = await Promise.all([
    boolean
      ? prisma.$queryRaw<{ id: number }[]>`SELECT id FROM products WHERE isActive = 1 AND MATCH(name, shortDesc) AGAINST (${boolean} IN BOOLEAN MODE) LIMIT 500`
      : Promise.resolve([]),
    prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q } },
          { brand: { name: { contains: q } } },
          { variants: { some: { sku: { contains: q } } } },
        ],
      },
      select: { id: true },
      take: 500,
    }),
  ]);
  return [...new Set([...ft.map((r) => Number(r.id)), ...like.map((r) => r.id)])];
}

export async function listProducts(query: ProductQuery, categoryId?: number) {
  const { page, take, skip } = pageParams(query.page);
  const where: Prisma.ProductWhereInput = { isActive: true };

  if (categoryId) where.categoryId = categoryId;
  else if (query.category) where.category = { slug: query.category };
  if (query.brand) where.brand = { slug: query.brand };
  if (query.species) where.species = query.species;
  if (query.lifeStage) where.lifeStage = query.lifeStage;
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.variants = {
      some: {
        isActive: true,
        pricePaisa: {
          gte: query.minPrice !== undefined ? query.minPrice * 100 : undefined,
          lte: query.maxPrice !== undefined ? query.maxPrice * 100 : undefined,
        },
      },
    };
  }
  if (query.q) where.id = { in: await searchProductIds(query.q) };

  // Price sorting is done on the cheapest variant, which Prisma cannot order by directly,
  // so sort ids in SQL first and then load the page.
  let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
  if (query.sort === 'newest') orderBy = [{ createdAt: 'desc' }];
  if (query.sort === 'name') orderBy = [{ name: 'asc' }];

  const total = await prisma.product.count({ where });

  let products: ProductCard[];
  if (query.sort === 'price_asc' || query.sort === 'price_desc') {
    const all = await prisma.product.findMany({
      where,
      select: { id: true, variants: { where: { isActive: true }, select: { pricePaisa: true } } },
    });
    const min = (p: (typeof all)[number]) => Math.min(...p.variants.map((v) => v.pricePaisa), Number.MAX_SAFE_INTEGER);
    all.sort((a, b) => (query.sort === 'price_asc' ? min(a) - min(b) : min(b) - min(a)));
    const ids = all.slice(skip, skip + take).map((p) => p.id);
    const rows = await prisma.product.findMany({ where: { id: { in: ids } }, include: productCardInclude });
    products = ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean);
  } else {
    products = await prisma.product.findMany({ where, include: productCardInclude, orderBy, skip, take });
  }

  return { products, meta: pageMeta(total, page, take) };
}

export function getProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, isActive: true },
    include: {
      brand: true,
      category: true,
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { where: { isActive: true }, orderBy: { pricePaisa: 'asc' } },
    },
  });
}

export function relatedProducts(productId: number, categoryId: number, species: string | null) {
  return prisma.product.findMany({
    where: {
      isActive: true,
      id: { not: productId },
      OR: [{ categoryId }, ...(species ? [{ species: species as never }] : [])],
    },
    include: productCardInclude,
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    take: 4,
  });
}

export function featuredProducts(take = 8) {
  return cache.remember(`catalog:featured:${take}`, () =>
    prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      include: productCardInclude,
      orderBy: { updatedAt: 'desc' },
      take,
    }),
  );
}

/** Best sellers by quantity over the last 90 days, topped up with featured products. */
export function bestSellers(take = 8) {
  return cache.remember(`catalog:bestsellers:${take}`, async () => {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const top = await prisma.orderItem.groupBy({
      by: ['variantId'],
      where: { order: { createdAt: { gte: since }, status: { in: ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 40,
    });
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: top.map((t) => t.variantId) } },
      select: { id: true, productId: true },
    });
    const productIds = [...new Set(top.map((t) => variants.find((v) => v.id === t.variantId)?.productId).filter(Boolean))] as number[];
    const ranked = await prisma.product.findMany({ where: { id: { in: productIds }, isActive: true }, include: productCardInclude });
    const ordered = productIds.map((id) => ranked.find((p) => p.id === id)).filter(Boolean) as ProductCard[];
    if (ordered.length < take) {
      const fill = await prisma.product.findMany({
        where: { isActive: true, id: { notIn: ordered.map((p) => p.id) } },
        include: productCardInclude,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        take: take - ordered.length,
      });
      ordered.push(...fill);
    }
    return ordered.slice(0, take);
  });
}

/** Variant stock state for badges. */
export function stockState(stock: number, lowAlert: number): 'out' | 'low' | 'in' {
  if (stock <= 0) return 'out';
  if (stock <= lowAlert) return 'low';
  return 'in';
}
