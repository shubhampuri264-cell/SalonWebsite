import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from './lib/supabase';
import { enforceRateLimit } from './lib/ratelimit';
import { sendBookingConfirmationEmail, sendOwnerNotificationEmail } from './lib/emails';
import crypto from 'crypto';

const createSchema = z.object({
  stylist_id: z.union([z.string().uuid(), z.literal('anyone')]),
  service_id: z.string().uuid(),
  client_name: z.string().min(2).max(100),
  client_email: z.string().email().max(254),
  client_phone: z.string().min(7).max(20),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  appointment_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time (HH:MM)'),
  notes: z.string().max(500).optional(),
});

const cancelSchema = z.object({
  token: z.string().uuid('Invalid cancellation token'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'GET') return handleCancel(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'booking'))) return;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { stylist_id, service_id, client_name, client_email, client_phone, appointment_date, appointment_time, notes } = parsed.data;

  // Fetch service duration
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id, name, duration_min')
    .eq('id', service_id)
    .single();

  if (!service) return res.status(404).json({ error: 'Service not found' });

  // Resolve 'anyone' to a specific stylist
  let resolvedStylistId: string = stylist_id;
  if (stylist_id === 'anyone') {
    const resolved = await resolveAnyoneStylist(appointment_date, appointment_time, service.duration_min);
    if (!resolved) return res.status(409).json({ error: 'No stylists available for this slot', code: 'SLOT_TAKEN' });
    resolvedStylistId = resolved;
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('name')
    .eq('id', resolvedStylistId)
    .single();

  const cancellationToken = crypto.randomUUID();
  const userId = await extractUserId(req.headers.authorization);

  const rpcParams: Record<string, unknown> = {
    p_stylist_id: resolvedStylistId,
    p_service_id: service_id,
    p_client_name: client_name,
    p_client_email: client_email,
    p_client_phone: client_phone,
    p_appointment_date: appointment_date,
    p_appointment_time: appointment_time,
    p_duration_min: service.duration_min,
    p_notes: notes ?? null,
    p_cancellation_token: cancellationToken,
  };
  if (userId) rpcParams.p_user_id = userId;

  const { data, error } = await supabaseAdmin.rpc('book_appointment', rpcParams);

  if (error) {
    if (error.message?.includes('SLOT_TAKEN')) {
      return res.status(409).json({ error: 'This time slot is no longer available', code: 'SLOT_TAKEN' });
    }
    return res.status(500).json({ error: `Booking failed: ${error.message}` });
  }

  const appointment = data as any;

  // Await emails before responding. Fire-and-forget is unreliable on serverless
  // (the runtime can be frozen as soon as res is sent), and the silent failure
  // mode was the exact bug that bit us earlier — better to add ~500ms to the
  // booking response than to ship "you booked but no email ever came". Each
  // individual send is wrapped in .catch inside sendEmails so a Resend failure
  // logs but still returns 201 (the booking is real even if the email fails).
  await sendEmails(appointment, service.name, stylist?.name ?? 'Your stylist');

  return res.status(201).json({
    appointment: {
      id: appointment.id,
      status: appointment.status,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
    },
  });
}

async function handleCancel(req: VercelRequest, res: VercelResponse) {
  const parsed = cancelSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid cancellation token', details: parsed.error.flatten() });
  }
  const { token } = parsed.data;

  const { data: appointment, error } = await supabaseAdmin
    .from('appointments')
    .select('*, services:service_id (name)')
    .eq('cancellation_token', token)
    .single();

  if (error || !appointment) return res.status(404).json({ error: 'Appointment not found' });
  if (appointment.status === 'cancelled') return res.status(409).json({ error: 'Appointment is already cancelled' });

  const { error: updateError } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointment.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  return res.json({ message: 'Appointment cancelled successfully' });
}

async function extractUserId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  return user?.id ?? null;
}

async function resolveAnyoneStylist(date: string, time: string, durationMin: number): Promise<string | null> {
  const { data: stylists } = await supabaseAdmin
    .from('stylists')
    .select('id')
    .eq('is_active', true);

  if (!stylists?.length) return null;

  function addMinutesToTime(t: string, minutes: number): string {
    const [h, m] = t.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const newH = Math.floor(total / 60) % 24;
    const newM = total % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }

  for (const stylist of stylists) {
    const { count } = await supabaseAdmin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('stylist_id', stylist.id)
      .eq('appointment_date', date)
      .neq('status', 'cancelled')
      .filter('appointment_time', 'lt', addMinutesToTime(time, durationMin))
      .filter('appointment_time', 'gte', time);

    if ((count ?? 0) === 0) return stylist.id;
  }

  return null;
}

async function sendEmails(appointment: any, serviceName: string, stylistName: string) {
  await Promise.all([
    sendBookingConfirmationEmail(appointment, serviceName, stylistName)
      .catch((e) => console.error('[Email] Confirmation failed:', e)),
    sendOwnerNotificationEmail(appointment, serviceName, stylistName)
      .catch((e) => console.error('[Email] Salon notification failed:', e)),
  ]);
}
