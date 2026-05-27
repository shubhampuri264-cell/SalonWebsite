import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type LimiterKey = 'booking' | 'admin' | 'emailResend' | 'emailResendPerAppt';

interface LimiterSet {
  booking: Ratelimit;
  admin: Ratelimit;
  emailResend: Ratelimit;
  emailResendPerAppt: Ratelimit;
}

// Lazily initialized + cached across warm invocations.
// `null` means env vars are missing — rate limiting is disabled (fail-open
// so legitimate traffic is never blocked by misconfiguration).
let cachedLimiters: LimiterSet | null | undefined;

// Strip surrounding single/double quotes from an env var value.
// Vercel's env var UI stores the value verbatim — including any quotes that
// were copy-pasted from a .env file. dotenv (used locally) strips them
// automatically; this helper closes that gap for serverless.
function unquote(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/^['"]|['"]$/g, '');
}

function getLimiters(): LimiterSet | null {
  if (cachedLimiters !== undefined) return cachedLimiters;

  const url = unquote(process.env.UPSTASH_REDIS_REST_URL);
  const token = unquote(process.env.UPSTASH_REDIS_REST_TOKEN);
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
    // 120 admin requests per minute per IP — generous for a single owner's UI clicks,
    // tight enough to throttle credential-stuffing or scraping attempts
    admin: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '1 m'),
      prefix: 'rl:adm',
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
  };
  return cachedLimiters;
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
 * returns false. Returns true (and lets the request proceed) when:
 *   - the request is within budget, OR
 *   - Upstash env vars are not configured (fail-open).
 */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  limiter: LimiterKey,
  identifier?: string,
): Promise<boolean> {
  const limiters = getLimiters();
  if (!limiters) return true;

  // Wrap the Upstash call so a network blip / misconfig / quota exhaustion
  // never crashes the underlying endpoint. If rate-limit infra is down,
  // fail OPEN so legitimate bookings keep working.
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
    console.error('[ratelimit] Upstash call failed — failing open:', err);
    return true;
  }
}
