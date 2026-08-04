// Calendar-date helpers that work in the salon's wall-clock timezone.
//
// Vercel functions run with TZ=UTC. `new Date().toISOString().slice(0, 10)`
// therefore rolls over to the next day at 20:00 EDT / 19:00 EST, which is
// still business hours here. That off-by-one made the resend-email endpoint
// reject same-evening appointments as "in the past" and made the reminder
// cron read the wrong target day.

const FALLBACK_TIMEZONE = 'America/New_York';

function resolveTimezone(): string {
  const configured = process.env.SALON_TIMEZONE?.replace(/^['"]|['"]$/g, '').trim();
  if (!configured) return FALLBACK_TIMEZONE;
  try {
    // Throws RangeError on an unknown zone. Better to notice at cold start
    // than to silently emit UTC dates for every booking.
    new Intl.DateTimeFormat('en-CA', { timeZone: configured });
    return configured;
  } catch {
    console.warn(`[dates] Invalid SALON_TIMEZONE "${configured}" — falling back to ${FALLBACK_TIMEZONE}`);
    return FALLBACK_TIMEZONE;
  }
}

export const SALON_TIMEZONE = resolveTimezone();

// en-CA formats as YYYY-MM-DD, which is the shape the DATE columns use.
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALON_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date in the salon's timezone, as YYYY-MM-DD. */
export function salonToday(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

// hourCycle 'h23' rather than hour12:false — the latter renders midnight as
// "24:00" under some ICU builds, which would parse to 1440 minutes.
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SALON_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Current wall-clock time in the salon's timezone, as minutes since midnight.
 *
 * Pairs with salonToday(): together they answer "has this slot already
 * started?" Reading the clock in UTC instead would let a customer booking at
 * 19:15 EDT be told it is 23:15, which is past closing on the wrong day.
 */
export function salonNowMinutes(now: Date = new Date()): number {
  const [hours, minutes] = timeFormatter.format(now).split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Shifts a YYYY-MM-DD calendar date by whole days.
 *
 * Operates on the date parts via UTC so a DST transition inside the range
 * cannot add or drop an hour and flip the result to the wrong day.
 */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
