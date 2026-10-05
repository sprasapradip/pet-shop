import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { dateOnly } from '../../lib/dates.js';
import { deleteImage } from '../../middleware/upload.js';
import type { CustomerPetInput } from './customer-pet.schema.js';

export const listPets = (userId: number) =>
  prisma.customerPet.findMany({
    where: { userId },
    include: {
      breed: true,
      vaccinations: { where: { nextDueOn: { not: null } }, orderBy: { nextDueOn: 'asc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

/** Every query is scoped to the owner, so another customer's pet id returns 404. */
export async function getPet(userId: number, petId: number) {
  const pet = await prisma.customerPet.findFirst({
    where: { id: petId, userId },
    include: {
      breed: true,
      vaccinations: { orderBy: { givenOn: 'desc' } },
      medicals: { orderBy: { visitDate: 'desc' } },
      weights: { orderBy: { recordedOn: 'asc' } },
      bookings: { include: { service: true }, orderBy: { startAt: 'desc' }, take: 10 },
    },
  });
  if (!pet) throw notFound('Pet');
  return pet;
}

const toData = (input: CustomerPetInput) => ({
  name: input.name,
  species: input.species,
  breedId: input.breedId ?? null,
  gender: input.gender ?? null,
  dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
  weightKg: input.weightKg ?? null,
  notes: input.notes ?? null,
});

export async function createPet(userId: number, input: CustomerPetInput, photoPath?: string) {
  return prisma.customerPet.create({
    data: {
      userId,
      ...toData(input),
      photoPath,
      weights: input.weightKg ? { create: { weightKg: input.weightKg, recordedOn: dateOnly(new Date().toISOString().slice(0, 10)) } } : undefined,
    },
  });
}

export async function updatePet(userId: number, petId: number, input: CustomerPetInput, photoPath?: string) {
  const pet = await prisma.customerPet.findFirst({ where: { id: petId, userId } });
  if (!pet) throw notFound('Pet');
  if (photoPath && pet.photoPath) await deleteImage(pet.photoPath);
  return prisma.customerPet.update({ where: { id: pet.id }, data: { ...toData(input), ...(photoPath ? { photoPath } : {}) } });
}

export async function deletePet(userId: number, petId: number) {
  const pet = await prisma.customerPet.findFirst({ where: { id: petId, userId } });
  if (!pet) throw notFound('Pet');
  await prisma.customerPet.delete({ where: { id: pet.id } });
  await deleteImage(pet.photoPath);
}

export async function addWeight(userId: number, petId: number, weightKg: number, recordedOn: string) {
  const pet = await prisma.customerPet.findFirst({ where: { id: petId, userId } });
  if (!pet) throw notFound('Pet');
  await prisma.$transaction([
    prisma.petWeight.create({ data: { petId, weightKg, recordedOn: dateOnly(recordedOn) } }),
    prisma.customerPet.update({ where: { id: petId }, data: { weightKg } }),
  ]);
}
