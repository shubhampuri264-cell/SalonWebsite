import { supabaseAdmin } from './supabase';
import { captureError } from './sentry';
import { salonToday, addDays } from './dates';
import { BOOKING_HORIZON_DAYS, isFullDayBlock, timeOffRanges, type TimeOff } from './businessHours';

/**
 * Each stylist's upcoming time off, keyed by stylist id: the days within the
 * booking horizon that a blocked_slots row covers from opening to closing
 * (migration 021).
 *
 * Booking itself never relies on this. Blocked rows are already refused by
 * isSlotFree and the book_appointment RPC; this only lets the calendar grey the
 * days out and say why. Returns null when the query failed.
 */
export async function fetchTimeOff(
  stylists: { id: string; days_off: string[] }[],
): Promise<Map<string, TimeOff[]> | null> {
  const today = salonToday();
  const { data, error } = await supabaseAdmin
    .from('blocked_slots')
    .select('stylist_id, blocked_date, start_time, end_time')
    .in('stylist_id', stylists.map((s) => s.id))
    .gte('blocked_date', today)
    .lte('blocked_date', addDays(today, BOOKING_HORIZON_DAYS));

  if (error) {
    await captureError(error, {
      fingerprint: 'api:time-off:lookup',
      tags: { endpoint: 'blocked_slots' },
      extra: { stylistIds: stylists.map((s) => s.id) },
    });
    return null;
  }

  const fullDays = (data ?? []).filter(isFullDayBlock);
  return new Map(
    stylists.map((s) => [
      s.id,
      timeOffRanges(
        fullDays.filter((b) => b.stylist_id === s.id).map((b) => b.blocked_date),
        s.days_off,
      ),
    ]),
  );
}
