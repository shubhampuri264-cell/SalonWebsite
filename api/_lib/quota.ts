// Daily usage counters for third-party quotas we cannot see from inside the app.
//
// The motivating case is Resend's free tier: 100 emails/day, shared across
// every kind of mail this app sends -- booking confirmations, owner
// notifications, reminders, follow-ups, cancellations, contact-form messages,
// password resets, and now reschedules. Nothing surfaces how close that ceiling
// is until sends start failing, and the first symptom a customer sees is a
// booking that succeeds without a confirmation email.
//
// This does not *enforce* the cap -- rate limiting does that per-endpoint. It
// exists so the ceiling becomes visible before it is hit.

import { Redis } from '@upstash/redis';
import { envValue } from './env';

/** Resend free tier. Update alongside the plan if it ever changes. */
export const EMAIL_DAILY_LIMIT = 100;

/** Warn once usage crosses this share of the daily limit. */
const WARN_THRESHOLD = 0.8;

let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;

  const url = envValue('UPSTASH_REDIS_REST_URL');
  const token = envValue('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) {
    cachedRedis = null;
    return null;
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

/**
 * UTC rather than SALON_TIMEZONE on purpose: this counter is tracking a
 * *provider's* quota window, and aligning it to the salon's midnight would make
 * the number disagree with Resend's own reset for the first few hours of every
 * night -- exactly when a late-evening booking surge would matter.
 */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record one outbound email and warn when the daily free-tier quota is nearly
 * spent.
 *
 * Fails open and never throws: an unavailable counter must never stop a
 * customer's confirmation email from going out. A missed count is a worse
 * dashboard; a thrown error here would be a lost booking notification.
 */
export async function recordEmailSend(kind: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const key = `quota:email:${utcDay()}`;
    const count = await redis.incr(key);

    // Set the TTL only when creating the key. 48h leaves yesterday's number
    // readable for a morning check without accumulating history forever.
    if (count === 1) await redis.expire(key, 60 * 60 * 48);

    if (count === EMAIL_DAILY_LIMIT) {
      console.error(
        `[quota] EMAIL LIMIT REACHED — ${count}/${EMAIL_DAILY_LIMIT} sent today (latest: ${kind}). ` +
          'Further sends will be rejected by Resend until the daily reset.'
      );
    } else if (count > EMAIL_DAILY_LIMIT) {
      console.error(
        `[quota] email send ${count} EXCEEDS the ${EMAIL_DAILY_LIMIT}/day free tier (${kind}).`
      );
    } else if (count === Math.ceil(EMAIL_DAILY_LIMIT * WARN_THRESHOLD)) {
      // Fire once, on the crossing, rather than on every send past it --
      // otherwise a busy day produces twenty identical warnings.
      console.warn(
        `[quota] email usage at ${count}/${EMAIL_DAILY_LIMIT} today (${kind}). ` +
          'Approaching the Resend free-tier ceiling.'
      );
    }
  } catch (err) {
    console.warn('[quota] counter unavailable (send still proceeded):', err);
  }
}

/** Current count for today, or null when the counter is unavailable. */
export async function emailsSentToday(): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return (await redis.get<number>(`quota:email:${utcDay()}`)) ?? 0;
  } catch {
    return null;
  }
}
