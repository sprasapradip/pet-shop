import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
  if (!env.SMTP_HOST) return undefined;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Sends an email. Never throws: failures are logged so callers can fire and forget. */
export async function sendMail(input: MailInput): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    logger.info({ to: input.to, subject: input.subject, text: input.text }, '[mail:log] email not sent (SMTP_HOST empty)');
    return true;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, ...input });
    return true;
  } catch (err) {
    logger.error({ err, to: input.to, subject: input.subject }, 'Email send failed');
    return false;
  }
}
