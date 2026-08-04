import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from './_lib/supabase';
import { enforceRateLimit } from './_lib/ratelimit';
import {
  sendBookingConfirmationEmail,
  sendOwnerNotificationEmail,
  sendCancellationEmail,
} from './_lib/emails';
import { captureError } from './_lib/sentry';
import { isSlotFree } from './_lib/timeSlots';
import { validateBookingWindow } from './_lib/businessHours';
import { salonToday, salonNowMinutes } from './_lib/dates';
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
  marketing_consent: z.boolean().optional(),
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
  const { stylist_id, service_id, client_name, client_email, client_phone, appointment_date, appointment_time, notes, marketing_consent } = parsed.data;

  // is_active matters: migration 013 retires services by deactivating rather
  // than deleting them, so without this filter a stale booking page (or a
  // crafted request) can still book a service the owner has taken off the menu.
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id, name, duration_min')
    .eq('id', service_id)
    .eq('is_active', true)
    .single();

  if (!service) return res.status(404).json({ error: 'Service not found' });

  // Temporal validation. The Zod schema above only checks the *shape* of the
  // date and time strings, so until this existed the endpoint accepted
  // 2020-01-01, 9999-12-31, 03:00, 09:31, and a 180-minute service starting at
  // 19:30 that runs 2.5 hours past closing — each of them unauthenticated, each
  // returning 201 and sending a real confirmation email. Runs after the service
  // lookup because the close-time check needs duration_min.
  const window = validateBookingWindow({
    date: appointment_date,
    time: appointment_time,
    durationMin: service.duration_min,
    today: salonToday(),
    nowMinutes: salonNowMinutes(),
  });
  if (!window.ok) {
    return res.status(400).json({ error: window.message, code: window.code });
  }

  // Both branches resolve against active stylists only, then go through the
  // same availability check. The explicit-stylist path used to skip both:
  // it never verified the stylist still works here, and it leaned on the RPC,
  // which only knows about appointment overlap — never about blocked_slots.
  const stylistQuery = supabaseAdmin.from('stylists').select('id, name').eq('is_active', true);
  const { data: activeStylists, error: stylistError } =
    stylist_id === 'anyone' ? await stylistQuery : await stylistQuery.eq('id', stylist_id);

  if (stylistError) {
    await captureError(stylistError, {
      fingerprint: 'api:appointments:stylist-lookup',
      tags: { endpoint: 'POST /api/appointments' },
      extra: { stylist_id, appointment_date, appointment_time },
    });
    return res.status(500).json({ error: 'Could not verify availability. Please try again.' });
  }

  if (!activeStylists?.length) {
    return stylist_id === 'anyone'
      ? res.status(409).json({ error: 'No stylists available for this slot', code: 'SLOT_TAKEN' })
      : res.status(404).json({ error: 'Stylist not found' });
  }

  const freeStylistIds = await findFreeStylists(
    activeStylists.map((s) => s.id),
    appointment_date,
    appointment_time,
    service.duration_min
  );

  if (freeStylistIds === null) {
    return res.status(500).json({ error: 'Could not verify availability. Please try again.' });
  }
  if (!freeStylistIds.length) {
    return res.status(409).json({
      error: stylist_id === 'anyone'
        ? 'No stylists available for this slot'
        : 'This time slot is no longer available',
      code: 'SLOT_TAKEN',
    });
  }

  // Random rather than freeStylistIds[0]: two concurrent requests for the same
  // slot used to deterministically pick the same stylist and race each other
  // while other free stylists sat idle. Spreading the choice turns most of
  // those races into two successful bookings instead of one 409. It narrows the
  // race, it does not close it — the exclusion constraint from migration 016 is
  // what actually makes a double-booking impossible.
  const resolvedStylistId: string =
    freeStylistIds[Math.floor(Math.random() * freeStylistIds.length)];
  const stylistName =
    activeStylists.find((s) => s.id === resolvedStylistId)?.name ?? 'Your stylist';

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
    // 23P01 is exclusion_violation from appointments_no_overlap (migration
    // 016). The RPC maps it to SLOT_TAKEN itself; this is the belt-and-braces
    // path for a database where 016 is applied but the newer RPC is not.
    if (
      error.code === '23P01' ||
      error.message?.includes('SLOT_TAKEN') ||
      error.message?.includes('SLOT_BLOCKED')
    ) {
      // Race condition between the availability check above and the insert —
      // expected, not worth alerting on. Caller retries with a different slot.
      // SLOT_BLOCKED comes from the migration-014 blocked_slots guard inside
      // the RPC; treated identically from the customer's point of view.
      return res.status(409).json({ error: 'This time slot is no longer available', code: 'SLOT_TAKEN' });
    }
    // Anything else here is unexpected: RLS misconfig, RPC permission, DB
    // outage, etc. These are the failures the owner is paying for via
    // empty booking slots — surface them.
    await captureError(error, {
      fingerprint: 'api:appointments:rpc',
      tags: { endpoint: 'POST /api/appointments' },
      extra: { service_id, stylist_id: resolvedStylistId, appointment_date, appointment_time },
    });
    return res.status(500).json({ error: `Booking failed: ${error.message}` });
  }

  const appointment = data as any;

  // Recorded with a follow-up UPDATE rather than as a book_appointment
  // parameter. Adding an argument to that function would not replace it —
  // Postgres keys functions by signature, so CREATE OR REPLACE with an extra
  // parameter creates a second overload, and a call that omits the new arg
  // then matches both and errors out. Dropping the old overload first would
  // break live bookings for the length of the deploy. The UPDATE avoids all of
  // that, and only runs for customers who actually ticked the box.
  if (marketing_consent) {
    const { error: consentError } = await supabaseAdmin
      .from('appointments')
      .update({ marketing_consent: true })
      .eq('id', appointment.id);

    if (consentError) {
      // Never fail the booking over this. The appointment is confirmed and the
      // customer is owed their 201; a dropped consent flag is a marketing-list
      // gap, not a broken booking.
      console.error('[Booking] Failed to record marketing consent:', consentError);
      await captureError(consentError, {
        fingerprint: 'api:appointments:marketing-consent',
        tags: { endpoint: 'POST /api/appointments' },
        extra: { appointment_id: appointment.id },
      });
    }
  }

  // Await emails before responding. Fire-and-forget is unreliable on serverless
  // (the runtime can be frozen as soon as res is sent), and the silent failure
  // mode was the exact bug that bit us earlier — better to add ~500ms to the
  // booking response than to ship "you booked but no email ever came". Each
  // individual send is wrapped in .catch inside sendEmails so a Resend failure
  // logs but still returns 201 (the booking is real even if the email fails).
  await sendEmails(appointment, service.name, stylistName);

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
      extra: { appointment_id: appointment.id, client_email: appointment.client_email },
    });
  }

  return res.json({ message: 'Appointment cancelled successfully' });
}

async function extractUserId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  return user?.id ?? null;
}

/**
 * Narrows `stylistIds` to those genuinely free for [time, time + durationMin).
 *
 * Returns `null` if a conflict query failed — a query we could not run is not
 * evidence of a free stylist, so the caller must fail closed with a retryable
 * 500 rather than risk a double-booking.
 *
 * The previous implementation compared only the *start* time of existing
 * appointments against the requested window, so an appointment already in
 * progress was invisible: booking 10:30 against an existing 10:00-11:30 job
 * returned that stylist as free. It also never consulted blocked_slots, so
 * vacation days were bookable. Both rules now live in isSlotFree, shared with
 * GET /api/availability.
 */
async function findFreeStylists(
  stylistIds: string[],
  date: string,
  time: string,
  durationMin: number
): Promise<string[] | null> {
  if (!stylistIds.length) return [];

  const [appointments, blocked] = await Promise.all([
    supabaseAdmin
      .from('appointments')
      .select('stylist_id, appointment_time, duration_min')
      .in('stylist_id', stylistIds)
      .eq('appointment_date', date)
      .neq('status', 'cancelled'),
    supabaseAdmin
      .from('blocked_slots')
      .select('stylist_id, start_time, end_time')
      .in('stylist_id', stylistIds)
      .eq('blocked_date', date),
  ]);

  const queryError = appointments.error ?? blocked.error;
  if (queryError) {
    await captureError(queryError, {
      fingerprint: 'api:appointments:availability-check',
      tags: { endpoint: 'POST /api/appointments' },
      extra: { date, time, durationMin, stylistIds },
    });
    return null;
  }

  return stylistIds.filter((id) =>
    isSlotFree({
      startTime: time,
      durationMin,
      existingAppointments: (appointments.data ?? []).filter((a) => a.stylist_id === id),
      blockedSlots: (blocked.data ?? []).filter((b) => b.stylist_id === id),
    })
  );
}

async function sendEmails(appointment: any, serviceName: string, stylistName: string) {
  await Promise.all([
    sendBookingConfirmationEmail(appointment, serviceName, stylistName).catch(async (e) => {
      console.error('[Email] Confirmation failed:', e);
      await captureError(e, {
        fingerprint: 'api:appointments:email:confirmation',
        tags: { endpoint: 'POST /api/appointments' },
        extra: { appointment_id: appointment.id, client_email: appointment.client_email },
      });
    }),
    sendOwnerNotificationEmail(appointment, serviceName, stylistName).catch(async (e) => {
      console.error('[Email] Salon notification failed:', e);
      await captureError(e, {
        fingerprint: 'api:appointments:email:owner',
        tags: { endpoint: 'POST /api/appointments' },
        extra: { appointment_id: appointment.id },
      });
    }),
  ]);
}
