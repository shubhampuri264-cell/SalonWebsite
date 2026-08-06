// The booking write path, shared by every caller that creates an appointment.
//
// This code was extracted verbatim from api/appointments.ts so that a second
// entry point (the Iris chat assistant) could not end up with a second,
// subtly-different implementation. Every rule the booking wizard relies on —
// the is_active service filter, temporal validation, blocked_slots awareness,
// the stylist-performs-this-service check, the exclusion-constraint mapping,
// and the awaited confirmation emails — lives here exactly once.
//
// It is deliberately HTTP-agnostic: no VercelRequest, no VercelResponse, no
// status codes. Callers map the returned discriminated union onto whatever
// transport they speak. That is what lets the chat assistant reuse it over an
// internal HTTP call without the two paths drifting.

import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { captureError } from './sentry';
import { isSlotFree } from './timeSlots';
import { stylistPerformsService } from './eligibility';
import { validateBookingWindow, type BookingWindowErrorCode } from './businessHours';
import { salonToday, salonNowMinutes } from './dates';
import {
  checkIdentifierLimit,
  limitKeyForEmail,
  limitKeyForPhone,
} from './ratelimit';
import {
  sendBookingConfirmationEmail,
  sendOwnerNotificationEmail,
  sendRescheduleEmail,
} from './emails';

/** Phone number shown to a customer who has hit a cap and needs a human. */
const SALON_PHONE = '(718) 255-6940';

export interface CreateAppointmentInput {
  stylist_id: string;
  service_id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM
  notes?: string;
  marketing_consent?: boolean;
  /** Resolved from the caller's Bearer token, or null for a guest booking. */
  user_id: string | null;
}

/** The subset of the appointments row callers actually need back. */
export interface BookedAppointment {
  id: string;
  status: string;
  appointment_date: string;
  appointment_time: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  cancellation_token: string;
  notes: string | null;
}

export type CreateAppointmentResult =
  | {
      ok: true;
      appointment: BookedAppointment;
      serviceName: string;
      stylistName: string;
    }
  | {
      ok: false;
      code:
        | 'SERVICE_NOT_FOUND'
        | 'STYLIST_NOT_FOUND'
        | 'STYLIST_SERVICE_MISMATCH'
        | 'SLOT_TAKEN'
        | 'RATE_LIMITED'
        | 'INTERNAL';
      message: string;
    }
  | {
      ok: false;
      code: 'WINDOW';
      windowCode: BookingWindowErrorCode;
      message: string;
    };

/**
 * Creates an appointment, or explains why it could not.
 *
 * The `message` on each failure is the exact copy the customer should see, so
 * callers never have to invent wording — and so the HTTP responses from
 * /api/appointments stay byte-identical to what they were before this
 * extraction. The booking wizard branches on `code === 'SLOT_TAKEN'`, which is
 * why that code is part of the contract rather than an implementation detail.
 */
export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const {
    stylist_id,
    service_id,
    client_name,
    client_email,
    client_phone,
    appointment_date,
    appointment_time,
    notes,
    marketing_consent,
    user_id,
  } = input;

  // is_active matters: migration 013 retires services by deactivating rather
  // than deleting them, so without this filter a stale booking page (or a
  // crafted request) can still book a service the owner has taken off the menu.
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id, name, duration_min')
    .eq('id', service_id)
    .eq('is_active', true)
    .single();

  if (!service) return { ok: false, code: 'SERVICE_NOT_FOUND', message: 'Service not found' };

  // Temporal validation. The caller's schema only checks the *shape* of the
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
    return { ok: false, code: 'WINDOW', windowCode: window.code, message: window.message };
  }

  // Resolved against active stylists only, then put through the same
  // availability check every other path uses. This lookup used to be skipped
  // for an explicitly-named stylist: it never verified they still work here,
  // and it leaned on the RPC, which only knows about appointment overlap —
  // never about blocked_slots.
  const { data: stylist, error: stylistError } = await supabaseAdmin
    .from('stylists')
    .select('id, name')
    .eq('is_active', true)
    .eq('id', stylist_id)
    .maybeSingle();

  if (stylistError) {
    await captureError(stylistError, {
      fingerprint: 'api:appointments:stylist-lookup',
      tags: { endpoint: 'POST /api/appointments' },
      extra: { stylist_id, appointment_date, appointment_time },
    });
    return {
      ok: false,
      code: 'INTERNAL',
      message: 'Could not verify availability. Please try again.',
    };
  }

  if (!stylist) {
    return { ok: false, code: 'STYLIST_NOT_FOUND', message: 'Stylist not found' };
  }

  // The gate this whole file used to be missing. Service and stylist were
  // looked up independently and never compared, so a threading specialist could
  // be booked for a balayage — by a stale page, a crafted request, or the old
  // "anyone available" resolver, which picked from the free roster at random.
  // The UI and the chat assistant filter too, but neither is trusted here.
  const performs = await stylistPerformsService(stylist.id, service_id);
  if (performs === null) {
    return {
      ok: false,
      code: 'INTERNAL',
      message: 'Could not verify availability. Please try again.',
    };
  }
  if (!performs) {
    return {
      ok: false,
      code: 'STYLIST_SERVICE_MISMATCH',
      message: `${stylist.name} does not offer ${service.name}. Please pick a stylist who does.`,
    };
  }

  const freeStylistIds = await findFreeStylists(
    [stylist.id],
    appointment_date,
    appointment_time,
    service.duration_min,
  );

  if (freeStylistIds === null) {
    return {
      ok: false,
      code: 'INTERNAL',
      message: 'Could not verify availability. Please try again.',
    };
  }
  if (!freeStylistIds.length) {
    return {
      ok: false,
      code: 'SLOT_TAKEN',
      message: 'This time slot is no longer available',
    };
  }

  const resolvedStylistId: string = stylist.id;
  const stylistName = stylist.name;

  // Per-customer caps, checked here rather than in a route handler so both the
  // booking wizard and the chat assistant are covered by one enforcement point.
  // Deliberately the last gate before the write: a request that fails
  // validation or loses the slot race should not spend the customer's daily
  // allowance, so only genuine, otherwise-valid booking attempts count.
  const [emailWithinCap, phoneWithinCap] = await Promise.all([
    checkIdentifierLimit('bookingPerEmail', limitKeyForEmail(client_email)),
    checkIdentifierLimit('bookingPerPhone', limitKeyForPhone(client_phone)),
  ]);
  if (!emailWithinCap || !phoneWithinCap) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: `You've reached the daily limit for online bookings. Please call us on ${SALON_PHONE} and we'll sort it out.`,
    };
  }

  const cancellationToken = crypto.randomUUID();

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
  if (user_id) rpcParams.p_user_id = user_id;

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
      return {
        ok: false,
        code: 'SLOT_TAKEN',
        message: 'This time slot is no longer available',
      };
    }
    // Anything else here is unexpected: RLS misconfig, RPC permission, DB
    // outage, etc. These are the failures the owner is paying for via
    // empty booking slots — surface them.
    await captureError(error, {
      fingerprint: 'api:appointments:rpc',
      tags: { endpoint: 'POST /api/appointments' },
      extra: {
        service_id,
        stylist_id: resolvedStylistId,
        appointment_date,
        appointment_time,
      },
    });
    return { ok: false, code: 'INTERNAL', message: `Booking failed: ${error.message}` };
  }

  const appointment = data as BookedAppointment;

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
      // customer is owed their success response; a dropped consent flag is a
      // marketing-list gap, not a broken booking.
      console.error('[Booking] Failed to record marketing consent:', consentError);
      await captureError(consentError, {
        fingerprint: 'api:appointments:marketing-consent',
        tags: { endpoint: 'POST /api/appointments' },
        extra: { appointment_id: appointment.id },
      });
    }
  }

  // Await emails before returning. Fire-and-forget is unreliable on serverless
  // (the runtime can be frozen as soon as the response is sent), and the silent
  // failure mode was the exact bug that bit us earlier — better to add ~500ms to
  // the booking response than to ship "you booked but no email ever came". Each
  // individual send is wrapped in .catch inside sendEmails so a Resend failure
  // logs but the booking still succeeds (it is real even if the email is not).
  await sendEmails(appointment, service.name, stylistName);

  return { ok: true, appointment, serviceName: service.name, stylistName };
}

export type RescheduleResult =
  | {
      ok: true;
      appointment: BookedAppointment;
      serviceName: string;
      stylistName: string;
    }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'ALREADY_CANCELLED' | 'SLOT_TAKEN' | 'INTERNAL';
      message: string;
    }
  | {
      ok: false;
      code: 'WINDOW';
      windowCode: BookingWindowErrorCode;
      message: string;
    };

/**
 * Moves an existing appointment to a new date/time, keeping the same service
 * and stylist.
 *
 * IMPLEMENTED AS AN UPDATE, NOT AS CANCEL-THEN-REBOOK.
 *
 * The obvious design — create the new appointment, then cancel the old one —
 * cannot work here, and the reason is worth recording because it is not
 * obvious. The `appointments_no_overlap` exclusion constraint from migration
 * 016 ignores only rows whose status is 'cancelled'. During a cancel-last
 * sequence the original booking is still 'confirmed' when the replacement is
 * inserted, so any move that overlaps its own current slot — 14:00 to 14:30 for
 * a 60-minute service, the single most common reschedule there is — violates
 * the constraint and fails. Reversing the order (cancel first) trades that for
 * a worse failure: if the insert then loses a race, the customer is left with
 * no appointment at all.
 *
 * A single UPDATE has neither problem. Postgres evaluates the exclusion
 * constraint against the new row version, so an appointment never conflicts
 * with its own former self; and if the target slot is genuinely taken the
 * UPDATE fails and the original booking is untouched — which is exactly the
 * safety property the cancel-last ordering was reaching for. It also keeps one
 * row, one id and one cancellation token, so the customer's existing
 * confirmation link keeps working.
 *
 * Ownership is re-verified here on every call. A caller proving it is our own
 * Edge Function (see verifyInternalCaller) proves nothing about which customer
 * is asking, so `userId` must always be the *customer's* resolved id.
 */
export async function rescheduleAppointment(input: {
  appointmentId: string;
  userId: string;
  newDate: string;
  newTime: string;
}): Promise<RescheduleResult> {
  const { appointmentId, userId, newDate, newTime } = input;

  const { data: existing, error: loadError } = await supabaseAdmin
    .from('appointments')
    .select(
      'id, user_id, status, stylist_id, service_id, duration_min, appointment_date, appointment_time, client_name, client_email, client_phone, cancellation_token, notes',
    )
    .eq('id', appointmentId)
    .maybeSingle();

  if (loadError) {
    await captureError(loadError, {
      fingerprint: 'api:appointments:reschedule:load',
      tags: { endpoint: 'PATCH /api/appointments' },
      extra: { appointment_id: appointmentId },
    });
    return { ok: false, code: 'INTERNAL', message: 'Could not load that appointment. Please try again.' };
  }

  // "Not yours" and "does not exist" deliberately return the SAME result. Any
  // difference between them lets someone walk appointment ids and learn which
  // ones are real — the same anti-enumeration stance as
  // api/customer/forgot-password.ts.
  if (!existing || existing.user_id !== userId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Appointment not found' };
  }

  if (existing.status === 'cancelled') {
    return {
      ok: false,
      code: 'ALREADY_CANCELLED',
      message: 'That appointment was cancelled and cannot be moved. Please book a new one.',
    };
  }

  const window = validateBookingWindow({
    date: newDate,
    time: newTime,
    durationMin: existing.duration_min,
    today: salonToday(),
    nowMinutes: salonNowMinutes(),
  });
  if (!window.ok) {
    return { ok: false, code: 'WINDOW', windowCode: window.code, message: window.message };
  }

  // Excluding this appointment's own row is what makes a same-day move work.
  const free = await findFreeStylists(
    [existing.stylist_id],
    newDate,
    newTime,
    existing.duration_min,
    existing.id,
  );

  if (free === null) {
    return {
      ok: false,
      code: 'INTERNAL',
      message: 'Could not verify availability. Please try again.',
    };
  }
  if (!free.length) {
    return { ok: false, code: 'SLOT_TAKEN', message: 'That time is no longer available' };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('appointments')
    .update({ appointment_date: newDate, appointment_time: newTime })
    .eq('id', existing.id)
    // Re-assert both in the WHERE clause. Between the checks above and this
    // write the row could have been cancelled by the customer's own emailed
    // link; without this the reschedule would silently resurrect it.
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .select()
    .maybeSingle();

  if (updateError) {
    // 23P01 is the exclusion constraint: someone took the slot between the
    // availability check and this write. Expected under contention, and the
    // original appointment is untouched.
    if (updateError.code === '23P01') {
      return { ok: false, code: 'SLOT_TAKEN', message: 'That time is no longer available' };
    }
    await captureError(updateError, {
      fingerprint: 'api:appointments:reschedule:update',
      tags: { endpoint: 'PATCH /api/appointments' },
      extra: { appointment_id: existing.id, newDate, newTime },
    });
    return { ok: false, code: 'INTERNAL', message: 'Could not move that appointment. Please try again.' };
  }

  // No row came back: the guards in the WHERE clause matched nothing, meaning
  // the appointment was cancelled underneath us.
  if (!updated) {
    return {
      ok: false,
      code: 'ALREADY_CANCELLED',
      message: 'That appointment was cancelled and cannot be moved. Please book a new one.',
    };
  }

  const [{ data: service }, { data: stylist }] = await Promise.all([
    supabaseAdmin.from('services').select('name').eq('id', existing.service_id).maybeSingle(),
    supabaseAdmin.from('stylists').select('name').eq('id', existing.stylist_id).maybeSingle(),
  ]);

  const serviceName = service?.name ?? 'your service';
  const stylistName = stylist?.name ?? 'your stylist';

  // One email describing the move, never a cancellation plus a confirmation —
  // see sendRescheduleEmail for why. Failure is logged but never fails the
  // reschedule: the appointment really has moved, and telling the customer it
  // failed would send them back to move it again.
  try {
    await sendRescheduleEmail(
      updated as BookedAppointment,
      serviceName,
      stylistName,
      existing.appointment_date,
      existing.appointment_time,
    );
  } catch (err) {
    console.error('[Email] Reschedule notice failed:', err);
    await captureError(err, {
      fingerprint: 'api:appointments:email:reschedule',
      tags: { endpoint: 'PATCH /api/appointments' },
      extra: { appointment_id: existing.id },
    });
  }

  return {
    ok: true,
    appointment: updated as BookedAppointment,
    serviceName,
    stylistName,
  };
}

/**
 * Resolves a Supabase user id from an Authorization header, or null.
 *
 * The error from getUser is checked rather than destructured past: an expired
 * or malformed token makes `data.user` undefined *and* sets `error`, and the
 * previous version read `data.user` straight through, which threw inside the
 * booking handler and surfaced as an unhandled 500 on what should simply have
 * been treated as a guest booking.
 */
export async function extractUserId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    // A bad token must degrade to "guest", never to a failed booking.
    return null;
  }
}

/**
 * Narrows `stylistIds` to those genuinely free for [time, time + durationMin).
 *
 * Returns `null` if a conflict query failed — a query we could not run is not
 * evidence of a free stylist, so the caller must fail closed with a retryable
 * error rather than risk a double-booking.
 *
 * The previous implementation compared only the *start* time of existing
 * appointments against the requested window, so an appointment already in
 * progress was invisible: booking 10:30 against an existing 10:00-11:30 job
 * returned that stylist as free. It also never consulted blocked_slots, so
 * vacation days were bookable. Both rules now live in isSlotFree, shared with
 * GET /api/availability.
 */
export async function findFreeStylists(
  stylistIds: string[],
  date: string,
  time: string,
  durationMin: number,
  /**
   * Appointment to ignore when looking for conflicts. Used by reschedule: an
   * appointment being moved within the same day would otherwise collide with
   * its own current booking and report the slot as taken.
   */
  excludeAppointmentId?: string,
): Promise<string[] | null> {
  if (!stylistIds.length) return [];

  let appointmentsQuery = supabaseAdmin
    .from('appointments')
    .select('stylist_id, appointment_time, duration_min')
    .in('stylist_id', stylistIds)
    .eq('appointment_date', date)
    .neq('status', 'cancelled');

  if (excludeAppointmentId) {
    appointmentsQuery = appointmentsQuery.neq('id', excludeAppointmentId);
  }

  const [appointments, blocked] = await Promise.all([
    appointmentsQuery,
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
    }),
  );
}

async function sendEmails(
  appointment: BookedAppointment,
  serviceName: string,
  stylistName: string,
) {
  await Promise.all([
    sendBookingConfirmationEmail(appointment, serviceName, stylistName).catch(async (e) => {
      console.error('[Email] Confirmation failed:', e);
      await captureError(e, {
        fingerprint: 'api:appointments:email:confirmation',
        tags: { endpoint: 'POST /api/appointments' },
        extra: { appointment_id: appointment.id },
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
