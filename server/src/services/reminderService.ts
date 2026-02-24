import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase';
import { sendReminderEmail } from './emailService';
import type { Appointment } from '@luxe/shared';

async function sendDailyReminders(): Promise<void> {
  console.log('[Reminders] Running daily reminder job...');

  // Calculate tomorrow's date in the salon's timezone
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
    console.error('[Reminders] Failed to fetch appointments:', error);
    return;
  }

  if (!appointments?.length) {
    console.log('[Reminders] No appointments to remind today.');
    return;
  }

  console.log(`[Reminders] Sending reminders for ${appointments.length} appointment(s)...`);

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

      console.log(`[Reminders] Sent reminder for appointment ${appointment.id}`);
    } catch (err) {
      console.error(`[Reminders] Failed for appointment ${appointment.id}:`, err);
    }
  }
}

/**
 * Start the daily reminder cron job.
 * Runs every day at 8:00 AM server time.
 */
export function startReminderService(): void {
  cron.schedule('0 8 * * *', sendDailyReminders, {
    timezone: process.env.SALON_TIMEZONE ?? 'America/New_York',
  });

  console.log('[Reminders] Reminder service started (runs daily at 8:00 AM ET)');
}
