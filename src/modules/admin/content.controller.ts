import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { cache } from '../../lib/cache.js';
import { slugify } from '../../lib/slug.js';
import { cleanHtml } from '../../lib/html.js';
import { toNpt } from '../../lib/dates.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { deleteImage, uploadedImages } from '../../middleware/upload.js';
import { adminPage, f } from './admin.helpers.js';

// ---------------- Blog posts ----------------

const postSchema = z.object({
  title: f.text(191, 3),
  slug: f.slug,
  excerpt: f.nullableText(300),
  content: f.text(200_000, 10),
  publishedAt: f.optDate,
  metaTitle: f.nullableText(70),
  metaDesc: f.nullableText(160),
});

export async function postsIndex(_req: Request, res: Response) {
  const posts = await prisma.post.findMany({ orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }] });
  adminPage(res, 'Blog posts');
  res.render('admin/content/posts', { posts });
}

export async function postForm(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const post = id ? await prisma.post.findUnique({ where: { id } }) : null;
  if (id && !post) throw notFound('Post');
  adminPage(res, post ? `Edit: ${post.title}` : 'New post');
  res.render('admin/content/post-form', { post });
}

export async function postSave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const [cover] = uploadedImages(req);
  const input = parse(postSchema, req.body);
  const data = {
    ...input,
    slug: input.slug || slugify(input.title),
    content: cleanHtml(input.content),
    publishedAt: input.publishedAt ? toNpt(input.publishedAt, '08:00') : null,
    ...(cover ? { coverPath: cover } : {}),
  };
  if (id) {
    const before = await prisma.post.findUniqueOrThrow({ where: { id } });
    if (cover && before.coverPath) await deleteImage(before.coverPath);
    await prisma.post.update({ where: { id }, data });
    await audit(req, 'update', 'Post', id, { title: before.title, publishedAt: before.publishedAt }, { title: data.title, publishedAt: data.publishedAt });
  } else {
    const post = await prisma.post.create({ data });
    await audit(req, 'create', 'Post', post.id, null, { title: post.title });
  }
  flash(req, 'success', 'Post saved.');
  res.redirect(303, '/admin/posts');
}

export async function postDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw notFound('Post');
  await prisma.post.delete({ where: { id } });
  await deleteImage(post.coverPath);
  await audit(req, 'delete', 'Post', id, { title: post.title }, null);
  flash(req, 'success', 'Post deleted.');
  res.redirect(303, '/admin/posts');
}

// ---------------- FAQs ----------------

const faqSchema = z.object({
  question: f.text(255, 5),
  answer: f.text(5000, 2),
  group: f.text(40, 2),
  sortOrder: f.int(0, 10_000),
});

export async function faqsIndex(req: Request, res: Response) {
  const editing = intParam(req.query.edit);
  const faqs = await prisma.faq.findMany({ orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }] });
  adminPage(res, 'FAQs');
  res.render('admin/content/faqs', { faqs, editing: faqs.find((x) => x.id === editing) ?? null });
}

export async function faqSave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const data = parse(faqSchema, req.body);
  if (id) {
    const before = await prisma.faq.findUniqueOrThrow({ where: { id } });
    await prisma.faq.update({ where: { id }, data });
    await audit(req, 'update', 'Faq', id, before, data);
  } else {
    const faq = await prisma.faq.create({ data });
    await audit(req, 'create', 'Faq', faq.id, null, faq);
  }
  flash(req, 'success', 'FAQ saved.');
  res.redirect(303, '/admin/faqs');
}

export async function faqDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const faq = await prisma.faq.findUnique({ where: { id } });
  if (!faq) throw notFound('FAQ');
  await prisma.faq.delete({ where: { id } });
  await audit(req, 'delete', 'Faq', id, faq, null);
  flash(req, 'success', 'FAQ deleted.');
  res.redirect(303, '/admin/faqs');
}

// ---------------- Testimonials ----------------

const testimonialSchema = z.object({
  name: f.text(120, 2),
  content: f.text(2000, 5),
  rating: f.int(1, 5),
  isActive: f.bool,
  sortOrder: f.int(0, 10_000),
});

export async function testimonialsIndex(req: Request, res: Response) {
  const editing = intParam(req.query.edit);
  const testimonials = await prisma.testimonial.findMany({ orderBy: { sortOrder: 'asc' } });
  adminPage(res, 'Testimonials');
  res.render('admin/content/testimonials', { testimonials, editing: testimonials.find((t) => t.id === editing) ?? null });
}

export async function testimonialSave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const data = parse(testimonialSchema, req.body);
  if (id) {
    const before = await prisma.testimonial.findUniqueOrThrow({ where: { id } });
    await prisma.testimonial.update({ where: { id }, data });
    await audit(req, 'update', 'Testimonial', id, before, data);
  } else {
    const t = await prisma.testimonial.create({ data });
    await audit(req, 'create', 'Testimonial', t.id, null, t);
  }
  cache.forget('content:');
  flash(req, 'success', 'Testimonial saved.');
  res.redirect(303, '/admin/testimonials');
}

export async function testimonialDelete(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const t = await prisma.testimonial.findUnique({ where: { id } });
  if (!t) throw notFound('Testimonial');
  await prisma.testimonial.delete({ where: { id } });
  cache.forget('content:');
  await audit(req, 'delete', 'Testimonial', id, t, null);
  flash(req, 'success', 'Testimonial deleted.');
  res.redirect(303, '/admin/testimonials');
}
