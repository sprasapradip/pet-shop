import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound, AppError } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { env } from '../../config/env.js';

export const listAdoptable = (species?: string) =>
  prisma.shelterAnimal.findMany({
    where: { status: { in: ['ADOPTABLE', 'ADOPTION_PENDING'] }, ...(species ? { species: species as never } : {}) },
    orderBy: [{ status: 'asc' }, { intakeDate: 'desc' }],
  });

export const getAdoptable = (slug: string) =>
  prisma.shelterAnimal.findFirst({ where: { slug, status: { in: ['ADOPTABLE', 'ADOPTION_PENDING', 'ADOPTED'] } } });

export const shelterStats = async () => {
  const [inCare, adoptable, adopted] = await Promise.all([
    prisma.shelterAnimal.count({ where: { status: { in: ['IN_CARE', 'ADOPTABLE', 'ADOPTION_PENDING'] } } }),
    prisma.shelterAnimal.count({ where: { status: 'ADOPTABLE' } }),
    prisma.shelterAnimal.count({ where: { status: 'ADOPTED' } }),
  ]);
  return { inCare, adoptable, adopted };
};

export async function applyForAdoption(
  slug: string,
  data: { name: string; phone: string; address: string; answers: Prisma.InputJsonValue },
) {
  const animal = await prisma.shelterAnimal.findUnique({ where: { slug } });
  if (!animal) throw notFound('Animal');
  if (animal.status !== 'ADOPTABLE' && animal.status !== 'ADOPTION_PENDING') {
    throw new AppError(422, 'not_adoptable', `${animal.name} is not open for adoption applications right now.`);
  }
  const application = await prisma.adoptionApplication.create({ data: { animalId: animal.id, ...data } });
  void sendMail({
    to: env.ADMIN_NOTIFY_EMAIL,
    subject: `Adoption application for ${animal.name}`,
    text: `${data.name} (${data.phone}) applied to adopt ${animal.name}.\nReview: ${env.APP_URL}/admin/shelter/applications/${application.id}`,
  });
  return { animal, application };
}
