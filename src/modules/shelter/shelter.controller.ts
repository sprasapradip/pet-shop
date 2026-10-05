import type { Request, Response } from 'express';
import { notFound } from '../../lib/errors.js';
import { breadcrumbLd, setSeo } from '../../lib/seo.js';
import { parse } from '../../middleware/validate.js';
import { flash } from '../../lib/flash.js';
import { deleteImage, uploadedImages } from '../../middleware/upload.js';
import { adoptionSchema, shelterReportSchema } from '../inquiries/inquiry.schema.js';
import { createInquiry } from '../inquiries/inquiry.service.js';
import { applyForAdoption, getAdoptable, listAdoptable, shelterStats } from './shelter.service.js';

export async function shelterHome(_req: Request, res: Response) {
  const [animals, stats] = await Promise.all([listAdoptable(), shelterStats()]);
  setSeo(res, {
    title: 'Animal Care Shelter Kathmandu | Adopt or Report',
    description: 'The Everest Kennel Animal Care Shelter rescues injured and stray animals in Kathmandu. Adopt a dog or cat, or report an animal in need.',
    canonical: '/shelter',
  });
  res.render('shelter/index', { animals: animals.slice(0, 6), stats });
}

export async function adoptList(req: Request, res: Response) {
  const species = ['DOG', 'CAT'].includes(String(req.query.species).toUpperCase()) ? String(req.query.species).toUpperCase() : undefined;
  const animals = await listAdoptable(species);
  setSeo(res, {
    title: 'Adopt a Dog or Cat in Nepal | Everest Kennel Shelter',
    description: 'Rescued dogs and cats looking for loving homes in the Kathmandu Valley. Vaccinated, with health checks.',
    canonical: '/shelter/adopt',
  });
  res.render('shelter/adopt', { animals, species });
}

export async function adoptDetail(req: Request, res: Response) {
  const animal = await getAdoptable(String(req.params.slug));
  if (!animal) throw notFound('Animal');
  const crumbs = [
    { name: 'Home', url: '/' },
    { name: 'Shelter', url: '/shelter' },
    { name: 'Adopt', url: '/shelter/adopt' },
    { name: animal.name, url: `/shelter/adopt/${animal.slug}` },
  ];
  setSeo(res, {
    title: `Adopt ${animal.name} | Everest Kennel Shelter`,
    description: `${animal.name} is a rescued ${animal.breedText ?? animal.species.toLowerCase()} looking for a home. ${animal.temperament ?? ''}`,
    canonical: `/shelter/adopt/${animal.slug}`,
    ogImage: animal.photoPath ? `/${animal.photoPath}-1200.webp` : undefined,
    jsonLd: [breadcrumbLd(crumbs)],
  });
  res.render('shelter/detail', { animal });
}

export async function adoptApply(req: Request, res: Response) {
  const input = parse(adoptionSchema, req.body);
  const { name, phone, address, ...answers } = input;
  const { animal } = await applyForAdoption(String(req.params.slug), { name, phone, address, answers });
  flash(req, 'success', `Thank you for applying to adopt ${animal.name}! We will call you to arrange a home check.`);
  res.redirect(303, `/shelter/adopt/${animal.slug}`);
}

export function reportPage(_req: Request, res: Response) {
  setSeo(res, {
    title: 'Report an Injured or Stray Animal in Kathmandu',
    description: 'Seen an injured, sick or abused animal in the Kathmandu Valley? Send a photo and location to our rescue team.',
    canonical: '/shelter/report-animal',
  });
  res.render('shelter/report');
}

export async function reportSubmit(req: Request, res: Response) {
  const photos = uploadedImages(req);
  try {
    const input = parse(shelterReportSchema, req.body);
    await createInquiry({
      type: 'SHELTER_REPORT',
      name: input.name,
      phone: input.phone,
      subject: `${input.condition.toLowerCase()} ${input.species.toLowerCase()} at ${input.location}`.slice(0, 191),
      message: input.message,
      meta: {
        species: input.species,
        condition: input.condition,
        location: input.location,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        photos,
      },
      ip: req.ip,
    });
  } catch (err) {
    await Promise.all(photos.map(deleteImage));
    throw err;
  }
  flash(req, 'success', 'Thank you for reporting. Our rescue team has been alerted and may call you for directions.');
  res.redirect(303, '/shelter/report-animal');
}
