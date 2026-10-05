import argon2 from 'argon2';
import { z } from 'zod';

// The most common leaked passwords that still pass the length rule. Extend with a full
// top-10k list (one per line) in production if desired.
const COMMON = new Set(
  `12345678 123456789 1234567890 password password1 password123 qwertyui qwerty123 iloveyou
  11111111 00000000 12341234 abcd1234 1q2w3e4r 1qaz2wsx sunshine princess football baseball
  welcome1 welcome123 admin123 administrator letmein1 trustno1 superman batman123 monkey123
  dragon123 master123 passw0rd p@ssw0rd p@ssword qwertyuiop asdfghjkl zxcvbnm1 nepal123
  kathmandu nepal@123 everest1 everest123 87654321 99999999 88888888 12121212 123123123
  abc12345 asdf1234 computer internet starwars whatever michael1 jennifer shadow12 freedom1`
    .split(/\s+/)
    .filter(Boolean),
);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine((p) => !COMMON.has(p.toLowerCase()), 'This password is too common. Please choose another.');

export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });

export async function verifyPassword(hash: string, plain: string) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
