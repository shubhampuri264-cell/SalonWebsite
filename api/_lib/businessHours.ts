// Opening hours and the temporal rules for a bookable slot.
//
// This is the single source of truth for "is this date/time bookable at all",
// shared by the read path (GET /api/availability) and the write path
// (POST /api/appointments). Keeping the hours table in only one of the two is
// what let the write path accept 2020-01-01, 03:00, and a 180-minute service
// starting at 19:30 — the grid was never consulted, only a regex on the shape
// of the string.

import { SLOT_INTERVAL_MINUTES, toMinutes } from './timeSlots';
import { addDays } from './dates';

export interface OpeningHours {
  open: string;
  close: string;
}

export const BUSINESS_HOURS: Record<string, OpeningHours | null> = {
  Monday:    { open: '10:00', close: '20:00' },
  Tuesday:   { open: '10:00', close: '20:00' },
  Wednesday: { open: '10:00', close: '20:00' },
  Thursday:  { open: '10:00', close: '20:00' },
  Friday:    { open: '10:00', close: '20:00' },
  Saturday:  { open: '10:00', close: '20:00' },
  Sunday:    { open: '10:00', close: '20:00' },
};

/**
 * How far ahead a customer may book. Without an upper bound the endpoint
 * accepts 9999-12-31, which lands a row in the appointments table that no
 * admin view will ever scroll to and that the reminder cron will never reach.
 */
export const BOOKING_HORIZON_DAYS = 180;

/**
 * Minimum notice before an appointment starts, in minutes.
 *
 * 0 means "anything not already in the past is fine" — the salon takes
 * walk-in-adjacent same-hour bookings. Raise this if the owner wants lead
 * time; both the offered grid and the accepted bookings shift together
 * because both go through this module.
 */
export const MIN_LEAD_MINUTES = 0;

/**
 * Weekday name for a YYYY-MM-DD calendar date.
 *
 * Built at UTC noon and formatted in UTC: a calendar date has no timezone, so
 * resolving it through one only creates opportunities to land on the wrong
 * side of a DST boundary.
 */
export function dayOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

export function hoursForDate(dateStr: string): OpeningHours | null {
  return BUSINESS_HOURS[dayOfWeek(dateStr)] ?? null;
}

export type BookingWindowResult =
  | { ok: true }
  | { ok: false; code: BookingWindowErrorCode; message: string };

export type BookingWindowErrorCode =
  | 'DATE_IN_PAST'
  | 'DATE_TOO_FAR'
  | 'SALON_CLOSED'
  | 'TIME_OFF_GRID'
  | 'BEFORE_OPEN'
  | 'AFTER_CLOSE'
  | 'TIME_IN_PAST';

/**
 * Validates that [time, time + durationMin) on `date` is a slot the salon
 * could actually work.
 *
 * `today` and `nowMinutes` are passed in rather than read from the clock here
 * so the rule stays a pure function — the caller decides which clock it is
 * talking about, and a test can pin it.
 */
export function validateBookingWindow(input: {
  date: string;
  time: string;
  durationMin: number;
  today: string;
  nowMinutes: number;
}): BookingWindowResult {
  const { date, time, durationMin, today, nowMinutes } = input;

  if (date < today) {
    return { ok: false, code: 'DATE_IN_PAST', message: 'That date has already passed.' };
  }

  const horizon = addDays(today, BOOKING_HORIZON_DAYS);
  if (date > horizon) {
    return {
      ok: false,
      code: 'DATE_TOO_FAR',
      message: `Bookings open up to ${BOOKING_HORIZON_DAYS} days ahead. Please choose a date on or before ${horizon}.`,
    };
  }

  const hours = hoursForDate(date);
  if (!hours) {
    return { ok: false, code: 'SALON_CLOSED', message: 'The salon is closed on this day.' };
  }

  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const start = toMinutes(time);

  // The grid is anchored to opening time, not to midnight, so a 10:00 open with
  // 30-minute intervals offers 10:00/10:30/... and rejects 09:31 and 10:15.
  if ((start - open) % SLOT_INTERVAL_MINUTES !== 0) {
    return {
      ok: false,
      code: 'TIME_OFF_GRID',
      message: `Appointments start every ${SLOT_INTERVAL_MINUTES} minutes from ${hours.open}.`,
    };
  }

  if (start < open) {
    return { ok: false, code: 'BEFORE_OPEN', message: `The salon opens at ${hours.open}.` };
  }

  // The end of the service, not its start, has to fit inside opening hours —
  // otherwise a 180-minute service booked at 19:30 runs until 22:30.
  if (start + durationMin > close) {
    return {
      ok: false,
      code: 'AFTER_CLOSE',
      message: `That service takes ${durationMin} minutes and would run past closing at ${hours.close}.`,
    };
  }

  if (date === today && start < nowMinutes + MIN_LEAD_MINUTES) {
    return { ok: false, code: 'TIME_IN_PAST', message: 'That time has already passed today.' };
  }

  return { ok: true };
}
