import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError, conflict } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { isValidNepalPhone, normalizePhone } from '../../lib/phone.js';
import { sendMail } from '../../lib/mailer.js';
import { sendSms } from '../../lib/sms.js';
import { env } from '../../config/env.js';
import { BUSINESS } from '../../config/constants.js';
import { attachCartToUser } from '../cart/cart.service.js';

const RESET_TTL_MS = 60 * 60_000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Verifying against a dummy hash for unknown users keeps response time uniform.
let dummyHash: string | undefined;

export async function registerUser(input: { name: string; phone: string; email?: string; password: string }) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
  });
  if (existing) throw conflict('An account with this phone or email already exists. Please log in.');
  return prisma.user.create({
    data: { name: input.name, phone: input.phone, email: input.email, passwordHash: await hashPassword(input.password) },
  });
}

function findByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  if (id.includes('@')) return prisma.user.findUnique({ where: { email: id } });
  if (isValidNepalPhone(id)) return prisma.user.findUnique({ where: { phone: normalizePhone(id) } });
  return Promise.resolve(null);
}

export async function authenticate(identifier: string, password: string): Promise<User> {
  const user = await findByIdentifier(identifier);
  if (!user || !user.isActive || user.deletedAt) {
    dummyHash ??= await hashPassword(randomBytes(16).toString('hex'));
    await verifyPassword(dummyHash, password);
    throw new AppError(422, 'invalid_credentials', 'Phone/email or password is incorrect');
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(422, 'invalid_credentials', 'Phone/email or password is incorrect');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

/** Regenerates the session (prevents fixation), keeps the cart and stores the user. */
export async function startSession(req: Request, user: Pick<User, 'id' | 'name' | 'role'>) {
  const guestCart = req.session.cartToken;
  const verifiedPhone = req.session.verifiedPhone;
  await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.user = { id: user.id, name: user.name, role: user.role };
  req.session.cartToken = await attachCartToUser(guestCart, user.id);
  if (verifiedPhone) req.session.verifiedPhone = verifiedPhone;
  await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

export function endSession(req: Request) {
  return new Promise<void>((resolve) => req.session.destroy(() => resolve()));
}

/** Sends a reset link by email and SMS. Always resolves the same way so accounts cannot be enumerated. */
export async function requestPasswordReset(identifier: string) {
  const user = await findByIdentifier(identifier);
  if (!user || !user.isActive) return;

  const token = randomBytes(32).toString('hex');
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = `${env.APP_URL}/reset-password/${token}`;
  if (user.email) {
    await sendMail({
      to: user.email,
      subject: `Reset your ${BUSINESS.name} password`,
      text: `Hello ${user.name},\n\nUse this link within 1 hour to set a new password:\n${link}\n\nIf you did not ask for this, ignore this email.`,
    });
  }
  await sendSms(user.phone, `${BUSINESS.name}: reset your password within 1 hour: ${link}`);
}

export async function findValidReset(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return prisma.passwordReset.findFirst({
    where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
  });
}

export async function resetPassword(token: string, password: string) {
  const reset = await findValidReset(token);
  if (!reset) throw new AppError(422, 'invalid_token', 'This reset link is invalid or has expired.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.passwordReset.deleteMany({ where: { userId: reset.userId, usedAt: null } }),
  ]);
}

export async function changePassword(userId: number, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) {
    throw new AppError(422, 'invalid_credentials', 'Current password is incorrect', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
}

/** Account deletion: personal data is anonymised, order history is kept for accounting. */
export async function deleteAccount(userId: number) {
  await prisma.$transaction([
    prisma.customerPet.deleteMany({ where: { userId } }),
    prisma.address.deleteMany({ where: { userId } }),
    prisma.cart.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Deleted user',
        email: null,
        phone: `del-${userId}-${randomBytes(2).toString('hex')}`.slice(0, 20),
        passwordHash: 'deleted',
        isActive: false,
        deletedAt: new Date(),
      },
    }),
  ]);
}
