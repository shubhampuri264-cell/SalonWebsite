// Conversation state.
//
// Redis rather than a database table, for three reasons: it expires on its own
// (so an abandoned conversation is not a data-retention question), the rate
// limiters already need Upstash, and nothing here is worth durable storage.
//
// PII rule for this file: the session NEVER holds contact details. A customer's
// name, email and phone exist only inside the pending-booking record, which is
// written at the contact step, read exactly once by the confirm click, and
// deleted in the same operation. See createPending/consumePending below.

import { z } from 'zod';
import { getRedis } from './ratelimit.ts';
import type { NodeId } from './intents.ts';

const SESSION_TTL_SECONDS = 3600;
const PENDING_TTL_SECONDS = 600;
const MAX_SERIALIZED_BYTES = 48 * 1024;

/** Bumped when the shape below changes; an older session is discarded, not migrated. */
const SESSION_VERSION = 1;

/** How many turns of history are replayed to the model. */
export const HISTORY_TURNS = 6;

export interface Draft {
  category?: string;
  serviceId?: string;
  serviceName?: string;
  durationMin?: number;
  priceLabel?: string;
  stylistId?: string;
  stylistName?: string;
  date?: string;
  time?: string;
  /** Set when the funnel was entered to move an existing appointment. */
  rescheduleId?: string;
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface Session {
  v: number;
  createdAt: number;
  turns: number;
  node: NodeId;
  draft: Draft;
  history: HistoryTurn[];
  bookingsCreated: number;
  terminated: boolean;
  terminatedReason?: 'self_harm' | 'abusive';
}

export function newSession(now: number): Session {
  return {
    v: SESSION_VERSION,
    createdAt: now,
    turns: 0,
    node: 'root',
    draft: {},
    history: [],
    bookingsCreated: 0,
    terminated: false,
  };
}

// A session read back from Redis is untrusted input like any other: the key is
// a client-supplied UUID, and a stored blob could in principle be stale or
// malformed. Parsing it means a bad record degrades to a fresh conversation
// rather than crashing a handler on a missing field.
const sessionSchema = z.object({
  v: z.number(),
  createdAt: z.number(),
  turns: z.number(),
  node: z.string(),
  draft: z.record(z.unknown()),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })),
  bookingsCreated: z.number(),
  terminated: z.boolean(),
  terminatedReason: z.enum(['self_harm', 'abusive']).optional(),
});

export async function loadSession(sessionId: string, now: number): Promise<Session> {
  const redis = getRedis();
  if (!redis) return newSession(now);

  try {
    const raw = await redis.get<unknown>(sessionKey(sessionId));
    if (!raw) return newSession(now);

    const parsed = sessionSchema.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw);
    if (!parsed.success || parsed.data.v !== SESSION_VERSION) return newSession(now);

    return parsed.data as Session;
  } catch (err) {
    console.error('[session] load failed:', err);
    return newSession(now);
  }
}

export async function saveSession(sessionId: string, session: Session): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  // Trim before measuring — history is the only field that grows.
  session.history = session.history.slice(-HISTORY_TURNS * 2);

  let serialized = JSON.stringify(session);
  while (serialized.length > MAX_SERIALIZED_BYTES && session.history.length > 0) {
    session.history = session.history.slice(2);
    serialized = JSON.stringify(session);
  }

  try {
    await redis.set(sessionKey(sessionId), serialized, { ex: SESSION_TTL_SECONDS });
  } catch (err) {
    console.error('[session] save failed:', err);
  }
}

export function pushHistory(session: Session, role: 'user' | 'assistant', text: string): void {
  session.history.push({ role, text });
}

// --- pending bookings -------------------------------------------------------

export interface PendingBooking {
  serviceId: string;
  serviceName: string;
  stylistId: string;
  stylistName: string;
  date: string;
  time: string;
  priceLabel: string;
  durationMin: number;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  notes?: string;
  marketingConsent?: boolean;
}

/**
 * Stores the fully resolved booking behind an opaque id.
 *
 * The confirm request carries only that id — never a service id, a time, or a
 * price. So the thing that gets booked is exactly the thing the customer was
 * shown on the confirmation card, and a tampered confirm request can at best
 * refer to a booking that does not exist.
 *
 * This record is the only place contact details live server-side, for at most
 * ten minutes.
 */
export async function createPending(pendingId: string, booking: PendingBooking): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.set(pendingKey(pendingId), JSON.stringify(booking), { ex: PENDING_TTL_SECONDS });
    return true;
  } catch (err) {
    console.error('[session] pending write failed:', err);
    return false;
  }
}

/**
 * Reads and deletes the pending booking in one operation.
 *
 * GETDEL, not GET-then-DEL: two round trips leave a window in which a replayed
 * confirm request (a double-click, a retried fetch, a malicious replay) reads
 * the same record twice and books the appointment twice. Redis has no
 * transaction here, and this is the operation that exists precisely to avoid
 * needing one.
 */
export async function consumePending(pendingId: string): Promise<PendingBooking | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.getdel<unknown>(pendingKey(pendingId));
    if (!raw) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as PendingBooking;
  } catch (err) {
    console.error('[session] pending read failed:', err);
    return null;
  }
}

function sessionKey(id: string): string {
  return `chat:sess:${id}`;
}

function pendingKey(id: string): string {
  return `chat:pend:${id}`;
}
