import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../server/src/config/supabase';
import { sendReminderEmail } from '../../server/src/services/emailService';
import type { Appointment } from '@luxe/shared';
import { captureError } from '../_lib/sentry';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is called by Vercel Cron (has the authorization header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      *,
      services:service_id (name),
      stylists:stylist_id (name)
    `)
    .eq('appointment_date', tomorrowStr)
    .eq('status', 'confirmed')
    .eq('reminder_sent', false);

  if (error) {
    await captureError(error, {
      fingerprint: 'cron:reminders:fetch',
      tags: { job: 'cron-reminders' },
      extra: { date: tomorrowStr },
    });
    return res.status(500).json({ error: 'Failed to fetch appointments', details: error.message });
  }

  if (!appointments?.length) {
    return res.json({ sent: 0, message: 'No appointments to remind' });
  }

  let sent = 0;
  let failed = 0;
  for (const row of appointments) {
    const appointment = row as Appointment;
    const serviceName = (row as any).services?.name ?? 'appointment';
    const stylistName = (row as any).stylists?.name ?? 'your stylist';

    try {
      await sendReminderEmail(appointment, serviceName, stylistName);
      await supabaseAdmin
        .from('appointments')
        .update({ reminder_sent: true })
        .eq('id', appointment.id);
      sent++;
    } catch (err) {
      failed++;
      console.error(`Failed reminder for ${appointment.id}:`, err);
      // Report per-appointment failures with a shared fingerprint so Sentry
      // groups them into one issue per occurrence type (e.g. "Resend 429"),
      // not one issue per appointment id.
      await captureError(err, {
        fingerprint: 'cron:reminders:send',
        tags: { job: 'cron-reminders' },
        extra: { appointment_id: appointment.id, date: tomorrowStr },
      });
    }
  }

  // If every reminder failed, surface a higher-severity event — the whole
  // job is broken (likely Resend outage or quota exhaustion), not a one-off.
  if (failed > 0 && sent === 0) {
    await captureError(new Error(`Cron reminders: all ${failed} sends failed`), {
      fingerprint: 'cron:reminders:total-failure',
      tags: { job: 'cron-reminders' },
      extra: { failed, total: appointments.length, date: tomorrowStr },
    });
  }

  return res.json({ sent, failed, total: appointments.length });
}
