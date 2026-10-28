// Stylist days off and time off, as Iris offers them.
//
// The booking API refuses a stylist's day off either way; what is pinned here is
// that Iris never puts one on a chip, because a chip that always fails is worse
// than no chip.

import { assert, assertEquals } from '@std/assert';
import {
  dayOfWeek,
  formatDaysOff,
  formatTimeOffSpan,
  isFullDayBlock,
  nextBookableDates,
  timeOffRanges,
} from './dates.ts';

const TODAY = '2026-10-24'; // a Saturday
const FRIDAYS = { days_off: ['Friday'], time_off: [] };

// Migration 021: away Saturday 31 October to Wednesday 4 November.
const AWAY = timeOffRanges(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], ['Friday']);

Deno.test('a stylist off on Fridays is never offered a Friday', () => {
  const dates = nextBookableDates(6, FRIDAYS, TODAY);
  assertEquals(dates.length, 6);
  assert(dates.every((d) => dayOfWeek(d) !== 'Friday'), dates.join(', '));
  // Sat 24 to Thu 29, then the Friday is skipped and Saturday follows.
  assertEquals(nextBookableDates(7, FRIDAYS, TODAY).at(-1), '2026-10-31');
});

Deno.test('a stylist with no days off is offered every day', () => {
  assertEquals(nextBookableDates(7, undefined, TODAY), [
    '2026-10-24',
    '2026-10-25',
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
  ]);
});

Deno.test('days off read as a sentence', () => {
  assertEquals(formatDaysOff(['Friday']), 'Fridays');
  assertEquals(formatDaysOff(['Monday', 'Friday']), 'Mondays and Fridays');
  assertEquals(formatDaysOff(['Monday', 'Tuesday', 'Friday']), 'Mondays, Tuesdays and Fridays');
});

Deno.test('time off is never offered, and the day back is', () => {
  assertEquals(AWAY, [{ start: '2026-10-31', end: '2026-11-04', back: '2026-11-05' }]);
  // Wed 28 and Thu 29, then Friday off, the time off, and Thursday 5 November.
  assertEquals(nextBookableDates(3, { days_off: ['Friday'], time_off: AWAY }, '2026-10-28'), [
    '2026-10-28',
    '2026-10-29',
    '2026-11-05',
  ]);
});

Deno.test('only a block covering opening hours counts as time off', () => {
  assert(isFullDayBlock({ blocked_date: '2026-11-01', start_time: '10:00:00', end_time: '19:30:00' }));
  assert(!isFullDayBlock({ blocked_date: '2026-11-02', start_time: '10:00:00', end_time: '14:00:00' }));
});

Deno.test('time off reads as the approved wording', () => {
  assertEquals(formatTimeOffSpan(AWAY[0]), 'from Saturday, October 31 to Wednesday, November 4');
});
