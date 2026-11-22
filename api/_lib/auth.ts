import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './supabase';
import { envValue } from './env';

export type AdminDenial =
  | 'UNAUTHENTICATED'
  | 'NOT_OWNER'
  | 'MFA_REQUIRED'
  | 'FACTOR_NOT_APPROVED'
  | 'UNAVAILABLE';
export type AdminCheck = { ok: true } | { ok: false; code: AdminDenial };

/**
 * Who may use the admin API: the account marked `app_metadata.role = 'owner'`,
 * in a session verified with HER approved authenticator app.
 *
 * Why not the email address, as before: anyone can open an account here and
 * emails are not verified (Supabase "Confirm email" is off). Matching on the
 * owner's address was safe only while that exact account existed; if it were
 * ever deleted or renamed, whoever registered the address next would become
 * admin. `app_metadata` cannot be written by the user -- only with the service
 * role or SQL -- so the role cannot be self-assigned.
 *
 * Why two-step (aal2): the password alone (guessed, reused, phished, or reset
 * from her inbox) must not be enough.
 *
 * Why the approved authenticator, not just aal2: Supabase lets whoever holds
 * the password set up an authenticator while none exists, and that reaches
 * aal2 too. So the session must have been verified with the one authenticator
 * pinned in `app_metadata.owner_factor_id`, which is set by hand
 * (supabase/admin/approve-owner-authenticator.sql) after she sets hers up in
 * person. The level and factor are read from auth.sessions -- the database's
 * record of how this session was verified -- not from the token's claims.
 */
export async function checkAdmin(authHeader: string | undefined): Promise<AdminCheck> {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, code: 'UNAUTHENTICATED' };
  const token = authHeader.slice(7);

  // getUser asks Supabase Auth to validate the token (signature, expiry, and
  // that the session still exists), and returns app_metadata fresh from the
  // database rather than from the token.
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { ok: false, code: 'UNAUTHENTICATED' };

  if (user.app_metadata?.role !== 'owner') return { ok: false, code: 'NOT_OWNER' };

  // Safe to read the payload: the token was validated by the call above.
  const sessionId = tokenClaims(token)?.session_id;
  if (typeof sessionId !== 'string') return { ok: false, code: 'UNAUTHENTICATED' };

  const { data, error: lookupError } = await supabaseAdmin.rpc('admin_session_assurance', {
    p_session_id: sessionId,
  });
  // Fail closed, but say so: a database hiccup must not read as "signed out".
  if (lookupError) return { ok: false, code: 'UNAVAILABLE' };

  const session = (Array.isArray(data) ? data[0] : data) as
    | { user_id?: string; aal?: string; factor_id?: string | null }
    | null
    | undefined;
  if (!session || session.user_id !== user.id) return { ok: false, code: 'UNAUTHENTICATED' };
  if (session.aal !== 'aal2') return { ok: false, code: 'MFA_REQUIRED' };

  const approved = user.app_metadata?.owner_factor_id;
  if (typeof approved !== 'string' || session.factor_id !== approved) {
    return { ok: false, code: 'FACTOR_NOT_APPROVED' };
  }
  return { ok: true };
}

function tokenClaims(token: string): { session_id?: unknown } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const DENIAL_RESPONSES: Record<AdminDenial, { status: 401 | 403 | 503; error: string }> = {
  UNAUTHENTICATED: { status: 401, error: 'Unauthorized' },
  NOT_OWNER: { status: 403, error: 'This account is not the owner account' },
  MFA_REQUIRED: { status: 403, error: 'Two-step verification required' },
  FACTOR_NOT_APPROVED: { status: 403, error: 'This authenticator has not been approved yet' },
  UNAVAILABLE: { status: 503, error: 'Could not check your sign-in. Please try again.' },
};

/** Runs checkAdmin and, when it refuses, sends the response. Returns whether to continue. */
export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const result = await checkAdmin(req.headers.authorization);
  if (result.ok) return true;
  const { status, error } = DENIAL_RESPONSES[result.code];
  res.status(status).json({ error, code: result.code });
  return false;
}

/**
 * Verifies that a request came from our own Iris Edge Function.
 *
 * IMPORTANT — what this does and does not mean.
 *
 * This authenticates the *caller service*, never the *customer*. A valid
 * X-Internal-Token proves the request came from the Supabase function; it says
 * nothing about who is sitting in front of the chat widget, and it must never
 * be treated as permission to read or mutate a particular appointment. Every
 * endpoint that touches someone's booking still requires that customer's own
 * Bearer token and still re-checks ownership. Conflating the two would turn one
 * shared secret into a master key over every customer's appointments.
 *
 * Fails closed when INTERNAL_API_TOKEN is unset, for the same reason
 * isAuthorizedCron does: an unset secret must not make some guessable string a
 * valid credential.
 */
export function verifyInternalCaller(tokenHeader: string | string[] | undefined): boolean {
  const secret = envValue('INTERNAL_API_TOKEN');
  if (!secret) {
    console.error('[auth] INTERNAL_API_TOKEN is not set — refusing internal request');
    return false;
  }

  const received = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
  if (!received) return false;

  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(secret);
  const receivedBytes = encoder.encode(received);
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  // Length is not secret; the secret's bytes are.
  if (expectedBytes.length !== receivedBytes.length) return false;
  return crypto.timingSafeEqual(expectedBytes, receivedBytes);
}

/**
 * Rate-limit key for a request that may have been relayed by Iris.
 *
 * Requests relayed by the Iris Edge Function all arrive from Supabase's egress
 * addresses, so keying on the socket IP would put every customer using the chat
 * into a single shared bucket — the tenth booking of the hour across all of
 * them would 429, which looks exactly like a broken feature. When the caller
 * proves it is our own function, trust the end-user IP it forwards instead.
 *
 * The internal token authenticates the *service*, not the customer, and is used
 * here only to choose a rate-limit bucket. It grants no access to anything.
 * Returning undefined falls back to the socket IP.
 */
export function rateLimitIdentity(req: VercelRequest): string | undefined {
  if (!verifyInternalCaller(req.headers['x-internal-token'])) return undefined;
  const forwarded = req.headers['x-client-ip'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return ip ? `iris:${ip}` : undefined;
}
