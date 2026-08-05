// Salon-timezone date helpers.
//
// A port of the parts of api/_lib/dates.ts and api/_lib/businessHours.ts that
// Iris needs. Kept minimal on purpose — the AUTHORITATIVE booking-window rules
// live on the Vercel side in validateBookingWindow(), and Vercel rejects
// anything these helpers get wrong. What is here is only enough to offer
// sensible dates and to label them.

export const SALON_TIMEZONE = Deno.env.get('SALON_TIMEZONE') ?? 'America/New_York';

export const BOOKING_HORIZON_DAYS = 180;

export const BUSINESS_HOURS: Record<string, { open: string; close: string } | null> = {
  Monday: { open: '10:00', close: '20:00' },
  Tuesday: { open: '10:00', close: '20:00' },
  Wednesday: { open: '10:00', close: '20:00' },
  Thursday: { open: '10:00', close: '20:00' },
  Friday: { open: '10:00', close: '20:00' },
  Saturday: { open: '10:00', close: '20:00' },
  Sunday: { open: '10:00', close: '20:00' },
};

// en-CA's short date format IS ISO 8601, so no reassembly or zero-padding.
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALON_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// hourCycle 'h23' rather than hour12:false — the latter renders midnight as
// "24:00" under some ICU builds, which would parse to 1440 minutes.
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SALON_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function salonToday(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

export function salonNow(now: Date = new Date()): string {
  return timeFormatter.format(now);
}

/**
 * Adds days to a YYYY-MM-DD string.
 *
 * Built at UTC noon and read back in UTC: a calendar date carries no timezone,
 * so putting one through a timezone only creates chances to land on the wrong
 * side of a DST boundary.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function dayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

export function hoursForDate(dateStr: string): { open: string; close: string } | null {
  return BUSINESS_HOURS[dayOfWeek(dateStr)] ?? null;
}

/** "Thursday, 6 August" — no year, because everything offered is within 180 days. */
export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Thu 6 Aug" — for chips, where space is tight. */
export function formatDateChip(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "2:30 PM" from "14:30". */
export function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/** True when the date is within the bookable horizon and not in the past. */
export function isBookableDate(dateStr: string, today: string = salonToday()): boolean {
  if (dateStr < today) return false;
  if (dateStr > addDays(today, BOOKING_HORIZON_DAYS)) return false;
  return hoursForDate(dateStr) !== null;
}

/** The next `count` bookable dates from `today` inclusive. */
export function nextBookableDates(count: number, today: string = salonToday()): string[] {
  const dates: string[] = [];
  let cursor = today;
  for (let i = 0; i < count * 3 && dates.length < count; i++) {
    if (isBookableDate(cursor, today)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}
