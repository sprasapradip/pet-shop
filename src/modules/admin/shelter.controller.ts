import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flash } from '../../lib/flash.js';
import { uniqueSlug } from '../../lib/slug.js';
import { dateOnly } from '../../lib/dates.js';
import { intParam } from '../../lib/session-helpers.js';
import { parse } from '../../middleware/validate.js';
import { deleteImage, uploadedImages } from '../../middleware/upload.js';
import { adminPage, f, qs } from './admin.helpers.js';

const animalSchema = z.object({
  name: f.text(80, 1),
  species: f.species,
  breedText: f.nullableText(120),
  gender: z.preprocess((v) => (v === '' ? null : v), z.enum(['MALE', 'FEMALE']).nullable()),
  ageText: f.nullableText(40),
  story: f.nullableText(10_000),
  temperament: f.nullableText(191),
  vaccinated: f.bool,
  sterilized: f.bool,
  status: z.enum(['IN_CARE', 'ADOPTABLE', 'ADOPTION_PENDING', 'ADOPTED', 'DECEASED']),
  intakeDate: f.date,
});

export async function shelterIndex(req: Request, res: Response) {
  const status = qs(req, 'status');
  const [animals, newApplications, newReports] = await Promise.all([
    prisma.shelterAnimal.findMany({
      where: status ? { status: status as never } : {},
      include: { _count: { select: { applications: true } } },
      orderBy: { intakeDate: 'desc' },
    }),
    prisma.adoptionApplication.count({ where: { status: 'NEW' } }),
    prisma.inquiry.count({ where: { type: 'SHELTER_REPORT', status: 'NEW' } }),
  ]);
  adminPage(res, 'Shelter');
  res.render('admin/shelter/index', { animals, status, newApplications, newReports });
}

export async function animalNew(_req: Request, res: Response) {
  adminPage(res, 'New shelter animal');
  res.render('admin/shelter/form', { animal: null });
}

export async function animalEdit(req: Request, res: Response) {
  const animal = await prisma.shelterAnimal.findUnique({
    where: { id: intParam(req.params.id) },
    include: { applications: { orderBy: { createdAt: 'desc' } } },
  });
  if (!animal) throw notFound('Animal');
  adminPage(res, `Edit ${animal.name}`);
  res.render('admin/shelter/form', { animal });
}

export async function animalSave(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const [photo] = uploadedImages(req);
  const input = parse(animalSchema, req.body);
  const data = { ...input, intakeDate: dateOnly(input.intakeDate), ...(photo ? { photoPath: photo } : {}) };
  if (id) {
    const before = await prisma.shelterAnimal.findUniqueOrThrow({ where: { id } });
    if (photo && before.photoPath) await deleteImage(before.photoPath);
    const after = await prisma.shelterAnimal.update({ where: { id }, data });
    await audit(req, 'update', 'ShelterAnimal', id, before, after);
    flash(req, 'success', 'Saved.');
    return res.redirect(303, `/admin/shelter/${id}/edit`);
  }
  const animal = await prisma.shelterAnimal.create({ data: { ...data, slug: uniqueSlug(input.name) } });
  await audit(req, 'create', 'ShelterAnimal', animal.id, null, animal);
  flash(req, 'success', `${animal.name} added.`);
  return res.redirect(303, `/admin/shelter/${animal.id}/edit`);
}

export async function applicationsIndex(req: Request, res: Response) {
  const status = qs(req, 'status');
  const applications = await prisma.adoptionApplication.findMany({
    where: status ? { status } : {},
    include: { animal: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  adminPage(res, 'Adoption applications');
  res.render('admin/shelter/applications', { applications, status });
}

export async function applicationDetail(req: Request, res: Response) {
  const application = await prisma.adoptionApplication.findUnique({ where: { id: intParam(req.params.id) }, include: { animal: true } });
  if (!application) throw notFound('Application');
  adminPage(res, `Application from ${application.name}`);
  res.render('admin/shelter/application', { application });
}

export async function applicationStatus(req: Request, res: Response) {
  const id = intParam(req.params.id);
  const { status } = parse(z.object({ status: z.enum(['NEW', 'HOME_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN']) }), req.body);
  const before = await prisma.adoptionApplication.findUnique({ where: { id } });
  if (!before) throw notFound('Application');
  await prisma.$transaction(async (tx) => {
    await tx.adoptionApplication.update({ where: { id }, data: { status } });
    if (status === 'APPROVED') {
      await tx.shelterAnimal.update({ where: { id: before.animalId }, data: { status: 'ADOPTED' } });
    } else if (status === 'HOME_CHECK') {
      await tx.shelterAnimal.updateMany({ where: { id: before.animalId, status: 'ADOPTABLE' }, data: { status: 'ADOPTION_PENDING' } });
    }
  });
  await audit(req, 'status', 'AdoptionApplication', id, { status: before.status }, { status });
  flash(req, 'success', `Application marked ${status.replace('_', ' ').toLowerCase()}.`);
  res.redirect(303, `/admin/shelter/applications/${id}`);
}
