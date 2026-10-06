import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { cache } from '../../lib/cache.js';
import { notFound } from '../../lib/errors.js';
import { breadcrumbLd, faqLd, setSeo } from '../../lib/seo.js';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { bestSellers } from '../products/product.service.js';
import { featuredListings } from '../pets/pet.service.js';
import { shelterStats } from '../shelter/shelter.service.js';
import { latestPosts } from '../blog/blog.service.js';
import { contactSchema } from '../inquiries/inquiry.schema.js';
import { createInquiry } from '../inquiries/inquiry.service.js';

/** The 8 service cards. Bookable ones link to their service page; trade and shelter to their sections. */
export const SERVICE_CARDS = [
  { code: 'HOUSE_CALL', title: 'Vet house call', href: '/services/house-call-vet', icon: 'home', text: 'A vet visits your home anywhere in the Kathmandu Valley.' },
  { code: 'VACCINATION', title: 'Vaccination', href: '/services/vaccination', icon: 'syringe', text: 'Core vaccines and rabies shots, at our shop or at home.' },
  { code: 'TREATMENT', title: 'Treatment', href: '/services/treatment', icon: 'stethoscope', text: 'Check ups, wound care, skin and stomach problems.' },
  { code: 'BOARDING', title: 'Dog boarding', href: '/services/dog-boarding-kathmandu', icon: 'kennel', text: 'Clean, safe kennels with daily walks and care updates.' },
  { code: 'TRAINING', title: 'Dog training', href: '/services/dog-training', icon: 'whistle', text: 'Obedience, leash and puppy training packages.' },
  { code: 'MATING', title: 'Mating / stud service', href: '/services/mating-stud-service', icon: 'heart', text: 'Healthy, registered studs by appointment.' },
  { code: 'PUPPY_TRADE', title: 'Puppies for sale', href: '/pets', icon: 'paw', text: 'Locally bred and imported puppies with health records.' },
  { code: 'SHELTER', title: 'Animal care shelter', href: '/shelter', icon: 'shelter', text: 'Rescue, rehabilitation and adoption of street animals.' },
] as const;

export async function home(_req: Request, res: Response) {
  const [pets, products, testimonials, stats, posts] = await Promise.all([
    featuredListings(6),
    bestSellers(8),
    cache.remember('content:testimonials', () =>
      prisma.testimonial.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, take: 6 }),
    ),
    shelterStats(),
    latestPosts(3),
  ]);
  setSeo(res, { canonical: '/' });
  res.render('pages/home', { pets, products, testimonials, stats, posts, serviceCards: SERVICE_CARDS });
}

export function about(_req: Request, res: Response) {
  setSeo(res, {
    title: 'About The Everest Kennel | Pet Shop at Soaltee Mode',
    description: 'Meet The Everest Kennel, a pet shop, kennel and animal care shelter run by Aakriti at Soaltee Mode, Kathmandu.',
    canonical: '/about',
  });
  res.render('pages/about');
}

export async function faq(_req: Request, res: Response) {
  const faqs = await prisma.faq.findMany({ orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }] });
  const groups = new Map<string, typeof faqs>();
  for (const f of faqs) {
    const g = f.group.startsWith('service:') ? 'Services' : f.group;
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  setSeo(res, {
    title: 'FAQ | The Everest Kennel Kathmandu',
    description: 'Answers about puppies, delivery, payments, vaccination, boarding and adoption at The Everest Kennel.',
    canonical: '/faq',
    jsonLd: [faqLd(faqs)],
  });
  res.render('pages/faq', { groups });
}

export function contactPage(req: Request, res: Response) {
  setSeo(res, {
    title: 'Contact The Everest Kennel | Soaltee Mode, Kathmandu',
    description: 'Call +977 9843944253, chat on WhatsApp or visit our pet shop at Soaltee Mode, Kathmandu. Opening hours and map.',
    canonical: '/contact',
  });
  res.render('pages/contact', { subject: typeof req.query.subject === 'string' ? req.query.subject.slice(0, 120) : '' });
}

export async function contactSubmit(req: Request, res: Response) {
  const input = parse(contactSchema, req.body);
  await createInquiry({
    type: input.topic,
    name: input.name,
    phone: input.phone,
    email: input.email,
    subject: input.subject,
    message: input.message,
    ip: req.ip,
  });
  flash(req, 'success', 'Thank you! We received your message and will call you back soon.');
  res.redirect(303, '/contact');
}

const POLICIES: Record<string, { view: string; title: string; description: string }> = {
  'privacy-policy': { view: 'pages/privacy', title: 'Privacy Policy', description: 'How The Everest Kennel collects, uses and protects your personal data.' },
  terms: { view: 'pages/terms', title: 'Terms of Service', description: 'Terms for shopping, booking services and using the The Everest Kennel website.' },
  'refund-policy': { view: 'pages/refund', title: 'Return and Refund Policy', description: 'Returns, exchanges and refunds for pet food, accessories and services.' },
  'animal-sale-policy': { view: 'pages/animal-sale', title: 'Animal Sale and Health Guarantee Policy', description: 'Minimum age, health checks, records and return terms for puppies and pets sold.' },
};

export function policy(req: Request, res: Response) {
  const key = req.path.slice(1);
  const page = POLICIES[key];
  if (!page) throw notFound('Page');
  setSeo(res, { title: `${page.title} | The Everest Kennel`, description: page.description, canonical: `/${key}` });
  res.render(page.view, { pageTitle: page.title });
}

export async function servicesIndex(_req: Request, res: Response) {
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  setSeo(res, {
    title: 'Pet Services in Kathmandu | Vet, Boarding, Training',
    description: 'Vet house calls, vaccination, treatment, dog boarding, training and stud service in the Kathmandu Valley.',
    canonical: '/services',
  });
  res.render('services/index', { services, serviceCards: SERVICE_CARDS });
}

export async function serviceDetail(req: Request, res: Response) {
  const service = await prisma.service.findFirst({ where: { slug: String(req.params.slug), isActive: true } });
  if (!service) throw notFound('Service');
  const faqs = await prisma.faq.findMany({ where: { group: `service:${service.type}` }, orderBy: { sortOrder: 'asc' } });
  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Services', url: '/services' },
    { name: service.name, url: `/services/${service.slug}` },
  ];
  setSeo(res, {
    title: service.metaTitle ?? `${service.name} in Kathmandu | The Everest Kennel`,
    description: service.metaDesc ?? service.shortDesc,
    canonical: `/services/${service.slug}`,
    breadcrumbs: crumbs,
    jsonLd: [
      breadcrumbLd(crumbs),
      ...(faqs.length ? [faqLd(faqs)] : []),
      {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: service.name,
        description: service.shortDesc,
        areaServed: ['Kathmandu', 'Lalitpur', 'Bhaktapur'],
        provider: { '@id': `${res.locals.baseUrl}/#business` },
        ...(service.basePricePaisa
          ? { offers: { '@type': 'Offer', priceCurrency: 'NPR', price: (service.basePricePaisa / 100).toFixed(0) } }
          : {}),
      },
    ],
  });
  const included = Array.isArray(service.included) ? (service.included as string[]) : [];
  res.render('services/detail', { service, faqs, included });
}

export async function healthz(_req: Request, res: Response) {
  await prisma.$queryRaw`SELECT 1`;
  res.set('Cache-Control', 'no-store').json({ status: 'ok' });
}
