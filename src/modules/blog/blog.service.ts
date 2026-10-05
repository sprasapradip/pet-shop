import { prisma } from '../../lib/prisma.js';
import { pageMeta, pageParams } from '../../lib/pagination.js';

const published = () => ({ publishedAt: { not: null, lte: new Date() } });

export async function listPosts(pageRaw: unknown) {
  const { page, take, skip } = pageParams(pageRaw, 12);
  const where = published();
  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({ where, orderBy: { publishedAt: 'desc' }, skip, take }),
  ]);
  return { posts, meta: pageMeta(total, page, 12) };
}

export const getPost = (slug: string) => prisma.post.findFirst({ where: { slug, ...published() } });

export const latestPosts = (take = 3) =>
  prisma.post.findMany({ where: published(), orderBy: { publishedAt: 'desc' }, take });
