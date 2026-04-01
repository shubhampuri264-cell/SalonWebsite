import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './lib/supabase';
import { generateAvailableSlots } from './lib/timeSlots';

const BUSINESS_HOURS: Record<string, { open: string; close: string } | null> = {
  Monday:    { open: '09:00', close: '19:00' },
  Tuesday:   { open: '09:00', close: '19:00' },
  Wednesday: { open: '09:00', close: '19:00' },
  Thursday:  { open: '09:00', close: '19:00' },
  Friday:    { open: '09:00', close: '19:00' },
  Saturday:  { open: '09:00', close: '18:00' },
  Sunday:    null,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { date, service_id, stylist_id } = req.query as Record<string, string>;

  if (!date || !service_id) {
    return res.status(400).json({ error: 'Missing date or service_id' });
  }

  const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: process.env.SALON_TIMEZONE ?? 'America/New_York',
  });

  const hours = BUSINESS_HOURS[dayOfWeek];
  if (!hours) return res.json({ slots: [], message: 'Salon is closed on this day' });

  const { data: service } = await supabaseAdmin
    .from('services')
    .select('duration_min')
    .eq('id', service_id)
    .single();

  if (!service) return res.status(404).json({ error: 'Service not found' });

  let stylistIds: string[];

  if (stylist_id && stylist_id !== 'anyone') {
    stylistIds = [stylist_id];
  } else {
    const { data: stylists } = await supabaseAdmin
      .from('stylists')
      .select('id')
      .eq('is_active', true);
    stylistIds = (stylists ?? []).map((s) => s.id);
  }

  if (!stylist_id || stylist_id === 'anyone') {
    const slotMap = new Map<string, string[]>();

    for (const sid of stylistIds) {
      const slots = await getSlotsForStylist(sid, date, hours, service.duration_min);
      for (const slot of slots) {
        const existing = slotMap.get(slot) ?? [];
        existing.push(sid);
        slotMap.set(slot, existing);
      }
    }

    const result = Array.from(slotMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, availableStylistIds]) => ({ time, availableStylistIds }));

    return res.json({ slots: result });
  } else {
    const slots = await getSlotsForStylist(stylistIds[0], date, hours, service.duration_min);
    return res.json({ slots: slots.map((time) => ({ time, availableStylistIds: [stylistIds[0]] })) });
  }
}

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
