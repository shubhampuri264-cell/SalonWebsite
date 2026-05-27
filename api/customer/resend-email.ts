import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { enforceRateLimit } from '../lib/ratelimit';
import { sendBookingConfirmationEmail } from '../lib/emails';

const bodySchema = z.object({
  appointment_id: z.string().uuid(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Layer 1: per-IP throttle. Cheap and applied before any auth/DB work
  // so a spammer can't burn Resend quota by repeatedly hitting the endpoint.
  if (!(await enforceRateLimit(req, res, 'emailResend'))) return;

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const { appointment_id } = parsed.data;

  // Layer 2: per-appointment cooldown. Even if multiple users share an IP
  // (offices, VPNs), each specific booking can only trigger one resend per 5m.
  if (!(await enforceRateLimit(req, res, 'emailResendPerAppt', `appt:${appointment_id}`))) return;

  const { data: appointment, error: fetchError } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, user_id, status,
      client_name, client_email, client_phone,
      appointment_date, appointment_time,
      cancellation_token, notes,
      services:service_id (name),
      stylists:stylist_id (name)
    `)
    .eq('id', appointment_id)
    .single();

  if (fetchError || !appointment) return res.status(404).json({ error: 'Appointment not found' });

  // Ownership check: only the booker can resend their own confirmation.
  if (appointment.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  if (appointment.status === 'cancelled') {
    return res.status(409).json({ error: 'Cannot resend confirmation for a cancelled appointment' });
  }

  // No point sending a "your appointment is confirmed" email for a past date
  const todayLocal = new Date().toISOString().slice(0, 10);
  if (appointment.appointment_date < todayLocal) {
    return res.status(409).json({ error: 'Appointment is in the past' });
  }

  const services = appointment.services as { name: string } | null;
  const stylists = appointment.stylists as { name: string } | null;

  try {
    await sendBookingConfirmationEmail(
      {
        id: appointment.id,
        client_name: appointment.client_name,
        client_email: appointment.client_email,
        client_phone: appointment.client_phone,
        appointment_date: appointment.appointment_date,
        appointment_time: appointment.appointment_time,
        cancellation_token: appointment.cancellation_token,
        notes: appointment.notes,
      },
      services?.name ?? 'Service',
      stylists?.name ?? 'Your stylist',
    );
  } catch (err) {
    console.error('[Email] Resend failed:', err);
    return res.status(502).json({ error: 'Failed to send email. Please try again later.' });
  }

  return res.json({ message: 'Confirmation email sent.' });
}
