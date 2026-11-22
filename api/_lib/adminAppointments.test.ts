import { describe, expect, it } from 'vitest';
import {
  hasStarted,
  listDateBounds,
  listQuerySchema,
  periodBounds,
  searchFilter,
  searchTermSchema,
  viewPlan,
} from './adminAppointments';
import { salonToday } from './dates';

// The dashboard numbers were once computed in the browser with the phone's
// clock and a "this week" that never ended. These pin the one shared function
// all week/month maths goes through.

describe('periodBounds: week is Monday to Sunday', () => {
  it('on a Sunday, the week is the six days before plus today', () => {
    // 2026-11-22 is a Sunday.
    expect(periodBounds('week', '2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });

  it('on a Monday, the week starts today', () => {
    expect(periodBounds('week', '2026-11-23')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });

  it('crosses a month boundary', () => {
    expect(periodBounds('week', '2026-11-30')).toEqual({ from: '2026-11-30', to: '2026-12-06' });
  });

  it('crosses the new year (Dec 28 -> Jan 3) from either side', () => {
    const expected = { from: '2026-12-28', to: '2027-01-03' };
    expect(periodBounds('week', '2026-12-28')).toEqual(expected);
    expect(periodBounds('week', '2026-12-31')).toEqual(expected);
    expect(periodBounds('week', '2027-01-01')).toEqual(expected);
    expect(periodBounds('week', '2027-01-03')).toEqual(expected);
  });

  it('the clock-change weekend does not shift the week (DST ends Sun 2026-11-01)', () => {
    const expected = { from: '2026-10-26', to: '2026-11-01' };
    expect(periodBounds('week', '2026-10-31')).toEqual(expected);
    expect(periodBounds('week', '2026-11-01')).toEqual(expected);
    expect(periodBounds('week', '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    // Spring forward, Sun 2026-03-08.
    expect(periodBounds('week', '2026-03-08')).toEqual({ from: '2026-03-02', to: '2026-03-08' });
  });
});

describe('periodBounds: month, today, tomorrow', () => {
  it('on the last day of a month, the month is still that month', () => {
    expect(periodBounds('month', '2026-11-30')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodBounds('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('February has 29 days in a leap year and 28 otherwise', () => {
    expect(periodBounds('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodBounds('month', '2027-02-10')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });

  it('tomorrow rolls over months, leap days and years', () => {
    expect(periodBounds('tomorrow', '2028-02-28')).toEqual({ from: '2028-02-29', to: '2028-02-29' });
    expect(periodBounds('tomorrow', '2028-02-29')).toEqual({ from: '2028-03-01', to: '2028-03-01' });
    expect(periodBounds('tomorrow', '2026-12-31')).toEqual({ from: '2027-01-01', to: '2027-01-01' });
  });

  it('today is a single day', () => {
    expect(periodBounds('today', '2026-11-22')).toEqual({ from: '2026-11-22', to: '2026-11-22' });
  });
});

describe('"today" is New York time, not the caller clock', () => {
  it('stays on the same day through the fall-back hour', () => {
    // 01:30 EDT, then 23:59 EST the same Sunday.
    expect(salonToday(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    expect(salonToday(new Date('2026-11-02T04:59:00Z'))).toBe('2026-11-01');
    expect(salonToday(new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
  });

  it('stays on the same day through the spring-forward hour', () => {
    expect(salonToday(new Date('2026-03-09T03:59:00Z'))).toBe('2026-03-08');
    expect(salonToday(new Date('2026-03-09T04:00:00Z'))).toBe('2026-03-09');
  });

  it('is still today in the evening, when UTC has already rolled over', () => {
    // 20:30 EST on Sun Nov 22 is 01:30 UTC Mon Nov 23.
    expect(salonToday(new Date('2026-11-23T01:30:00Z'))).toBe('2026-11-22');
  });
});

describe('viewPlan: bounds and sort order of each tab', () => {
  it('upcoming is today onward, soonest first', () => {
    expect(viewPlan('upcoming', '2026-11-22')).toEqual({ from: '2026-11-22', ascending: true });
  });

  it('past is before today, newest first', () => {
    expect(viewPlan('past', '2026-11-22')).toEqual({ before: '2026-11-22', ascending: false });
  });

  it('all is unbounded, newest first', () => {
    expect(viewPlan('all', '2026-11-22')).toEqual({ ascending: false });
  });
});

describe('listDateBounds', () => {
  const today = '2026-11-22';
  const bounds = (query: Record<string, string>) =>
    listDateBounds(listQuerySchema.parse(query), today);

  it('defaults to upcoming', () => {
    expect(bounds({})).toEqual({ gte: today, lte: undefined, lt: undefined, ascending: true });
  });

  it('upcoming + this month is today through month end', () => {
    expect(bounds({ range: 'month' })).toEqual({
      gte: today, lte: '2026-11-30', lt: undefined, ascending: true,
    });
  });

  it('past + this week is Monday up to (not including) today', () => {
    expect(bounds({ view: 'past', range: 'week' })).toEqual({
      gte: '2026-11-16', lte: '2026-11-22', lt: today, ascending: false,
    });
  });

  it('all + custom range uses the range as given', () => {
    expect(bounds({ view: 'all', from: '2026-01-01', to: '2026-01-31' })).toEqual({
      gte: '2026-01-01', lte: '2026-01-31', lt: undefined, ascending: false,
    });
  });

  it('upcoming + a custom start later than today keeps the later start', () => {
    expect(bounds({ from: '2026-12-01' }).gte).toBe('2026-12-01');
    expect(bounds({ from: '2026-10-01' }).gte).toBe(today);
  });
});

describe('hasStarted', () => {
  it('past dates have started, future dates have not', () => {
    expect(hasStarted('2026-11-21', '18:00', '2026-11-22', 600)).toBe(true);
    expect(hasStarted('2026-11-23', '09:30', '2026-11-22', 600)).toBe(false);
  });

  it('today compares the start time with the salon clock', () => {
    expect(hasStarted('2026-11-22', '09:30', '2026-11-22', 600)).toBe(true); // 10:00 now
    expect(hasStarted('2026-11-22', '10:00', '2026-11-22', 600)).toBe(true);
    expect(hasStarted('2026-11-22', '14:30', '2026-11-22', 600)).toBe(false);
  });
});

describe('search safety', () => {
  const parse = (q: string) => searchTermSchema.safeParse(q);

  it.each([
    ['comma (or() separator)', 'jane,client_email.neq.x'],
    ['double quote', 'jane"'],
    ['backslash', 'jane\\'],
    ['LIKE wildcard %', '%'],
    ['PostgREST wildcard *', 'ja*ne'],
    ['colon', 'a:b'],
    ['semicolon', "'; drop table appointments; --"],
    ['angle brackets', '<script>'],
    ['equals', 'status=eq.cancelled'],
    ['over the length limit', 'a'.repeat(65)],
    ['punctuation only (would match every booking)', '()'],
    ['a lone dot', '.'],
  ])('rejects %s', (_label, q) => {
    expect(parse(q).success).toBe(false);
  });

  it.each([
    ['a name', 'Jane Doe'],
    ['an accented name', 'José Ñúñez'],
    ['an apostrophe', "O'Brien"],
    ['an email', 'jane.doe+salon@example.com'],
    ['a formatted phone', '(718) 555-0101'],
  ])('accepts %s', (_label, q) => {
    expect(parse(q).success).toBe(true);
  });

  it('trims and collapses whitespace', () => {
    expect(searchTermSchema.parse('  Jane    Doe ')).toBe('Jane Doe');
  });

  it('quotes the term so filter syntax inside it stays a literal value', () => {
    // Letters, dots and underscores are allowed, so this passes validation --
    // it must come out as ONE quoted ilike value, not a second filter.
    const term = searchTermSchema.parse('client_name.neq.x');
    expect(searchFilter(term)).toBe(
      'client_name.ilike."%client\\\\_name.neq.x%",client_email.ilike."%client\\\\_name.neq.x%"',
    );
  });

  it('escapes LIKE wildcards so _ matches only an underscore', () => {
    expect(searchFilter('a_b')).toContain('"%a\\\\_b%"');
  });

  it('a phone search ignores dashes, spaces and brackets', () => {
    const filter = searchFilter('(718) 555-0101');
    expect(filter).toContain(
      'client_phone.match."7[^0-9]*1[^0-9]*8[^0-9]*5[^0-9]*5[^0-9]*5[^0-9]*0[^0-9]*1[^0-9]*0[^0-9]*1"',
    );
    const phonePart = (q: string) =>
      searchFilter(q)?.split(',').find((part) => part.startsWith('client_phone'));
    expect(phonePart('718-555')).toBe('client_phone.match."7[^0-9]*1[^0-9]*8[^0-9]*5[^0-9]*5[^0-9]*5"');
    expect(phonePart('718 555')).toBe(phonePart('718-555'));
    expect(phonePart('(718)555')).toBe(phonePart('718-555'));
    expect(phonePart('718.555')).toBe(phonePart('718-555'));
  });

  it('a name search does not also match phones', () => {
    expect(searchFilter('jane')).not.toContain('client_phone');
    // Mixed letters and digits is not a phone number.
    expect(searchFilter('jane718')).not.toContain('client_phone');
  });

  it('too few digits is not a phone search', () => {
    expect(searchFilter('71')).not.toContain('client_phone');
  });

  it('nothing searchable yields no filter', () => {
    expect(searchFilter('()')).toBeNull();
  });
});

describe('listQuerySchema', () => {
  it.each([
    ['an unknown view', { view: 'future' }],
    ['an unknown status', { status: 'deleted' }],
    ['an impossible date', { from: '2026-02-30' }],
    ['a malformed date', { from: '11/22/2026' }],
    ['from after to', { from: '2026-12-01', to: '2026-11-01' }],
    ['range together with from/to', { range: 'week', from: '2026-11-01' }],
    ['a non-uuid stylist', { stylist_id: '1 or 1=1' }],
    ['a negative offset', { offset: '-50' }],
    ['a repeated parameter', { view: ['upcoming', 'past'] }],
    ['an unknown parameter', { select: '*' }],
  ])('rejects %s', (_label, query) => {
    expect(listQuerySchema.safeParse(query).success).toBe(false);
  });

  it('treats empty parameters as absent', () => {
    expect(listQuerySchema.parse({ q: '', status: '', view: '' })).toEqual({});
  });
});
