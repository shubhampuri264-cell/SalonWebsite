import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase';
import { requireAdmin } from '../_lib/auth';
import { enforceRateLimit } from '../_lib/ratelimit';
import { captureError } from '../_lib/sentry';
import { sendCancellationEmail } from '../_lib/emails';
import { salonNowMinutes, salonToday } from '../_lib/dates';
import {
  ADMIN_COLUMNS,
  EXPORT_CHUNK,
  EXPORT_MAX_ROWS,
  PAGE_SIZE,
  hasStarted,
  idQuerySchema,
  listDateBounds,
  listQuerySchema,
  patchBodySchema,
  periodBounds,
  searchFilter,
  type ListQuery,
} from '../_lib/adminAppointments';

// Owner-only. Every request is rate-limited and re-authenticated: the account
// must carry the owner role and be signed in with two-step verification
// (requireAdmin in ../_lib/auth).
//
// There is deliberately no DELETE: booking history is never wiped from the
// admin screen. Cancelling keeps the row.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'admin'))) return;
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

// Raw database messages never reach the browser: they name tables, columns
// and constraints. Sentry gets the detail; the browser gets a short reason,
// which the admin screen slots into its own sentence ("Couldn't cancel Jane
// Doe's booking – nothing was changed (server error).").
const LOAD_FAILED = 'server error';
const SAVE_FAILED = 'server error';

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
  }
  const query = parsed.data;
  // The salon's date, never the caller's: a phone in another timezone (or
  // with a wrong clock) must not move "today".
  const today = salonToday();

  // "Am I the owner?" -- the admin screens ask this instead of carrying the
  // owner's identity in the public JS. Reaching this line is the answer.
  if (query.me) return res.json({ owner: true });

  try {
    if (query.summary) return res.json(await loadSummary(today));
    if (query.export) return res.json(await loadExport(query, today));
    return res.json(await loadPage(query, today));
  } catch (err) {
    await captureError(err, {
      fingerprint: 'api:admin:appointments:list',
      tags: { endpoint: 'GET /api/admin/appointments' },
    });
    return res.status(500).json({ error: LOAD_FAILED });
  }
}

/** A filtered list query, before ordering and paging. */
function filteredQuery(query: ListQuery, today: string, count?: 'exact') {
  const bounds = listDateBounds(query, today);
  let q = supabaseAdmin
    .from('appointments')
    .select(ADMIN_COLUMNS, count ? { count } : undefined);

  if (bounds.gte) q = q.gte('appointment_date', bounds.gte);
  if (bounds.lte) q = q.lte('appointment_date', bounds.lte);
  if (bounds.lt) q = q.lt('appointment_date', bounds.lt);

  if (!query.status) q = q.neq('status', 'cancelled');
  else if (query.status !== 'any') q = q.eq('status', query.status);

  if (query.stylist_id) q = q.eq('stylist_id', query.stylist_id);
  if (query.service_id) q = q.eq('service_id', query.service_id);

  if (query.q) {
    const filter = searchFilter(query.q);
    if (filter) q = q.or(filter);
  }

  // id last: a stable tie-break, so two bookings at the same date and time
  // (different stylists) cannot swap places between pages.
  return q
    .order('appointment_date', { ascending: bounds.ascending })
    .order('appointment_time', { ascending: bounds.ascending })
    .order('id', { ascending: true });
}

async function loadPage(query: ListQuery, today: string) {
  const offset = query.offset ?? 0;
  const { data, count, error } = await filteredQuery(query, today, 'exact')
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    // PGRST103: the offset is past the end -- the list shrank since the last
    // page loaded (e.g. a booking was cancelled out of the default view).
    // Not an error from the owner's point of view; there is simply no more.
    if (error.code === 'PGRST103') {
      return { appointments: [], total: offset, offset, limit: PAGE_SIZE, today };
    }
    throw error;
  }
  return { appointments: data ?? [], total: count ?? 0, offset, limit: PAGE_SIZE, today };
}

/** Every matching booking (up to EXPORT_MAX_ROWS), for the CSV export. */
async function loadExport(query: ListQuery, today: string) {
  const rows: unknown[] = [];
  let total = 0;
  while (rows.length < EXPORT_MAX_ROWS) {
    const from = rows.length;
    const to = Math.min(from + EXPORT_CHUNK, EXPORT_MAX_ROWS) - 1;
    const { data, count, error } = await filteredQuery(query, today, 'exact').range(from, to);
    if (error) {
      if (error.code === 'PGRST103') break;
      throw error;
    }
    total = count ?? 0;
    rows.push(...(data ?? []));
    if (!data?.length || rows.length >= total) break;
  }
  return { appointments: rows, total, truncated: total > rows.length, today };
}

/**
 * The dashboard tiles. Counted by the database (head-only: no rows are
 * downloaded), in the salon's timezone, never counting cancelled bookings.
 */
async function loadSummary(today: string) {
  const week = periodBounds('week', today);
  const month = periodBounds('month', today);

  const count = async (from: string, to?: string) => {
    let q = supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'cancelled')
      .gte('appointment_date', from);
    if (to) q = q.lte('appointment_date', to);
    const { count: n, error } = await q;
    if (error) throw error;
    return n ?? 0;
  };

  const [todayCount, weekCount, monthCount, upcomingCount] = await Promise.all([
    count(today, today),
    count(week.from, week.to),
    count(month.from, month.to),
    count(today),
  ]);

  return {
    today,
    week,
    month,
    counts: { today: todayCount, week: weekCount, month: monthCount, upcoming: upcomingCount },
  };
}

// ---------------------------------------------------------------------------
// PATCH: status / notes
// ---------------------------------------------------------------------------

type EmailOutcome =
  | { status: 'sent' }
  | { status: 'failed' }
  | { status: 'skipped'; reason: 'past' | 'already_cancelled' };

interface JoinedRow {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  appointment_date: string;
  appointment_time: string;
  services: { name?: string } | { name?: string }[] | null;
  [key: string]: unknown;
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const idParsed = idQuerySchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'Invalid appointment id', details: idParsed.error.flatten() });
  }
  const bodyParsed = patchBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: bodyParsed.error.flatten() });
  }
  const id = idParsed.data.id;
  const changes = bodyParsed.data;

  if (changes.status === 'cancelled') return cancel(id, changes, res);

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update(changes)
    .eq('id', id)
    .select(ADMIN_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23P01 = exclusion_violation on appointments_no_overlap (migration 016):
    // restoring a cancelled booking whose time has since been given to
    // someone else. The database refuses; say so in words.
    if (error.code === '23P01') {
      return res.status(409).json({
        error: 'That time has since been booked by someone else.',
        code: 'SLOT_TAKEN',
      });
    }
    await captureError(error, {
      fingerprint: 'api:admin:appointments:update',
      tags: { endpoint: 'PATCH /api/admin/appointments' },
      extra: { appointment_id: id },
    });
    return res.status(500).json({ error: SAVE_FAILED });
  }
  if (!data) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' });
  return res.json({ appointment: data });
}

/**
 * Cancels a booking and emails the customer.
 *
 * The UPDATE only matches a row that is not already cancelled, so exactly one
 * request can flip it -- and only that request sends the email. A double tap,
 * a retry after a dropped connection, or two open tabs therefore never email
 * the customer twice.
 *
 * The email is awaited: the serverless runtime may freeze as soon as the
 * response is sent, and the owner is told whether it went.
 */
async function cancel(
  id: string,
  changes: { status?: string; notes?: string },
  res: VercelResponse,
) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update(changes)
    .eq('id', id)
    .neq('status', 'cancelled')
    // cancellation_token is required by the email type; stripped before responding.
    .select(`${ADMIN_COLUMNS}, cancellation_token`)
    .maybeSingle();

  if (error) {
    await captureError(error, {
      fingerprint: 'api:admin:appointments:cancel',
      tags: { endpoint: 'PATCH /api/admin/appointments' },
      extra: { appointment_id: id },
    });
    return res.status(500).json({ error: SAVE_FAILED });
  }

  if (!data) {
    // Either no such booking, or it was already cancelled. Tell them apart
    // without touching the row.
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('appointments')
      .select(ADMIN_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (lookupError) {
      await captureError(lookupError, {
        fingerprint: 'api:admin:appointments:cancel',
        tags: { endpoint: 'PATCH /api/admin/appointments' },
        extra: { appointment_id: id },
      });
      return res.status(500).json({ error: SAVE_FAILED });
    }
    if (!existing) return res.status(404).json({ error: 'Booking not found', code: 'NOT_FOUND' });
    const email: EmailOutcome = { status: 'skipped', reason: 'already_cancelled' };
    return res.json({ appointment: existing, email });
  }

  const row = data as unknown as JoinedRow & { cancellation_token: string };
  const { cancellation_token, ...appointment } = row;

  let email: EmailOutcome;
  if (hasStarted(row.appointment_date, row.appointment_time, salonToday(), salonNowMinutes())) {
    email = { status: 'skipped', reason: 'past' };
  } else {
    const joined = row.services;
    const serviceName = (Array.isArray(joined) ? joined[0] : joined)?.name ?? 'your service';
    try {
      const sent = await sendCancellationEmail(
        { ...row, cancellation_token },
        serviceName,
      );
      email = sent ? { status: 'sent' } : { status: 'failed' };
      if (!sent) {
        await captureError(new Error('Cancellation email not sent: RESEND_API_KEY missing'), {
          fingerprint: 'api:admin:appointments:email:cancellation',
          tags: { endpoint: 'PATCH /api/admin/appointments' },
          extra: { appointment_id: id },
        });
      }
    } catch (err) {
      email = { status: 'failed' };
      await captureError(err, {
        fingerprint: 'api:admin:appointments:email:cancellation',
        tags: { endpoint: 'PATCH /api/admin/appointments' },
        extra: { appointment_id: id },
      });
    }
  }

  return res.json({ appointment, email });
}
