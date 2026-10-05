import type { Request, Response } from 'express';
import { notFound } from '../../lib/errors.js';
import { absoluteUrl, breadcrumbLd, setSeo } from '../../lib/seo.js';
import { pageUrl } from '../../lib/pagination.js';
import { textExcerpt } from '../../lib/html.js';
import { BUSINESS } from '../../config/constants.js';
import { getPost, latestPosts, listPosts } from './blog.service.js';

export async function blogIndex(req: Request, res: Response) {
  const { posts, meta } = await listPosts(req.query.page);
  setSeo(res, {
    title: 'Pet Care Blog | The Everest Kennel Kathmandu',
    description: 'Pet care tips for Nepal: puppy care, vaccination schedules, feeding, training and choosing the right breed.',
    canonical: meta.page > 1 ? `/blog?page=${meta.page}` : '/blog',
  });
  res.render('blog/index', { posts, meta, pageLink: (p: number) => pageUrl('/blog', req.query as Record<string, unknown>, p) });
}

export async function blogPost(req: Request, res: Response) {
  const post = await getPost(String(req.params.slug));
  if (!post) throw notFound('Article');
  const more = (await latestPosts(4)).filter((p) => p.id !== post.id).slice(0, 3);
  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: post.title, url: `/blog/${post.slug}` },
  ];
  setSeo(res, {
    title: post.metaTitle ?? post.title,
    description: post.metaDesc ?? post.excerpt ?? textExcerpt(post.content),
    canonical: `/blog/${post.slug}`,
    ogImage: post.coverPath ? `/${post.coverPath}-1200.webp` : undefined,
    ogType: 'article',
    jsonLd: [
      breadcrumbLd(crumbs),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        datePublished: post.publishedAt?.toISOString(),
        dateModified: post.updatedAt.toISOString(),
        image: post.coverPath ? [absoluteUrl(`/${post.coverPath}-1200.webp`)] : undefined,
        author: { '@type': 'Organization', name: BUSINESS.name },
        publisher: { '@id': `${res.locals.baseUrl}/#business` },
        mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
      },
    ],
  });
  res.render('blog/post', { post, more });
}
