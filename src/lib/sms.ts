import { env } from '../config/env.js';
import { logger } from './logger.js';
import { normalizePhone } from './phone.js';

/** Messages sent in development/test when SMS_PROVIDER=log. Tests read the last OTP from here. */
export const smsOutbox: { to: string; text: string; at: Date }[] = [];

async function sparrow(to: string, text: string) {
  const res = await fetch('https://api.sparrowsms.com/v2/sms/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: env.SMS_TOKEN, from: env.SMS_FROM, to, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Sparrow SMS ${res.status}: ${await res.text()}`);
}

async function aakash(to: string, text: string) {
  const body = new URLSearchParams({ auth_token: env.SMS_TOKEN ?? '', to, text });
  const res = await fetch('https://sms.aakashsms.com/sms/v3/send', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Aakash SMS ${res.status}: ${await res.text()}`);
}

/** Sends an SMS to a Nepali mobile number. Never throws. */
export async function sendSms(rawTo: string, text: string): Promise<boolean> {
  const to = normalizePhone(rawTo);
  try {
    if (env.SMS_PROVIDER === 'log') {
      smsOutbox.push({ to, text, at: new Date() });
      if (smsOutbox.length > 100) smsOutbox.shift();
      logger.info({ to, text }, '[sms:log] SMS not sent (SMS_PROVIDER=log)');
      return true;
    }
    if (env.SMS_PROVIDER === 'sparrow') await sparrow(to, text);
    else await aakash(to, text);
    return true;
  } catch (err) {
    logger.error({ err, to }, 'SMS send failed');
    return false;
  }
}
