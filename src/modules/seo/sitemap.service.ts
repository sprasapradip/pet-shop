import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { publicListingWhere } from '../pets/pet.service.js';

const STATIC_PATHS = [
  '/',
  '/shop',
  '/pets',
  '/sell-your-pet',
  '/services',
  '/book',
  '/shelter',
  '/shelter/adopt',
  '/shelter/report-animal',
  '/blog',
  '/about',
  '/contact',
  '/faq',
  '/privacy-policy',
  '/terms',
  '/refund-policy',
  '/animal-sale-policy',
];

export const SITEMAP_FILE = path.resolve('public/sitemap.xml');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function buildSitemap(): Promise<string> {
  const [categories, products, pets, services, posts, animals] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true } }),
    prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.petListing.findMany({ where: { AND: [publicListingWhere(), { status: 'AVAILABLE' }] }, select: { slug: true, updatedAt: true } }),
    prisma.service.findMany({ where: { isActive: true }, select: { slug: true } }),
    prisma.post.findMany({ where: { publishedAt: { not: null, lte: new Date() } }, select: { slug: true, updatedAt: true } }),
    prisma.shelterAnimal.findMany({ where: { status: { in: ['ADOPTABLE', 'ADOPTION_PENDING'] } }, select: { slug: true } }),
  ]);

  const urls: { loc: string; lastmod?: Date; priority: string }[] = [
    ...STATIC_PATHS.map((p) => ({ loc: p, priority: p === '/' ? '1.0' : '0.7' })),
    ...categories.map((c) => ({ loc: `/shop/category/${c.slug}`, priority: '0.7' })),
    ...products.map((p) => ({ loc: `/shop/product/${p.slug}`, lastmod: p.updatedAt, priority: '0.6' })),
    ...pets.map((p) => ({ loc: `/pets/${p.slug}`, lastmod: p.updatedAt, priority: '0.8' })),
    ...services.map((s) => ({ loc: `/services/${s.slug}`, priority: '0.9' })),
    ...posts.map((p) => ({ loc: `/blog/${p.slug}`, lastmod: p.updatedAt, priority: '0.5' })),
    ...animals.map((a) => ({ loc: `/shelter/adopt/${a.slug}`, priority: '0.5' })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url><loc>${esc(env.APP_URL + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Worker job: writes public/sitemap.xml (served by the /sitemap.xml route). */
export async function generateSitemap() {
  const xml = await buildSitemap();
  await fs.writeFile(SITEMAP_FILE, xml, 'utf8');
  return xml.length;
}
