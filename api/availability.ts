import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from './_lib/supabase';
import { generateAvailableSlots } from './_lib/timeSlots';
import { captureError } from './_lib/sentry';
import { salonToday, salonNowMinutes, addDays } from './_lib/dates';
import { stylistPerformsService } from './_lib/eligibility';
import { hoursForDate, BOOKING_HORIZON_DAYS, MIN_LEAD_MINUTES } from './_lib/businessHours';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  service_id: z.string().uuid('Invalid service_id'),
  // Required. This endpoint used to accept 'anyone' (or nothing) and union the
  // slots of the entire roster, which advertised the threading specialist's
  // free time for a balayage and then let the booking land on her at random.
  // A slot grid is only meaningful for one named stylist.
  stylist_id: z.string().uuid('Invalid stylist_id'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
  }
  const { date, service_id, stylist_id } = parsed.data;

  // Temporal gates mirror validateBookingWindow in _lib/businessHours, so the
  // grid never advertises a slot POST /api/appointments would reject.
  const today = salonToday();
  if (date < today) {
    return res.json({ slots: [], message: 'That date has already passed' });
  }
  if (date > addDays(today, BOOKING_HORIZON_DAYS)) {
    return res.json({
      slots: [],
      message: `Bookings open up to ${BOOKING_HORIZON_DAYS} days ahead`,
    });
  }

  const hours = hoursForDate(date);
  if (!hours) return res.json({ slots: [], message: 'Salon is closed on this day' });

  // Slots that have already started today are not offerable. Undefined for any
  // future date, where the whole grid from opening time is still live.
  const minStartMinutes = date === today ? salonNowMinutes() + MIN_LEAD_MINUTES : undefined;

  const { data: service } = await supabaseAdmin
    .from('services')
    .select('duration_min')
    .eq('id', service_id)
    .single();

  if (!service) return res.status(404).json({ error: 'Service not found' });

  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('id')
    .eq('id', stylist_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!stylist) return res.status(404).json({ error: 'Stylist not found' });

  // Checked here as well as at booking time so the grid never shows times for a
  // pairing POST /api/appointments would refuse. See migration 018.
  const performs = await stylistPerformsService(stylist.id, service_id);
  if (performs === null) {
    return res.status(503).json({ error: 'Could not load availability. Please try again.' });
  }
  if (!performs) {
    return res.status(400).json({
      error: 'That stylist does not offer this service',
      code: 'STYLIST_SERVICE_MISMATCH',
    });
  }

  const slots = await getSlotsForStylist(stylist.id, date, hours, service.duration_min, minStartMinutes);
  // A query we could not run is not evidence of a free stylist. Failing open
  // here published the full 10:00-20:00 grid during a DB outage and sent every
  // one of those customers into a terminal 409 at booking time.
  if (slots === null) {
    return res.status(503).json({ error: 'Could not load availability. Please try again.' });
  }
  return res.json({ slots: slots.map((time) => ({ time })) });
}

/** Returns null when a conflict query failed — the caller must fail closed. */
async function getSlotsForStylist(
  stylistId: string,
  date: string,
  hours: { open: string; close: string },
  durationMin: number,
  minStartMinutes: number | undefined
): Promise<string[] | null> {
  const [appointments, blocked] = await Promise.all([
    supabaseAdmin
      .from('appointments')
      .select('appointment_time, duration_min')
      .eq('stylist_id', stylistId)
      .eq('appointment_date', date)
      .neq('status', 'cancelled'),
    supabaseAdmin
      .from('blocked_slots')
      .select('start_time, end_time')
      .eq('stylist_id', stylistId)
      .eq('blocked_date', date),
  ]);

  const queryError = appointments.error ?? blocked.error;
  if (queryError) {
    await captureError(queryError, {
      fingerprint: 'api:availability:conflict-query',
      tags: { endpoint: 'GET /api/availability' },
      extra: { stylistId, date, durationMin },
    });
    return null;
  }

  return generateAvailableSlots({
    openTime: hours.open,
    closeTime: hours.close,
    slotDuration: durationMin,
    existingAppointments: appointments.data ?? [],
    blockedSlots: blocked.data ?? [],
    minStartMinutes,
  });
}
