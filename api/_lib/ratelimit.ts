import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { envValue } from './env';

export type LimiterKey =
  | 'booking'
  | 'bookingPerEmail'
  | 'bookingPerPhone'
  | 'cancel'
  | 'reschedule'
  | 'contact'
  | 'contactGlobal'
  | 'admin'
  | 'customer'
  | 'emailResend'
  | 'emailResendPerAppt'
  | 'passwordReset'
  | 'passwordResetPerEmail';

interface LimiterSet {
  booking: Ratelimit;
  bookingPerEmail: Ratelimit;
  bookingPerPhone: Ratelimit;
  cancel: Ratelimit;
  reschedule: Ratelimit;
  contact: Ratelimit;
  contactGlobal: Ratelimit;
  admin: Ratelimit;
  customer: Ratelimit;
  emailResend: Ratelimit;
  emailResendPerAppt: Ratelimit;
  passwordReset: Ratelimit;
  passwordResetPerEmail: Ratelimit;
}

// Lazily initialized + cached across warm invocations.
// `null` means env vars are missing — see enforceRateLimit for behavior.
let cachedLimiters: LimiterSet | null | undefined;

// In production, an unconfigured limiter is a misconfiguration — fail CLOSED
// so we don't silently ship without abuse protection. Preview/dev fail open
// so local work and PR previews don't need Upstash.
const IS_PRODUCTION = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

function getLimiters(): LimiterSet | null {
  if (cachedLimiters !== undefined) return cachedLimiters;

  const url = envValue('UPSTASH_REDIS_REST_URL');
  const token = envValue('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) {
    console.warn('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN missing — rate limiting disabled');
    cachedLimiters = null;
    return null;
  }

  const redis = new Redis({ url, token });
  cachedLimiters = {
    // 10 bookings per hour per IP — well above any real customer (most book once)
    booking: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 h'),
      prefix: 'rl:book',
      analytics: false,
    }),
    // Per-customer daily booking caps, keyed on the contact details rather than
    // the IP. The `booking` limiter above bounds one network location; these
    // bound one *person*, which is what actually protects the calendar from
    // bulk fake bookings and the Resend quota from being drained by a script
    // rotating through IPs.
    //
    // 3/day is far above any real customer — a family booking four
    // appointments in one sitting is the only legitimate case, and they get a
    // 429 that names the salon's phone number rather than a bare refusal.
    //
    // Enforced inside createAppointment() (see _lib/booking.ts), NOT in a
    // route handler. Putting it in one entry point would leave the other open:
    // /api/appointments is public and unauthenticated, so a cap that only
    // guarded the chat assistant could be sidestepped by posting directly to
    // the same endpoint the booking wizard already uses.
    bookingPerEmail: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 d'),
      prefix: 'rl:book:email',
      analytics: false,
    }),
    bookingPerPhone: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 d'),
      prefix: 'rl:book:phone',
      analytics: false,
    }),
    // Cancellations now send an email, so this endpoint spends Resend quota.
    // 20/hour per IP is far above any real customer (one click from an email
    // link) while bounding what a script pointed at the endpoint can burn.
    cancel: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '1 h'),
      prefix: 'rl:cancel',
      analytics: false,
    }),
    // Moving an appointment sends an email, so it spends Resend quota. Also
    // bounds slot-thrashing: repeatedly moving a booking around the calendar
    // makes other customers' availability flicker. 5/hour is far above any real
    // customer, who moves an appointment once.
    reschedule: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      prefix: 'rl:resched',
      analytics: false,
    }),
    // Contact form — public, unauthenticated, and it sends mail, so it is the
    // most abusable endpoint in the app. 3/hour per IP.
    contact: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      prefix: 'rl:contact',
      analytics: false,
    }),
    // Second layer, keyed on a constant rather than the caller: a global cap on
    // contact emails per day. Per-IP limits do nothing against a spammer
    // rotating addresses, and Resend's free tier is 100 emails/day shared with
    // booking confirmations, reminders and follow-ups — so an unbounded contact
    // form can silently stop customers receiving their confirmations. 30/day
    // leaves the majority of the quota for transactional mail.
    contactGlobal: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 d'),
      prefix: 'rl:contact:global',
      analytics: false,
    }),
    // 120 admin requests per minute per IP — generous for a single owner's UI clicks,
    // tight enough to throttle credential-stuffing or scraping attempts
    admin: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      prefix: 'rl:adm',
      analytics: false,
    }),
    // Authenticated customer reads (their own appointments). Per-user key, not
    // per-IP, so users behind NAT/VPN don't share a budget. 60/min is well
    // above any human refresh cadence.
    customer: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'rl:cust',
      analytics: false,
    }),
    // Confirmation-email resends: bounded to protect the free Resend tier
    // (100 emails/day). Two layers — per-IP throttle, plus a per-appointment
    // cooldown so the same booking can't be hammered.
    emailResend: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      prefix: 'rl:resend',
      analytics: false,
    }),
    emailResendPerAppt: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '5 m'),
      prefix: 'rl:resend:appt',
      analytics: false,
    }),
    // Password reset request — protects Resend quota and slows brute-force
    // enumeration attempts. Two layers — per-IP and per-email cooldown.
    passwordReset: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      prefix: 'rl:pwreset',
      analytics: false,
    }),
    passwordResetPerEmail: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '10 m'),
      prefix: 'rl:pwreset:email',
      analytics: false,
    }),
  };
  return cachedLimiters;
}

/**
 * Check a rate-limit budget without sending any response. Returns true if
 * within budget, false if exceeded. Useful when the caller wants to silently
 * drop work (e.g. anti-enumeration password reset: still return 200 but skip
 * the email send) rather than surface a 429.
 *
 * In production, if Upstash is unconfigured or errors, this returns FALSE
 * (treat as exceeded) so we don't accidentally fan out e.g. emails without
 * any throttle. Dev/preview returns true (fail-open) for ergonomics.
 */
export async function checkRateLimit(
  req: VercelRequest,
  limiter: LimiterKey,
  identifier?: string,
): Promise<boolean> {
  const limiters = getLimiters();
  if (!limiters) return !IS_PRODUCTION;

  try {
    const key = identifier ?? clientIp(req);
    const { success } = await limiters[limiter].limit(key);
    return success;
  } catch (err) {
    console.error('[ratelimit] Upstash call failed:', err);
    return !IS_PRODUCTION;
  }
}

/**
 * Check a limit for an identifier that is not a request — an email address, a
 * phone number, a session id.
 *
 * Exists because `checkRateLimit`/`enforceRateLimit` both take a VercelRequest,
 * and the callers that need per-customer caps live in shared library code
 * (createAppointment) that is deliberately HTTP-agnostic so both the booking
 * wizard and the chat assistant can reach it.
 *
 * Same fail-closed-in-production semantics as checkRateLimit: an unavailable
 * limiter must not silently become "unlimited" in prod.
 */
export async function checkIdentifierLimit(
  limiter: LimiterKey,
  identifier: string,
): Promise<boolean> {
  const limiters = getLimiters();
  if (!limiters) {
    if (IS_PRODUCTION) {
      console.error(
        `[ratelimit] Upstash env vars missing in production — failing closed on ${limiter}`,
      );
      return false;
    }
    return true;
  }

  try {
    const { success } = await limiters[limiter].limit(identifier);
    return success;
  } catch (err) {
    console.error(`[ratelimit] Upstash call failed for ${limiter}:`, err);
    return !IS_PRODUCTION;
  }
}

/**
 * Normalises a contact detail into a stable rate-limit key.
 *
 * Without this the caps are trivially defeated: "Jane@Example.com " and
 * "jane@example.com" hash to different buckets, as do "(718) 255-6940" and
 * "7182556940".
 */
export function limitKeyForEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function limitKeyForPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function clientIp(req: VercelRequest): string {
  // Vercel injects the real client IP into x-forwarded-for (first entry).
  // Always prefer this over req.socket.remoteAddress, which is the load balancer.
  const forwarded = req.headers['x-forwarded-for'];
  const headerValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (headerValue) return headerValue.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Enforces the requested rate limit. If the limit is exceeded, sends a 429
 * response and returns false — callers must `return` immediately when this
 * returns false.
 *
 * Failure modes:
 *   - Within budget: returns true.
 *   - Over budget: sends 429, returns false.
 *   - Upstash not configured: fails CLOSED in production (503), OPEN in dev/preview.
 *   - Upstash call errors at runtime: fails CLOSED in production (503), OPEN in dev/preview.
 *
 * Rationale: silently fail-open in prod hides a misconfiguration that defeats
 * the whole point of rate limiting. Better to surface it as a hard failure
 * (which alerting will catch) than to ship without protection.
 */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  limiter: LimiterKey,
  identifier?: string,
): Promise<boolean> {
  const limiters = getLimiters();
  if (!limiters) {
    if (IS_PRODUCTION) {
      console.error('[ratelimit] Upstash env vars missing in production — failing closed');
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again shortly.' });
      return false;
    }
    return true;
  }

  try {
    const key = identifier ?? clientIp(req);
    const { success, limit, remaining, reset } = await limiters[limiter].limit(key);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(reset));

    if (!success) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[ratelimit] Upstash call failed:', err);
    if (IS_PRODUCTION) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again shortly.' });
      return false;
    }
    return true;
  }
}
