// Funnel counters.
//
// Aggregate integers only. No message text, no session id, no IP, no contact
// details — nothing here can be traced back to a person, which is the reason it
// is safe to keep for thirty days when the sessions themselves expire in an
// hour.
//
// What it answers: where do people give up. Booking bots lose 40-60% of the
// people who start, and without per-node counts the only available diagnosis is
// guesswork about which step is the problem.

import { getRedis } from './ratelimit.ts';
import { salonToday } from './dates.ts';
import type { NodeId } from './intents.ts';

const RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * Records that a conversation reached a node.
 *
 * Never awaited by the request path and never throws: a counter is not worth
 * one millisecond of a customer's latency, let alone a failed reply.
 */
export function trackNode(node: NodeId): void {
  void bump(`chat:funnel:${node}:${salonToday()}`);
}

/**
 * Records a classifier verdict — the six in-scope labels plus off_topic,
 * self_harm and abusive.
 *
 * Useful for exactly one question: is the topic filter firing on real
 * customers? A rising off_topic count against flat booking counts means the
 * classifier has become too strict, which is invisible otherwise because the
 * people it turns away simply leave.
 */
export function trackLabel(label: string): void {
  void bump(`chat:funnel:label:${label}:${salonToday()}`);
}

export function trackBlocked(reason: string): void {
  void bump(`chat:funnel:blocked:${reason}:${salonToday()}`);
}

async function bump(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const total = await redis.incr(key);
    // INCR creates the key without a TTL, so the first write sets the window.
    if (total === 1) await redis.expire(key, RETENTION_SECONDS);
  } catch {
    // Deliberately silent. A failed counter is not worth a log line on every
    // request during a Redis blip.
  }
}
