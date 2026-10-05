import cron from 'node-cron';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { sendVaccinationReminders } from './jobs/vaccination-reminders.js';
import { expireReservations } from './jobs/expire-reservations.js';
import { generateSitemap } from './jobs/sitemap.js';

const tz = { timezone: 'Asia/Kathmandu' };
const run = (name: string, fn: () => Promise<unknown>) => async () => {
  const started = Date.now();
  try {
    await fn();
    logger.info({ job: name, ms: Date.now() - started }, 'Job finished');
  } catch (err) {
    logger.error({ job: name, err }, 'Job failed');
  }
};

cron.schedule('0 8 * * *', run('vaccination-reminders', () => sendVaccinationReminders()), tz);
cron.schedule('*/10 * * * *', run('expire-reservations', expireReservations), tz);
cron.schedule('5 * * * *', run('sitemap', generateSitemap), tz);

// Generate the sitemap once at startup.
void run('sitemap', generateSitemap)();

logger.info('Worker started');

const stop = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
