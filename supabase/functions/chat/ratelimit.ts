// Chat rate limiting.
//
// A near-copy of api/_lib/ratelimit.ts, and deliberately so: a Deno function
// cannot import a Node module, and the alternative — a shared package built for
// both runtimes — would be a build pipeline for about eighty lines. The
// semantics that matter are identical, and the important one is FAIL CLOSED in
// production. A rate limiter that quietly stops working is worse than none,
// because nobody notices until the Anthropic bill arrives.
//
// TWO BUDGETS, because the two ways of talking to Iris cost different things.
//
// A free-text message costs two model calls. A menu tap costs zero — it goes
// straight to the handler. Metering them together looked reasonable on paper
// and was wrong in practice: a booking is eight taps (book, category, service,
// stylist, date, time, details, confirm), so a 5-per-minute budget threw a 429
// at a real customer halfway through choosing a haircut. The limiter has to
// bound spend and abuse without ever standing between someone and a booking.
//
// Model-backed messages — tight, because these are what cost money:
//   chat         30/1h  per IP       the ordinary visitor ceiling
//   chatBurst     5/1m  per IP       scripting inside the hourly budget
//   chatSession  25/1h  per session  conversation length (the PRD's ~20 rule)
//   chatUser     40/1h  per user id  signed-in customers, so one NAT'd office
//                                    does not share a budget
//   chatGlobal  400/1d  constant     total daily spend, survives IP rotation
//   chatTokens   60k/1d per session  a token budget, not a message count —
//                                    free text is variable-length, so counting
//                                    messages is a poor proxy for cost (LLM10)
//
// Menu taps — loose, because they are free and they are the primary interaction:
//   action      200/1h  per IP       ~25 complete bookings an hour from one
//                                    address. Bounds database and API load; no
//                                    human reaches it.
//   actionBurst  60/1m  per IP       stops a script hammering the endpoint
//                                    without ever noticing a fast human.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type ChatLimiter =
  | 'chat'
  | 'chatBurst'
  | 'chatSession'
  | 'chatUser'
  | 'chatGlobal'
  | 'chatStrike'
  | 'action'
  | 'actionBurst';

export const IS_PRODUCTION = (Deno.env.get('ENVIRONMENT') ?? 'production') === 'production';

let redisClient: Redis | null | undefined;
let limiters: Record<ChatLimiter, Ratelimit> | null | undefined;

export function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = Deno.env.get('UPSTASH_REDIS_REST_URL');
  const token = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) {
    console.error('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN missing');
    redisClient = null;
    return null;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

function getLimiters(): Record<ChatLimiter, Ratelimit> | null {
  if (limiters !== undefined) return limiters;

  const redis = getRedis();
  if (!redis) {
    limiters = null;
    return null;
  }

  limiters = {
    chat: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 h'),
      prefix: 'rl:chat',
      analytics: false,
    }),
    chatBurst: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 m'),
      prefix: 'rl:chat:burst',
      analytics: false,
    }),
    chatSession: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(25, '1 h'),
      prefix: 'rl:chat:sess',
      analytics: false,
    }),
    chatUser: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(40, '1 h'),
      prefix: 'rl:chat:user',
      analytics: false,
    }),
    // The wallet, not the tier, is what this bounds. Measured against the real
    // rendered prompt (5,652 cached tokens, ~112 volatile in, ~75 out) a typed
    // message costs about $0.0025 on a cache hit and about $0.016 on a miss.
    //
    // 400/day is roughly twelve times the expected load — 200 conversations a
    // month is about 33 typed messages a day — and caps a bad day at a few
    // dollars rather than twenty. The plan said 1500, on the assumption of a
    // 2,000-token prompt; the catalogue is 55 services, so the real prompt is
    // nearly triple that and the ceiling had to come down with it.
    //
    // Tripping this is not an outage: the customer gets a canned message and the
    // MENU still books, cancels, reschedules and shows prices. Raise it once
    // real traffic is known — and set a spend limit in the Anthropic Console
    // too, which is the only hard stop that survives a bug in this file.
    chatGlobal: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(400, '1 d'),
      prefix: 'rl:chat:global',
      analytics: false,
    }),
    // Terminated sessions per IP. Three in an hour cools that address off chat
    // — and ONLY chat. Booking, browsing, and the rest of the site are
    // untouched, because someone who was abusive at the chat widget is still
    // entitled to use a hairdresser's website.
    chatStrike: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      prefix: 'rl:chat:strike',
      analytics: false,
    }),
    // Menu taps. Generous on purpose — see the header. These make no model
    // call, so what they bound is load, not spend.
    action: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(200, '1 h'),
      prefix: 'rl:chat:act',
      analytics: false,
    }),
    actionBurst: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'rl:chat:act:burst',
      analytics: false,
    }),
  };
  return limiters;
}

/**
 * Returns true when the caller is within budget.
 *
 * Fails CLOSED in production when Upstash is unconfigured or erroring. Dev
 * fails open so the function can be run locally without a Redis instance.
 */
export async function withinLimit(limiter: ChatLimiter, identifier: string): Promise<boolean> {
  const set = getLimiters();
  if (!set) {
    if (IS_PRODUCTION) {
      console.error(`[ratelimit] unavailable in production — failing closed on ${limiter}`);
      return false;
    }
    return true;
  }

  try {
    const { success } = await set[limiter].limit(identifier);
    return success;
  } catch (err) {
    console.error(`[ratelimit] ${limiter} failed:`, err);
    return !IS_PRODUCTION;
  }
}

const TOKEN_BUDGET_PER_DAY = 60_000;

/**
 * Token budget for one session, tracked as a plain counter rather than through
 * Ratelimit because the unit of consumption is variable — a sliding window over
 * *requests* cannot express "60,000 tokens".
 *
 * Checked before the model call and incremented after, so a single very large
 * response can overshoot slightly. That is intentional: refusing to record what
 * was already spent would be worse, and the overshoot is bounded by max_tokens.
 */
export async function withinTokenBudget(sessionId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return !IS_PRODUCTION;

  try {
    const spent = await redis.get<number>(tokenKey(sessionId));
    return (spent ?? 0) < TOKEN_BUDGET_PER_DAY;
  } catch (err) {
    console.error('[ratelimit] token budget read failed:', err);
    return !IS_PRODUCTION;
  }
}

export async function recordTokens(sessionId: string, tokens: number): Promise<void> {
  const redis = getRedis();
  if (!redis || tokens <= 0) return;

  try {
    const key = tokenKey(sessionId);
    const total = await redis.incrby(key, tokens);
    // Set the TTL only on the first write of the window. INCRBY on a missing
    // key creates it with no expiry, so without this the counter would live
    // forever and the customer would be permanently out of budget.
    if (total === tokens) await redis.expire(key, 86_400);
  } catch (err) {
    console.error('[ratelimit] token record failed:', err);
  }
}

function tokenKey(sessionId: string): string {
  return `chat:tokens:${sessionId}`;
}

/**
 * The caller's IP.
 *
 * Supabase puts the real client address first in x-forwarded-for, same as
 * Vercel. Falls back to a constant rather than throwing — an unattributable
 * request should share one bucket, not bypass the limiter.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}
