import { describe, expect, it } from 'vitest';
import { limitKeyForEmail, limitKeyForPhone } from './ratelimit';

// These two functions are the whole reason the per-customer booking caps work.
// A limiter keyed on the raw input is trivially defeated -- retyping an address
// with different capitalisation, or a phone number with different punctuation,
// lands in a fresh bucket and resets the daily allowance. The failure is silent:
// the cap appears to be configured and simply never fires.

describe('limitKeyForEmail', () => {
  it('collapses casing and surrounding whitespace to one key', () => {
    const variants = [
      'jane@example.com',
      'Jane@Example.com',
      'JANE@EXAMPLE.COM',
      '  jane@example.com  ',
      '\tjane@example.com\n',
    ];
    const keys = new Set(variants.map(limitKeyForEmail));
    expect(keys).toEqual(new Set(['jane@example.com']));
  });

  it('keeps genuinely different addresses apart', () => {
    expect(limitKeyForEmail('jane@example.com')).not.toBe(limitKeyForEmail('john@example.com'));
  });

  it('does not treat a plus-alias as the same address', () => {
    // Deliberate: Gmail folds jane+salon@ into jane@, but many providers do
    // not, and silently merging them would rate-limit unrelated customers on
    // some domains. Under-merging costs at most a few extra bookings; wrongly
    // merging blocks a real person.
    expect(limitKeyForEmail('jane+salon@example.com')).not.toBe(
      limitKeyForEmail('jane@example.com'),
    );
  });
});

describe('limitKeyForPhone', () => {
  it('collapses every common formatting of the same number', () => {
    const variants = [
      '(718) 255-6940',
      '718-255-6940',
      '718.255.6940',
      '718 255 6940',
      '7182556940',
      '  (718)255-6940  ',
    ];
    const keys = new Set(variants.map(limitKeyForPhone));
    expect(keys).toEqual(new Set(['7182556940']));
  });

  it('keeps different numbers apart', () => {
    expect(limitKeyForPhone('718-255-6940')).not.toBe(limitKeyForPhone('718-255-6941'));
  });

  it('strips a leading + but keeps the country code digits', () => {
    // +1 718... and 1718... are the same subscriber and should share a bucket;
    // the bare 10-digit form is left distinct rather than guessing a country.
    expect(limitKeyForPhone('+1 (718) 255-6940')).toBe('17182556940');
    expect(limitKeyForPhone('1-718-255-6940')).toBe('17182556940');
  });
});
