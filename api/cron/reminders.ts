import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../server/src/config/supabase';
import { sendReminderEmail } from '../../server/src/services/emailService';
import type { Appointment } from '@luxe/shared';

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
    return res.status(500).json({ error: 'Failed to fetch appointments', details: error.message });
  }

  if (!appointments?.length) {
    return res.json({ sent: 0, message: 'No appointments to remind' });
  }

  let sent = 0;
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
      console.error(`Failed reminder for ${appointment.id}:`, err);
    }
  }

  return res.json({ sent, total: appointments.length });
}
