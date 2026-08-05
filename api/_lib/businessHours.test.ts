import { afterEach, describe, expect, it } from 'vitest';
import {
  BOOKING_HORIZON_DAYS,
  BUSINESS_HOURS,
  dayOfWeek,
  hoursForDate,
  validateBookingWindow,
} from './businessHours';
import { addDays } from './dates';

// validateBookingWindow is the single gate both the read path
// (GET /api/availability) and the write path (POST /api/appointments) run
// through, so every one of its rejection codes is a rule the salon actually
// relies on. It is a pure function — `today` and `nowMinutes` are injected —
// which is exactly why it is worth pinning here.

const TODAY = '2026-08-04'; // a Tuesday
const NOON = 12 * 60;

/** A valid booking, used as the baseline that each case perturbs one field of. */
function baseline(overrides: Partial<Parameters<typeof validateBookingWindow>[0]> = {}) {
  return validateBookingWindow({
    date: '2026-08-06', // Thursday, comfortably inside the horizon
    time: '14:00',
    durationMin: 60,
    today: TODAY,
    nowMinutes: NOON,
    ...overrides,
  });
}

describe('dayOfWeek', () => {
  // Built at UTC noon precisely so a timezone offset can never shift the
  // calendar date across a day boundary.
  it.each([
    ['2026-08-04', 'Tuesday'],
    ['2026-08-06', 'Thursday'],
    ['2026-08-09', 'Sunday'],
    ['2026-08-10', 'Monday'],
  ])('%s is a %s', (date, expected) => {
    expect(dayOfWeek(date)).toBe(expected);
  });
});

describe('hoursForDate', () => {
  it('returns hours for every day — the salon currently opens 7 days a week', () => {
    for (const date of ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']) {
      expect(hoursForDate(date), date).toEqual({ open: '10:00', close: '20:00' });
    }
  });
});

describe('validateBookingWindow', () => {
  it('accepts a slot inside opening hours, on the grid, in the future', () => {
    expect(baseline()).toEqual({ ok: true });
  });

  it('accepts a booking later today', () => {
    // 14:00 today, with "now" at noon — same-day booking is allowed because
    // MIN_LEAD_MINUTES is 0.
    expect(baseline({ date: TODAY })).toEqual({ ok: true });
  });

  it('rejects a date in the past', () => {
    expect(baseline({ date: '2026-08-03' })).toMatchObject({ ok: false, code: 'DATE_IN_PAST' });
  });

  it('accepts the last day of the booking horizon', () => {
    expect(baseline({ date: addDays(TODAY, BOOKING_HORIZON_DAYS) })).toEqual({ ok: true });
  });

  it('rejects one day beyond the booking horizon', () => {
    expect(baseline({ date: addDays(TODAY, BOOKING_HORIZON_DAYS + 1) })).toMatchObject({
      ok: false,
      code: 'DATE_TOO_FAR',
    });
  });

  it('rejects a time off the 30-minute grid', () => {
    expect(baseline({ time: '14:15' })).toMatchObject({ ok: false, code: 'TIME_OFF_GRID' });
  });

  it('rejects an on-grid time before opening', () => {
    // 09:30 is deliberate: it sits ON the grid anchored to 10:00, so it gets
    // past the grid check and reaches BEFORE_OPEN. An off-grid early time like
    // 09:31 would be rejected as TIME_OFF_GRID first and never exercise this.
    expect(baseline({ time: '09:30' })).toMatchObject({ ok: false, code: 'BEFORE_OPEN' });
  });

  it('rejects a service whose END runs past closing', () => {
    // Starts inside hours; only the duration pushes it over. This is the case
    // a start-time-only check would wrongly accept.
    expect(baseline({ time: '19:30', durationMin: 180 })).toMatchObject({
      ok: false,
      code: 'AFTER_CLOSE',
    });
  });

  it('accepts a service that ends exactly at closing', () => {
    expect(baseline({ time: '19:00', durationMin: 60 })).toEqual({ ok: true });
  });

  it('rejects a time that has already passed today', () => {
    expect(baseline({ date: TODAY, time: '10:00', nowMinutes: NOON })).toMatchObject({
      ok: false,
      code: 'TIME_IN_PAST',
    });
  });

  it('does not apply the past-time rule to a future date', () => {
    // Same clock time as the case above, but tomorrow — must be accepted.
    expect(baseline({ date: '2026-08-05', time: '10:00', nowMinutes: NOON })).toEqual({ ok: true });
  });

  describe('when a day is marked closed', () => {
    // SALON_CLOSED is currently unreachable through the live table (all seven
    // days are open), so the branch is exercised by closing a day here. If the
    // owner ever closes Sundays, this is the behaviour they get.
    const saved = BUSINESS_HOURS.Sunday;
    afterEach(() => {
      BUSINESS_HOURS.Sunday = saved;
    });

    it('rejects the booking', () => {
      BUSINESS_HOURS.Sunday = null;
      expect(baseline({ date: '2026-08-09' })).toMatchObject({ ok: false, code: 'SALON_CLOSED' });
    });
  });
});
