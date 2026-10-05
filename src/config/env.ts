import 'dotenv/config';
import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/$/, '')),
  TRUST_PROXY: z.coerce.number().default(1),
  DATABASE_URL: z.string().min(1),
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  // Empty SMTP_HOST means emails are logged instead of sent (development).
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  MAIL_FROM: z.string().default('The Everest Kennel <no-reply@everestkennel.com.np>'),
  ADMIN_NOTIFY_EMAIL: z.string().email(),
  SMS_PROVIDER: z.enum(['sparrow', 'aakash', 'log']).default('log'),
  SMS_TOKEN: optional,
  SMS_FROM: optional,
  ESEWA_PRODUCT_CODE: z.string(),
  ESEWA_SECRET_KEY: z.string(),
  ESEWA_FORM_URL: z.string().url(),
  ESEWA_STATUS_URL: z.string().url(),
  KHALTI_SECRET_KEY: z.string(),
  KHALTI_BASE_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/$/, '')),
  WHATSAPP_NUMBER: z.string(),
  UPLOAD_MAX_MB: z.coerce.number().default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
