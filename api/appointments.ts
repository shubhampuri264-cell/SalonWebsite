import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './lib/supabase';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'GET') return handleCancel(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const { stylist_id, service_id, client_name, client_email, client_phone, appointment_date, appointment_time, notes } = req.body ?? {};

  if (!service_id || !client_name || !client_email || !client_phone || !appointment_date || !appointment_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Fetch service duration
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id, name, duration_min')
    .eq('id', service_id)
    .single();

  if (!service) return res.status(404).json({ error: 'Service not found' });

  // Resolve 'anyone' to a specific stylist
  let resolvedStylistId = stylist_id;
  if (stylist_id === 'anyone') {
    resolvedStylistId = await resolveAnyoneStylist(appointment_date, appointment_time, service.duration_min);
    if (!resolvedStylistId) return res.status(409).json({ error: 'No stylists available for this slot', code: 'SLOT_TAKEN' });
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

  // Fire-and-forget email (best effort, don't block response)
  sendEmails(appointment, service.name, stylist?.name ?? 'Your stylist').catch(console.error);

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
  const token = req.query.token as string | undefined;
  if (!token) return res.status(400).json({ error: 'Missing cancellation token' });

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
  // Only attempt if Resend is configured
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_placeholder')) return;

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = 'Icon Studio <noreply@iconstudionyc.com>';
  const clientUrl = process.env.CLIENT_URL ?? '';
  const cancelUrl = `${clientUrl}/booking/cancel?token=${appointment.cancellation_token}`;

  const dateTimeStr = formatDateTime(appointment.appointment_date, appointment.appointment_time);

  await resend.emails.send({
    from,
    to: appointment.client_email,
    subject: 'Your Icon Studio Appointment is Confirmed!',
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #C9757A;">Icon Studio</h1>
        <h2>Appointment Confirmed</h2>
        <p>Hi ${appointment.client_name},</p>
        <p>Your appointment has been confirmed:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${stylistName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${dateTimeStr}</td></tr>
        </table>
        <p><strong>Location:</strong> 39-46 Queens Blvd, Sunnyside, NY 11104</p>
        <p><a href="${cancelUrl}" style="color: #C9757A;">Cancel appointment</a></p>
        <p style="color: #888; font-size: 12px; margin-top: 32px;">Icon Studio · 39-46 Queens Blvd, Sunnyside, NY 11104 · (718) 255-6940</p>
      </div>
    `,
  });
}

function formatDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  return d.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
