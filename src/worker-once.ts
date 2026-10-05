/**
 * One shot runner for shared hosting (cPanel cron every 10 minutes), where long running
 * daemons are killed. Runs expiry every time, the sitemap hourly and reminders once a day.
 *   *\/10 * * * *  cd ~/everest-kennel && node dist/worker-once.js
 */
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { nptTime } from './lib/dates.js';
import { sendVaccinationReminders } from './jobs/vaccination-reminders.js';
import { expireReservations } from './jobs/expire-reservations.js';
import { generateSitemap } from './jobs/sitemap.js';

const now = new Date();
const [hh, mm] = nptTime(now).split(':').map(Number) as [number, number];

try {
  await expireReservations();
  if (mm < 10) await generateSitemap();
  if (hh === 8 && mm < 10) await sendVaccinationReminders();
} catch (err) {
  logger.error({ err }, 'worker-once failed');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
