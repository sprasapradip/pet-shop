import { prisma } from '../../lib/prisma.js';
import { cache } from '../../lib/cache.js';

export function listActiveCategories() {
  return cache.remember('catalog:categories', () =>
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    }),
  );
}

export function listBrands() {
  return cache.remember('catalog:brands', () => prisma.brand.findMany({ orderBy: { name: 'asc' } }));
}

export const getCategoryBySlug = (slug: string) => prisma.category.findFirst({ where: { slug, isActive: true } });

export const bustCatalogCache = () => cache.forget('catalog:');
