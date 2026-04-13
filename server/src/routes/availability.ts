import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { generateAvailableSlots } from '../utils/timeSlots';
import { BUSINESS_HOURS } from '@luxe/shared';

export const availabilityRouter = Router();

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  service_id: z.string().uuid('Invalid service_id'),
  stylist_id: z.string().optional(),
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

    // Determine which stylists to check
    let stylistIds: string[];

    if (stylist_id && stylist_id !== 'anyone') {
      stylistIds = [stylist_id];
    } else {
      const { data: stylists, error: stylistError } = await supabaseAdmin
        .from('stylists')
        .select('id')
        .eq('is_active', true);

      if (stylistError || !stylists) {
        throw stylistError ?? new Error('Failed to fetch stylists');
      }
      stylistIds = stylists.map((s) => s.id);
    }

    // For "anyone" mode, collect per-stylist availability and return union
    if (!stylist_id || stylist_id === 'anyone') {
      const slotMap = new Map<string, string[]>(); // time -> stylist IDs

      for (const sid of stylistIds) {
        const slots = await getSlotsForStylist(
          sid,
          date,
          hours,
          service.duration_min
        );
        for (const slot of slots) {
          const existing = slotMap.get(slot) ?? [];
          existing.push(sid);
          slotMap.set(slot, existing);
        }
      }

      const result = Array.from(slotMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, availableStylistIds]) => ({ time, availableStylistIds }));

      res.json({ slots: result });
    } else {
      const slots = await getSlotsForStylist(
        stylistIds[0],
        date,
        hours,
        service.duration_min
      );
      res.json({ slots: slots.map((time) => ({ time, availableStylistIds: [stylistIds[0]] })) });
    }
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
