import { prisma } from '../lib/prisma.js';
import { sendSms } from '../lib/sms.js';
import { sendMail } from '../lib/mailer.js';
import { logger } from '../lib/logger.js';
import { addDays, dateOnly, formatDay, nptDate } from '../lib/dates.js';
import { env } from '../config/env.js';
import { BUSINESS } from '../config/constants.js';

/**
 * Daily at 08:00 NPT: reminders for vaccinations due in 7 days and in 1 day.
 * `reminderSent` is set after the 1 day reminder, so each record gets at most two messages.
 */
export async function sendVaccinationReminders(today = nptDate()) {
  let sent = 0;
  for (const days of [7, 1]) {
    const due = dateOnly(addDays(today, days));
    const records = await prisma.vaccinationRecord.findMany({
      where: { nextDueOn: due, reminderSent: false, pet: { user: { isActive: true, deletedAt: null } } },
      include: { pet: { include: { user: true } } },
    });
    for (const r of records) {
      const owner = r.pet.user;
      const when = days === 1 ? 'tomorrow' : `on ${formatDay(r.nextDueOn)}`;
      const text = `${BUSINESS.name}: ${r.pet.name}'s ${r.vaccine} vaccine is due ${when}. Book a home visit: ${env.APP_URL}/book?service=VACCINATION or call ${BUSINESS.phoneDisplay}.`;
      await sendSms(owner.phone, text);
      if (owner.email) {
        await sendMail({ to: owner.email, subject: `${r.pet.name}'s vaccination is due ${when}`, text: `Hello ${owner.name},\n\n${text}\n` });
      }
      if (days === 1) await prisma.vaccinationRecord.update({ where: { id: r.id }, data: { reminderSent: true } });
      sent++;
    }
  }
  logger.info({ sent }, 'Vaccination reminders sent');
  return sent;
}
