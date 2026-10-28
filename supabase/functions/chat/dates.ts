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
  Monday: { open: '10:00', close: '19:30' },
  Tuesday: { open: '10:00', close: '19:30' },
  Wednesday: { open: '10:00', close: '19:30' },
  Thursday: { open: '10:00', close: '19:30' },
  Friday: { open: '10:00', close: '19:30' },
  Saturday: { open: '10:00', close: '19:30' },
  Sunday: { open: '10:00', close: '18:00' },
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

/**
 * A run of consecutive days a stylist is away (start and end inclusive), and
 * `back`, the first later day they can be booked. Same shape as the website's.
 */
export interface TimeOff {
  start: string;
  end: string;
  back: string;
}

/** The parts of a stylist that decide which days they work. CatalogStylist has both. */
export interface StylistSchedule {
  /** Weekly days off (stylists.days_off, migration 020). */
  days_off: readonly string[];
  /** Upcoming days away (full-day blocked_slots rows, migration 021). */
  time_off: readonly TimeOff[];
}

/**
 * True when a blocked_slots row covers its day's full opening hours, which makes
 * the day time off rather than a busy stretch. Port of api/_lib/businessHours.ts.
 * Postgres sends 'HH:MM:SS'; zero-padded 'HH:MM' strings compare correctly as text.
 */
export function isFullDayBlock(block: { blocked_date: string; start_time: string; end_time: string }): boolean {
  const hours = hoursForDate(block.blocked_date);
  return hours !== null &&
    block.start_time.slice(0, 5) <= hours.open &&
    block.end_time.slice(0, 5) >= hours.close;
}

/**
 * Groups a stylist's away dates into runs of consecutive days, with the first
 * day back after each. Port of api/_lib/businessHours.ts.
 */
export function timeOffRanges(awayDates: readonly string[], daysOff: readonly string[]): TimeOff[] {
  const away = new Set(awayDates);
  const runs: { start: string; end: string }[] = [];
  for (const date of [...away].sort()) {
    const last = runs.at(-1);
    if (last && addDays(last.end, 1) === date) last.end = date;
    else runs.push({ start: date, end: date });
  }

  const unavailable = (date: string) =>
    away.has(date) || daysOff.includes(dayOfWeek(date)) || hoursForDate(date) === null;
  return runs.map((run) => {
    let back = addDays(run.end, 1);
    // Bounded: a stylist off all seven days would otherwise never come back.
    for (let i = 0; i < BOOKING_HORIZON_DAYS && unavailable(back); i++) back = addDays(back, 1);
    return { ...run, back };
  });
}

/** The time-off run `dateStr` falls in, if any. */
export function timeOffOn(timeOff: readonly TimeOff[], dateStr: string): TimeOff | undefined {
  return timeOff.find((range) => range.start <= dateStr && dateStr <= range.end);
}

/**
 * The next `count` bookable dates from `today` inclusive, skipping the
 * stylist's weekly days off and time off.
 */
export function nextBookableDates(
  count: number,
  stylist?: StylistSchedule,
  today: string = salonToday(),
): string[] {
  const dates: string[] = [];
  let cursor = today;
  // isBookableDate turns false past the horizon, so this cannot run away.
  for (let i = 0; i <= BOOKING_HORIZON_DAYS && dates.length < count; i++) {
    const off = stylist !== undefined &&
      (stylist.days_off.includes(dayOfWeek(cursor)) || timeOffOn(stylist.time_off, cursor) !== undefined);
    if (isBookableDate(cursor, today) && !off) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** "from Saturday, October 31 to Wednesday, November 4", or "on Saturday, October 31". Same as the website's. */
export function formatTimeOffSpan(range: TimeOff): string {
  return range.start === range.end
    ? `on ${formatDateLabel(range.start)}`
    : `from ${formatDateLabel(range.start)} to ${formatDateLabel(range.end)}`;
}

/** ['Friday'] -> "Fridays"; ['Monday', 'Friday'] -> "Mondays and Fridays". Same as the website's. */
export function formatDaysOff(daysOff: readonly string[]): string {
  const plural = daysOff.map((day) => `${day}s`);
  return plural.length > 1
    ? `${plural.slice(0, -1).join(', ')} and ${plural[plural.length - 1]}`
    : plural.join('');
}
