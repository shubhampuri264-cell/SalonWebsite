import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { salonToday, toDateStr } from './dates';

// Kathmandu is UTC+5:45, so local midnight is still the previous day in UTC.
// That offset is what made toISOString() select the wrong day in the booking
// calendar for visitors ahead of UTC.
describe('toDateStr (visitor in Asia/Kathmandu)', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Asia/Kathmandu';
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('returns the local calendar day, not the UTC one', () => {
    const clicked = new Date(2026, 9, 15); // local midnight, Oct 15
    // Guards against a vacuous pass if the TZ override did not take effect.
    expect(clicked.toISOString().slice(0, 10)).toBe('2026-10-14');
    expect(toDateStr(clicked)).toBe('2026-10-15');
  });

  it('zero-pads month and day', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('handles the year boundary', () => {
    expect(toDateStr(new Date(2027, 0, 1))).toBe('2027-01-01');
  });
});

describe('salonToday', () => {
  it("uses New York's date, not the visitor's", () => {
    // 9:30 PM Oct 7 in Los Angeles is already 12:30 AM Oct 8 in New York.
    expect(salonToday(new Date('2026-10-08T04:30:00Z'))).toBe('2026-10-08');
  });
});
