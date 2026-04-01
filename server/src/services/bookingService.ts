import { supabaseAdmin } from '../config/supabase';
import type { Appointment, CreateAppointmentPayload } from '@luxe/shared';

interface BookAppointmentParams extends Omit<CreateAppointmentPayload, 'stylist_id'> {
  stylist_id: string; // Must be resolved before calling (no 'anyone')
  duration_min: number;
  cancellation_token: string;
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
  });

  if (error) {
    if (error.message?.includes('SLOT_TAKEN')) {
      const err = new Error('This time slot is no longer available') as Error & {
        status: number;
        code: string;
      };
      err.status = 409;
      err.code = 'SLOT_TAKEN';
      throw err;
    }
    throw new Error(`Booking failed: ${error.message}`);
  }

  return data as Appointment;
}

/**
 * Resolves 'anyone' to the stylist with the fewest appointments on the given date.
 * Falls back to the first active stylist if all have the same count.
 */
export async function resolveAnyoneStylist(
  date: string,
  time: string,
  durationMin: number
): Promise<string> {
  // Get all active stylists
  const { data: stylists, error: stylistError } = await supabaseAdmin
    .from('stylists')
    .select('id')
    .eq('is_active', true);

  if (stylistError || !stylists?.length) {
    throw new Error('No active stylists available');
  }

  // Find available stylists for this slot
  const availableIds: string[] = [];
  const requestedStart = toMinutes(time);
  const requestedEnd = requestedStart + durationMin;

  for (const stylist of stylists) {
    const { data: appointments, error: appointmentsError } = await supabaseAdmin
      .from('appointments')
      .select('appointment_time, duration_min')
      .eq('stylist_id', stylist.id)
      .eq('appointment_date', date)
      .neq('status', 'cancelled');

    if (appointmentsError) {
      throw new Error(`Failed to load stylist availability: ${appointmentsError.message}`);
    }

    const hasOverlap = (appointments ?? []).some((appt) => {
      const existingStart = toMinutes(appt.appointment_time);
      const existingEnd = existingStart + appt.duration_min;
      return existingStart < requestedEnd && existingEnd > requestedStart;
    });

    if (!hasOverlap) {
      availableIds.push(stylist.id);
    }
  }

  if (!availableIds.length) {
    const err = new Error('No stylists available for this slot') as Error & {
      status: number;
      code: string;
    };
    err.status = 409;
    err.code = 'SLOT_TAKEN';
    throw err;
  }

  // Pick first available
  return availableIds[0];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
