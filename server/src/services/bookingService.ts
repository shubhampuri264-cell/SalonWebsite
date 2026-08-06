import { supabaseAdmin } from '../config/supabase';
import type { Appointment, CreateAppointmentPayload } from '@luxe/shared';

interface BookAppointmentParams extends Omit<CreateAppointmentPayload, 'stylist_id'> {
  stylist_id: string; // Must be resolved before calling (no 'anyone')
  duration_min: number;
  cancellation_token: string;
  user_id?: string | null;
}

/**
 * Atomically creates an appointment using a PostgreSQL RPC.
 * The RPC checks for overlapping appointments and raises an exception if the slot is taken,
 * preventing double-booking even under concurrent requests.
 *
 * Returns the created appointment or throws with code 'SLOT_TAKEN'.
 */
export async function createBooking(
  params: BookAppointmentParams
): Promise<Appointment> {
  // The RPC only knows about appointment overlap. Owner-set blocked slots
  // (vacation, breaks) are enforced here so every caller is covered, whether
  // the stylist was chosen explicitly or resolved from 'anyone'.
  await assertNotBlocked(
    params.stylist_id,
    params.appointment_date,
    params.appointment_time,
    params.duration_min
  );

  const { data, error } = await supabaseAdmin.rpc('book_appointment', {
    p_stylist_id: params.stylist_id,
    p_service_id: params.service_id,
    p_client_name: params.client_name,
    p_client_email: params.client_email,
    p_client_phone: params.client_phone,
    p_appointment_date: params.appointment_date,
    p_appointment_time: params.appointment_time,
    p_duration_min: params.duration_min,
    p_notes: params.notes ?? null,
    p_cancellation_token: params.cancellation_token,
    p_user_id: params.user_id ?? null,
  });

  if (error) {
    if (error.message?.includes('SLOT_TAKEN') || error.message?.includes('SLOT_BLOCKED')) {
      throw slotTakenError('This time slot is no longer available');
    }
    throw new Error(`Booking failed: ${error.message}`);
  }

  return data as Appointment;
}

function slotTakenError(message: string): Error & { status: number; code: string } {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = 409;
  err.code = 'SLOT_TAKEN';
  return err;
}

/**
 * Throws a 409 if the requested window overlaps a blocked_slots row for this
 * stylist. Fails closed: a query error is treated as "cannot confirm free".
 */
async function assertNotBlocked(
  stylistId: string,
  date: string,
  time: string,
  durationMin: number
): Promise<void> {
  const { data: blocked, error } = await supabaseAdmin
    .from('blocked_slots')
    .select('start_time, end_time')
    .eq('stylist_id', stylistId)
    .eq('blocked_date', date);

  if (error) {
    throw new Error(`Failed to check blocked slots: ${error.message}`);
  }

  const requestedStart = toMinutes(time);
  const requestedEnd = requestedStart + durationMin;

  const isBlocked = (blocked ?? []).some(
    (slot) => toMinutes(slot.start_time) < requestedEnd && toMinutes(slot.end_time) > requestedStart
  );

  if (isBlocked) {
    throw slotTakenError('This time slot is no longer available');
  }
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
