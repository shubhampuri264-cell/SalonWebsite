// Query rules for the owner's bookings screen (GET/PATCH /api/admin/appointments).
//
// Kept apart from the handler so every rule that decides WHICH bookings the
// owner sees -- the date maths, the view bounds, the search filter -- is a
// pure function with its own tests. The dashboard numbers used to be counted
// in the browser from the whole table, with the phone's clock and no upper
// bound on "this week"; centralising the maths here is what stops that class
// of bug coming back.
//
// Lives under _lib so Vercel does not count it as a function (the project is
// at the 12-function limit).

import { z } from 'zod';
import { addDays } from './dates';

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Rows per page of the list. */
export const PAGE_SIZE = 50;

/** Hard ceiling on a CSV export, so one request cannot pull an unbounded table. */
export const EXPORT_MAX_ROWS = 5000;

/** PostgREST on Supabase returns at most 1000 rows per request. */
export const EXPORT_CHUNK = 1000;

/** Columns the admin UI uses. Never `*`: that would ship cancellation tokens to the browser. */
export const ADMIN_COLUMNS =
  'id, stylist_id, service_id, client_name, client_email, client_phone, appointment_date, ' +
  'appointment_time, duration_min, notes, status, created_at, ' +
  'services:service_id (name, category), stylists:stylist_id (name)';

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export const PERIODS = ['today', 'tomorrow', 'week', 'month'] as const;
export type Period = (typeof PERIODS)[number];

export interface DateBounds {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The calendar dates a named period covers, relative to `today` (the salon's
 * date, from salonToday()). The ONLY place week and month boundaries are
 * computed -- the dashboard counts and the list's date shortcuts both call it.
 *
 * week  = Monday to Sunday containing `today`.
 * month = the 1st to the last day of `today`'s month.
 *
 * Works on date strings via UTC, so a daylight-saving change inside the range
 * cannot shift a boundary by a day.
 */
export function periodBounds(period: Period, today: string): DateBounds {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'tomorrow': {
      const tomorrow = addDays(today, 1);
      return { from: tomorrow, to: tomorrow };
    }
    case 'week': {
      const [y, m, d] = today.split('-').map(Number);
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
      const monday = addDays(today, -((dayOfWeek + 6) % 7));
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'month': {
      const [y, m] = today.split('-').map(Number);
      // Day 0 of the next month is the last day of this one.
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastDay)}` };
    }
  }
}

export const VIEWS = ['upcoming', 'past', 'all'] as const;
export type View = (typeof VIEWS)[number];

export interface ViewPlan {
  /** appointment_date >= this */
  from?: string;
  /** appointment_date < this */
  before?: string;
  /** Sort direction for date, then time. */
  ascending: boolean;
}

/**
 * upcoming: today onward, soonest first.
 * past:     before today, newest first.
 * all:      everything, newest first.
 */
export function viewPlan(view: View, today: string): ViewPlan {
  switch (view) {
    case 'upcoming':
      return { from: today, ascending: true };
    case 'past':
      return { before: today, ascending: false };
    case 'all':
      return { ascending: false };
  }
}

/**
 * Whether an appointment's start time has already passed at the salon.
 * `nowMinutes` is salonNowMinutes(). Decides whether a cancellation is worth
 * emailing: telling someone a visit that already happened "has been
 * cancelled" is noise at best.
 */
export function hasStarted(date: string, time: string, today: string, nowMinutes: number): boolean {
  if (date !== today) return date < today;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m <= nowMinutes;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * What a search may contain: letters (any language), digits, spaces and the
 * punctuation found in names, emails and phone numbers. Everything else --
 * commas, quotes, backslashes, %, *, : -- is rejected outright, because those
 * are the characters that carry meaning in PostgREST's filter grammar or in
 * LIKE patterns.
 */
export const SEARCH_ALLOWED = /^[\p{L}\p{M}\p{N} @.'+_()-]+$/u;
export const SEARCH_MAX_LENGTH = 64;

const PHONE_LIKE = /^[\d\s()+.-]+$/;
const MIN_PHONE_DIGITS = 3;

/** LIKE treats % and _ as wildcards and \ as the escape character. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Wraps a value in double quotes for PostgREST's or() grammar, where
 * `,` `.` `:` `(` `)` are otherwise delimiters. Inside quotes, " and \ are
 * escaped with a backslash.
 */
function quoteForPostgrest(value: string): string {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/**
 * The PostgREST or() filter for a search term, or null when the term holds
 * nothing searchable. `term` must already have passed searchTermSchema.
 *
 * Name and email: case-insensitive substring (ilike), LIKE-escaped.
 * Phone: only when the term looks like a phone number. Matches the digits in
 * order with any non-digits between them, so "718-555" finds "(718) 555-0101"
 * and "7185550101" alike. The regex is built from digits alone, so no input
 * character reaches it.
 */
export function searchFilter(term: string): string | null {
  const parts: string[] = [];

  const text = term.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text) {
    const pattern = quoteForPostgrest(`%${escapeLike(text)}%`);
    parts.push(`client_name.ilike.${pattern}`, `client_email.ilike.${pattern}`);
  }

  const digits = term.replace(/[^0-9]/g, '');
  if (PHONE_LIKE.test(term) && digits.length >= MIN_PHONE_DIGITS) {
    parts.push(`client_phone.match.${quoteForPostgrest(digits.split('').join('[^0-9]*'))}`);
  }

  return parts.length ? parts.join(',') : null;
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Not a real date');

export const searchTermSchema = z
  .string()
  .max(SEARCH_MAX_LENGTH * 2, 'Search is too long')
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .max(SEARCH_MAX_LENGTH, 'Search is too long')
      .regex(SEARCH_ALLOWED, 'Search may only contain letters, numbers, spaces and @ . \' + _ ( ) -')
      // Punctuation alone ("()", "-") would otherwise search for nothing and
      // return every booking.
      .regex(/[\p{L}\p{N}]/u, 'Search needs at least one letter or number'),
  );

/** "" and absent are the same thing for an optional query parameter. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const listQuerySchema = z
  .object({
    view: optional(z.enum(VIEWS)),
    range: optional(z.enum(PERIODS)),
    from: optional(calendarDate),
    to: optional(calendarDate),
    // Absent = everything except cancelled. 'any' = include cancelled.
    status: optional(z.enum([...APPOINTMENT_STATUSES, 'any'])),
    stylist_id: optional(z.string().uuid()),
    service_id: optional(z.string().uuid()),
    q: optional(searchTermSchema),
    offset: optional(z.coerce.number().int().min(0).max(100_000)),
    export: optional(z.literal('1')),
    summary: optional(z.literal('1')),
    me: optional(z.literal('1')),
  })
  .strict()
  .refine((d) => !(d.range && (d.from || d.to)), {
    message: 'Use either range or from/to, not both',
  })
  .refine((d) => !(d.from && d.to && d.from > d.to), {
    message: '`from` must not be after `to`',
  });

export type ListQuery = z.infer<typeof listQuerySchema>;

export const idQuerySchema = z.object({
  id: z.string().uuid('Invalid appointment id'),
}).strict();

export const patchBodySchema = z
  .object({
    status: z.enum(APPOINTMENT_STATUSES).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict()
  .refine((d) => d.status !== undefined || d.notes !== undefined, {
    message: 'At least one of { status, notes } is required',
  });

export interface ListBounds {
  /** appointment_date >= gte */
  gte?: string;
  /** appointment_date <= lte */
  lte?: string;
  /** appointment_date < lt */
  lt?: string;
  ascending: boolean;
}

/**
 * The date bounds a list request resolves to: the view's own bound combined
 * with the requested period or custom range. Both apply, so "Upcoming" plus
 * "This month" is today through month end. YYYY-MM-DD strings compare
 * correctly as plain strings.
 */
export function listDateBounds(query: ListQuery, today: string): ListBounds {
  const plan = viewPlan(query.view ?? 'upcoming', today);
  const range = query.range ? periodBounds(query.range, today) : { from: query.from, to: query.to };

  const lowers = [plan.from, range.from].filter((v): v is string => !!v);
  return {
    gte: lowers.length ? lowers.reduce((a, b) => (a > b ? a : b)) : undefined,
    lte: range.to,
    lt: plan.before,
    ascending: plan.ascending,
  };
}
