import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { supabaseAdmin } from '../_lib/supabase';
import { sendReminderEmail, sendFollowUpEmail, getGoogleReviewUrl } from '../_lib/emails';
import { captureError } from '../_lib/sentry';
import { salonToday, addDays } from '../_lib/dates';

/**
 * The salon's single daily email job. Runs two independent passes:
 *
 *   1. Reminders  — tomorrow's confirmed appointments, "your appointment is
 *                   tomorrow".
 *   2. Follow-ups — yesterday's appointments that actually happened, asking
 *                   for a Google review.
 *
 * Both live in this one function rather than a second /api/cron/* file because
 * the Vercel Hobby plan caps the project at 12 serverless functions and 11 are
 * already in use. Keeping the last slot free is deliberate.
 *
 * The file name stays `reminders` even though it now does more: vercel.json
 * pins the cron schedule to the path /api/cron/reminders, and renaming would
 * silently stop the job between the rename and the next deploy.
 */

/**
 * Constant-time comparison of the Authorization header against CRON_SECRET.
 *
 * Fails closed when CRON_SECRET is unset. The previous check interpolated the
 * raw env var, so an unset secret made the literal string "Bearer undefined"
 * a valid credential — a value any caller can guess — and the job became
 * publicly triggerable.
 */
function isAuthorizedCron(authHeader: string | undefined): boolean {
  const secret = process.env.CRON_SECRET?.replace(/^['"]|['"]$/g, '');
  if (!secret) {
    console.error('[cron/reminders] CRON_SECRET is not set — refusing to run');
    return false;
  }
  if (!authHeader) return false;

  const encoder = new TextEncoder();
  const expected = encoder.encode(`Bearer ${secret}`);
  const received = encoder.encode(authHeader);
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  // Length is not secret; the secret's bytes are.
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

// Supabase types single-valued FK joins as arrays. Runtime is an object.
function pickName(v: unknown): string | null {
  if (!v) return null;
  const first = Array.isArray(v) ? v[0] : v;
  return (first as { name?: string } | null)?.name ?? null;
}

const APPOINTMENT_FIELDS = `
  id, client_name, client_email, client_phone,
  appointment_date, appointment_time, cancellation_token, notes,
  services:service_id (name),
  stylists:stylist_id (name)
`;

interface PassResult {
  sent: number;
  failed: number;
  total: number;
  skipped?: string;
  error?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron issues GET. Anything else is not the scheduler.
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Dates in the salon's timezone, not UTC. The cron fires at 13:00 UTC, which
  // is the same calendar day in New York, but deriving from salon-local time
  // keeps this correct if the schedule ever moves.
  const today = salonToday();

  // Sequential, not Promise.all: both passes send through the same Resend
  // account, and running them concurrently doubles the instantaneous rate
  // against a 100/day free-tier quota for no meaningful wall-clock gain on a
  // job nobody is waiting on.
  const reminders = await runReminders(addDays(today, 1));
  const followUps = await runFollowUps(addDays(today, -1));

  // Vercel's cron dashboard decides whether a run succeeded from the HTTP
  // status, not the body. Returning 200 with {sent: 0, failed: 12} inside it
  // renders as a green run — which is exactly how every reminder could fail
  // for days with the dashboard showing nothing wrong. Any fetch error or any
  // failed send makes the whole invocation a failure.
  //
  // Safe to fail the request after doing partial work: each successful send
  // has already flipped its own reminder_sent / followup_sent flag, so a
  // re-run skips what already went out.
  const degraded =
    Boolean(reminders.error || followUps.error) || reminders.failed > 0 || followUps.failed > 0;

  return res.status(degraded ? 500 : 200).json({ ok: !degraded, reminders, followUps });
}

async function runReminders(targetDate: string): Promise<PassResult> {
  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(APPOINTMENT_FIELDS)
    .eq('appointment_date', targetDate)
    .eq('status', 'confirmed')
    .eq('reminder_sent', false);

  if (error) {
    await captureError(error, {
      fingerprint: 'cron:reminders:fetch',
      tags: { job: 'cron-reminders' },
      extra: { date: targetDate },
    });
    return { sent: 0, failed: 0, total: 0, error: error.message };
  }

  return sendBatch({
    rows: appointments ?? [],
    date: targetDate,
    flagColumn: 'reminder_sent',
    fingerprint: 'cron:reminders:send',
    totalFailureFingerprint: 'cron:reminders:total-failure',
    label: 'reminder',
    send: (row, serviceName, stylistName) =>
      sendReminderEmail(row, serviceName, stylistName),
  });
}

async function runFollowUps(targetDate: string): Promise<PassResult> {
  // The review link is the entire purpose of this email, so with no link
  // configured the pass is a no-op rather than a contentless "thanks for
  // visiting" send. Skipping also preserves the ask: these customers keep
  // followup_sent = false, so nobody is silently marked as already-asked
  // during the window before the Google Business Profile is verified.
  const reviewUrl = getGoogleReviewUrl();
  if (!reviewUrl) {
    // Loud, because a silently disabled feature reads identically to a broken
    // one in the Vercel logs.
    console.warn(
      '[cron/reminders] GOOGLE_REVIEW_URL is not set — skipping follow-up emails. ' +
        'Set it in the Vercel project env to enable review requests.',
    );
    return { sent: 0, failed: 0, total: 0, skipped: 'GOOGLE_REVIEW_URL not set' };
  }

  // 'confirmed' AND 'completed', not 'completed' alone. Marking an appointment
  // completed is a manual admin action (AdminAppointments.tsx), so in practice
  // almost every visit that happened is still sitting at 'confirmed' the next
  // morning — filtering on 'completed' would send approximately zero emails.
  // 'cancelled' and 'no_show' are excluded: asking someone who never showed up
  // how their visit went is worse than not asking at all.
  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(APPOINTMENT_FIELDS)
    .eq('appointment_date', targetDate)
    .in('status', ['confirmed', 'completed'])
    .eq('followup_sent', false);

  if (error) {
    await captureError(error, {
      fingerprint: 'cron:followup:fetch',
      tags: { job: 'cron-reminders' },
      extra: { date: targetDate },
    });
    return { sent: 0, failed: 0, total: 0, error: error.message };
  }

  return sendBatch({
    rows: appointments ?? [],
    date: targetDate,
    flagColumn: 'followup_sent',
    fingerprint: 'cron:followup:send',
    totalFailureFingerprint: 'cron:followup:total-failure',
    label: 'follow-up',
    send: (row, serviceName, stylistName) =>
      sendFollowUpEmail(row, serviceName, stylistName, reviewUrl),
  });
}

/**
 * Sends one email per row, then flips `flagColumn` so a retry of this cron
 * invocation does not re-send. The flag is only set after the send resolves.
 *
 * KNOWN GAP: a failed send is NOT retried. This comment used to claim it was
 * "retried tomorrow", which is false — both passes query one exact
 * appointment_date (tomorrow for reminders, yesterday for follow-ups), so
 * tomorrow's invocation looks at a different day and never revisits today's
 * failures. A failed email is lost unless someone re-triggers this job the
 * same day. That is what the 500 above and the Sentry events below are for:
 * they are the only signal that a customer did not get their reminder.
 */
async function sendBatch(opts: {
  rows: any[];
  date: string;
  flagColumn: 'reminder_sent' | 'followup_sent';
  fingerprint: string;
  totalFailureFingerprint: string;
  label: string;
  send: (row: any, serviceName: string, stylistName: string) => Promise<void>;
}): Promise<PassResult> {
  const { rows, date, flagColumn, fingerprint, totalFailureFingerprint, label, send } = opts;

  if (!rows.length) return { sent: 0, failed: 0, total: 0 };

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const serviceName = pickName(row.services) ?? 'appointment';
    const stylistName = pickName(row.stylists) ?? 'your stylist';

    try {
      await send(row, serviceName, stylistName);
      await supabaseAdmin
        .from('appointments')
        .update({ [flagColumn]: true })
        .eq('id', row.id);
      sent++;
    } catch (err) {
      failed++;
      console.error(`Failed ${label} for ${row.id}:`, err);
      // Report per-appointment failures with a shared fingerprint so Sentry
      // groups them into one issue per occurrence type (e.g. "Resend 429"),
      // not one issue per appointment id.
      await captureError(err, {
        fingerprint,
        tags: { job: 'cron-reminders' },
        extra: { appointment_id: row.id, date, pass: label },
      });
    }
  }

  // If every send failed, surface a higher-severity event — the whole pass is
  // broken (likely Resend outage or quota exhaustion), not a one-off.
  if (failed > 0 && sent === 0) {
    await captureError(new Error(`Cron ${label}: all ${failed} sends failed`), {
      fingerprint: totalFailureFingerprint,
      tags: { job: 'cron-reminders' },
      extra: { failed, total: rows.length, date },
    });
  }

  return { sent, failed, total: rows.length };
}
