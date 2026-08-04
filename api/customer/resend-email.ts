import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from '../_lib/supabase';
import { enforceRateLimit } from '../_lib/ratelimit';
import { sendBookingConfirmationEmail } from '../_lib/emails';
import { captureError } from '../_lib/sentry';
import { salonToday } from '../_lib/dates';

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

  // No point sending a "your appointment is confirmed" email for a past date.
  // Compared in salon-local time: this function runs with TZ=UTC, where the
  // date rolls over at 20:00 EDT and would reject a same-evening appointment.
  if (appointment.appointment_date < salonToday()) {
    return res.status(409).json({ error: 'Appointment is in the past' });
  }

  // Supabase types join results as arrays even when the FK is single-valued.
  // Runtime is a single object here, but unwrap defensively in case the
  // generated types ever flip.
  const pickName = (v: unknown): string | null => {
    if (!v) return null;
    const first = Array.isArray(v) ? v[0] : v;
    return (first as { name?: string } | null)?.name ?? null;
  };
  const serviceName = pickName(appointment.services) ?? 'Service';
  const stylistName = pickName(appointment.stylists) ?? 'Your stylist';

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
      serviceName,
      stylistName,
    );
  } catch (err) {
    console.error('[Email] Resend failed:', err);
    await captureError(err, {
      fingerprint: 'api:customer:resend-email',
      tags: { endpoint: 'POST /api/customer/resend-email' },
      extra: { appointment_id },
    });
    return res.status(502).json({ error: 'Failed to send email. Please try again later.' });
  }

  return res.json({ message: 'Confirmation email sent.' });
}
