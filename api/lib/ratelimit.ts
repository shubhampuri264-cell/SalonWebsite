import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

type LimiterKey = 'booking' | 'admin';

interface LimiterSet {
  booking: Ratelimit;
  admin: Ratelimit;
}

// Lazily initialized + cached across warm invocations.
// `null` means env vars are missing — rate limiting is disabled (fail-open
// so legitimate traffic is never blocked by misconfiguration).
let cachedLimiters: LimiterSet | null | undefined;

function getLimiters(): LimiterSet | null {
  if (cachedLimiters !== undefined) return cachedLimiters;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
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
  limiter: LimiterKey
): Promise<boolean> {
  const limiters = getLimiters();
  if (!limiters) return true;

  const { success, limit, remaining, reset } = await limiters[limiter].limit(clientIp(req));

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));

  if (!success) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return false;
  }
  return true;
}
