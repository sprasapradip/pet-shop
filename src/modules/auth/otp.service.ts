import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { sendSms } from '../../lib/sms.js';
import { BUSINESS } from '../../config/constants.js';

const EXPIRY_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

const hash = (code: string) => createHash('sha256').update(code).digest('hex');

export async function sendOtp(phone: string, purpose: string) {
  const since = new Date(Date.now() - 60 * 60_000);
  const sent = await prisma.otpCode.count({ where: { phone, createdAt: { gte: since } } });
  if (sent >= MAX_SENDS_PER_HOUR) {
    throw new AppError(429, 'rate_limited', 'Too many codes requested for this number. Please try again in an hour.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpCode.create({
    data: { phone, purpose, codeHash: hash(code), expiresAt: new Date(Date.now() + EXPIRY_MS) },
  });
  await sendSms(phone, `${code} is your ${BUSINESS.name} verification code. It expires in 5 minutes.`);
  return { expiresInSeconds: EXPIRY_MS / 1000 };
}

export async function verifyOtp(phone: string, code: string, purpose: string): Promise<boolean> {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw new AppError(422, 'otp_expired', 'The code has expired. Please request a new one.');
  if (otp.attempts >= MAX_ATTEMPTS) throw new AppError(429, 'otp_locked', 'Too many wrong attempts. Please request a new code.');

  const ok = timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hash(code)));
  if (!ok) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError(422, 'otp_invalid', 'That code is not correct.', [{ field: 'code', message: 'Incorrect code' }]);
  }
  await prisma.otpCode.deleteMany({ where: { phone, purpose } });
  return true;
}

export const purgeExpiredOtps = () =>
  prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });
