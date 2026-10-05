import type { Response } from 'express';
import { env } from '../config/env.js';

export interface SeoData {
  title?: string;
  description?: string;
  canonical?: string;
  noindex?: boolean;
  ogImage?: string;
  ogType?: string;
  breadcrumbs?: { name: string; url: string }[];
  jsonLd?: Record<string, unknown>[];
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Merges page SEO into res.locals.seo. Title max 60, description max 155 characters. */
export function setSeo(res: Response, data: SeoData) {
  const current = (res.locals.seo ?? {}) as SeoData;
  const next: SeoData = { ...current, ...data };
  if (next.title) next.title = clip(next.title, 60);
  if (next.description) next.description = clip(next.description, 155);
  if (data.canonical && data.canonical.startsWith('/')) next.canonical = `${env.APP_URL}${data.canonical}`;
  res.locals.seo = next;
}

export const absoluteUrl = (p: string) => (p.startsWith('http') ? p : `${env.APP_URL}${p.startsWith('/') ? '' : '/'}${p}`);

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absoluteUrl(it.url) })),
  };
}

export function faqLd(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  };
}

/** Safe JSON for embedding in <script type="application/ld+json">. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
