import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from './_lib/supabase';
import { enforceRateLimit } from './_lib/ratelimit';
import { sendCancellationEmail } from './_lib/emails';
import { captureError } from './_lib/sentry';
import { createAppointment, extractUserId, rescheduleAppointment } from './_lib/booking';
import { verifyInternalCaller } from './_lib/auth';

const createSchema = z.object({
  // A concrete stylist, always. The old 'anyone' member let the server pick a
  // stylist at random from whoever was free, with no regard for whether they
  // perform the service — see migration 018.
  stylist_id: z.string().uuid(),
  service_id: z.string().uuid(),
  client_name: z.string().min(2).max(100),
  client_email: z.string().email().max(254),
  client_phone: z.string().min(7).max(20),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  appointment_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time (HH:MM)'),
  notes: z.string().max(500).optional(),
  marketing_consent: z.boolean().optional(),
});

const cancelSchema = z.object({
  token: z.string().uuid('Invalid cancellation token'),
});

const rescheduleSchema = z.object({
  appointment_id: z.string().uuid(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  appointment_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time (HH:MM)'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'GET') return handleCancel(req, res);
  if (req.method === 'PATCH') return handleReschedule(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Rate-limit key for this request.
 *
 * Requests relayed by the Iris Edge Function all arrive from Supabase's egress
 * addresses, so keying on the socket IP would put every customer using the chat
 * into a single shared bucket — the tenth booking of the hour across all of
 * them would 429, which looks exactly like a broken feature. When the caller
 * proves it is our own function, trust the end-user IP it forwards instead.
 *
 * The internal token authenticates the *service*, not the customer, and is used
 * here only to choose a rate-limit bucket. It grants no access to anything: the
 * endpoints below still resolve identity from the customer's own Bearer token.
 * Returning undefined falls back to the socket IP.
 */
function rateLimitIdentity(req: VercelRequest): string | undefined {
  if (!verifyInternalCaller(req.headers['x-internal-token'])) return undefined;
  const forwarded = req.headers['x-client-ip'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return ip ? `iris:${ip}` : undefined;
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'booking', rateLimitIdentity(req)))) return;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  // Everything past the parse lives in _lib/booking.ts so the Iris chat
  // assistant creates appointments under the exact same rules — the is_active
  // service filter, temporal validation, blocked_slots awareness, the
  // stylist-performs-this-service check and the awaited confirmation emails.
  // This handler's only remaining job is transport: rate limit, parse, map the
  // result onto HTTP.
  const result = await createAppointment({
    ...parsed.data,
    user_id: await extractUserId(req.headers.authorization),
  });

  if (!result.ok) {
    switch (result.code) {
      case 'SERVICE_NOT_FOUND':
      case 'STYLIST_NOT_FOUND':
        return res.status(404).json({ error: result.message });
      case 'STYLIST_SERVICE_MISMATCH':
        // 400, not 404: both rows exist, the pairing is what is wrong. Iris
        // shows this message verbatim and re-offers the eligible stylists.
        return res.status(400).json({ error: result.message, code: 'STYLIST_SERVICE_MISMATCH' });
      case 'WINDOW':
        return res.status(400).json({ error: result.message, code: result.windowCode });
      case 'SLOT_TAKEN':
        // client/src/components/BookingWizard/StepContact.tsx branches on this
        // exact code to show "someone just took that slot" rather than a
        // generic failure. Changing the code or the status breaks that.
        return res.status(409).json({ error: result.message, code: 'SLOT_TAKEN' });
      case 'RATE_LIMITED':
        return res.status(429).json({ error: result.message, code: 'RATE_LIMITED' });
      case 'INTERNAL':
        return res.status(500).json({ error: result.message });
    }
  }

  return res.status(201).json({
    appointment: {
      id: result.appointment.id,
      status: result.appointment.status,
      appointment_date: result.appointment.appointment_date,
      appointment_time: result.appointment.appointment_time,
    },
  });
}

async function handleReschedule(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'reschedule', rateLimitIdentity(req)))) return;

  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  // Moving someone's appointment requires being that someone. Unlike booking —
  // which guests may do — reschedule is only available to a signed-in customer,
  // because there is no other way to prove the appointment is theirs. Guests
  // still have the cancellation link emailed to them, and can rebook.
  const userId = await extractUserId(req.headers.authorization);
  if (!userId) {
    return res.status(401).json({
      error: 'Please sign in to change an appointment, or use the cancellation link in your confirmation email.',
      code: 'AUTH_REQUIRED',
    });
  }

  const result = await rescheduleAppointment({
    appointmentId: parsed.data.appointment_id,
    userId,
    newDate: parsed.data.appointment_date,
    newTime: parsed.data.appointment_time,
  });

  if (!result.ok) {
    switch (result.code) {
      case 'NOT_FOUND':
        // Also the response for "exists, but belongs to someone else" — see
        // rescheduleAppointment. Do not split these apart.
        return res.status(404).json({ error: result.message });
      case 'ALREADY_CANCELLED':
        return res.status(409).json({ error: result.message, code: 'ALREADY_CANCELLED' });
      case 'SLOT_TAKEN':
        return res.status(409).json({ error: result.message, code: 'SLOT_TAKEN' });
      case 'WINDOW':
        return res.status(400).json({ error: result.message, code: result.windowCode });
      case 'INTERNAL':
        return res.status(500).json({ error: result.message });
    }
  }

  return res.json({
    appointment: {
      id: result.appointment.id,
      status: result.appointment.status,
      appointment_date: result.appointment.appointment_date,
      appointment_time: result.appointment.appointment_time,
    },
  });
}

async function handleCancel(req: VercelRequest, res: VercelResponse) {
  // This path now sends an email, so it spends Resend quota and needs a budget
  // like every other mailing endpoint.
  if (!(await enforceRateLimit(req, res, 'cancel'))) return;

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
  // Also the idempotency guard for the email below: a second click on the
  // cancellation link (or React re-running the effect) stops here, so the
  // customer never receives two cancellation notices for one appointment.
  if (appointment.status === 'cancelled') return res.status(409).json({ error: 'Appointment is already cancelled' });

  const { error: updateError } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointment.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Supabase types a to-one join as an array; runtime gives an object. Unwrap
  // defensively, matching api/customer/resend-email.ts.
  const joined = appointment.services;
  const serviceName =
    ((Array.isArray(joined) ? joined[0] : joined) as { name?: string } | null)?.name ?? 'your service';

  // Awaited, not fire-and-forget: the serverless runtime can freeze the moment
  // the response is sent. Failure is logged but never fails the cancel — the
  // slot is already released, and telling the customer their cancellation
  // failed would send them back to click the link again.
  try {
    await sendCancellationEmail(appointment, serviceName);
  } catch (err) {
    console.error('[Email] Cancellation confirmation failed:', err);
    await captureError(err, {
      fingerprint: 'api:appointments:email:cancellation',
      tags: { endpoint: 'GET /api/appointments' },
      extra: { appointment_id: appointment.id },
    });
  }

  return res.json({ message: 'Appointment cancelled successfully' });
}
