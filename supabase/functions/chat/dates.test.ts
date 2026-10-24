// Stylist days off, as Iris offers them.
//
// The booking API refuses a stylist's day off either way; what is pinned here is
// that Iris never puts one on a chip, because a chip that always fails is worse
// than no chip.

import { assert, assertEquals } from '@std/assert';
import { dayOfWeek, formatDaysOff, nextBookableDates } from './dates.ts';

const TODAY = '2026-10-24'; // a Saturday

Deno.test('a stylist off on Fridays is never offered a Friday', () => {
  const dates = nextBookableDates(6, ['Friday'], TODAY);
  assertEquals(dates.length, 6);
  assert(dates.every((d) => dayOfWeek(d) !== 'Friday'), dates.join(', '));
  // Sat 24 to Thu 29, then the Friday is skipped and Saturday follows.
  assertEquals(nextBookableDates(7, ['Friday'], TODAY).at(-1), '2026-10-31');
});

Deno.test('a stylist with no days off is offered every day', () => {
  assertEquals(nextBookableDates(7, [], TODAY), [
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
