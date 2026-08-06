import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { generateAvailableSlots } from '../utils/timeSlots';
import { BUSINESS_HOURS } from '@luxe/shared';

export const availabilityRouter = Router();

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  service_id: z.string().uuid('Invalid service_id'),
  // Required, and a real stylist. A slot grid is only meaningful for one named
  // person — see migration 018.
  stylist_id: z.string().uuid('Invalid stylist_id'),
});

availabilityRouter.get('/', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
      return;
    }

    const { date, service_id, stylist_id } = parsed.data;

    // Check if salon is open on the requested day
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: process.env.SALON_TIMEZONE ?? 'America/New_York',
    });

    const hours = BUSINESS_HOURS[dayOfWeek];
    if (!hours) {
      res.json({ slots: [], message: 'Salon is closed on this day' });
      return;
    }

    // Fetch the service duration
    const { data: service, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('duration_min')
      .eq('id', service_id)
      .single();

    if (serviceError || !service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const { data: stylist } = await supabaseAdmin
      .from('stylists')
      .select('id')
      .eq('id', stylist_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!stylist) {
      res.status(404).json({ error: 'Stylist not found' });
      return;
    }

    // Never advertise times for a pairing the booking endpoint would refuse.
    const { data: pairing, error: pairingError } = await supabaseAdmin
      .from('stylist_services')
      .select('stylist_id')
      .eq('stylist_id', stylist.id)
      .eq('service_id', service_id)
      .maybeSingle();

    if (pairingError) {
      res.status(503).json({ error: 'Could not load availability. Please try again.' });
      return;
    }
    if (!pairing) {
      res.status(400).json({
        error: 'That stylist does not offer this service',
        code: 'STYLIST_SERVICE_MISMATCH',
      });
      return;
    }

    const slots = await getSlotsForStylist(stylist.id, date, hours, service.duration_min);
    res.json({ slots: slots.map((time) => ({ time })) });
  } catch (err) {
    next(err);
  }
});

async function getSlotsForStylist(
  stylistId: string,
  date: string,
  hours: { open: string; close: string },
  durationMin: number
): Promise<string[]> {
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

  return generateAvailableSlots({
    openTime: hours.open,
    closeTime: hours.close,
    slotDuration: durationMin,
    existingAppointments: appointments.data ?? [],
    blockedSlots: blocked.data ?? [],
  });
}
