import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { envValue } from './env';

export async function verifyAdminAuth(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;

  // envValue, not process.env: a quoted OWNER_EMAIL in the Vercel dashboard
  // never matches the JWT email, and the owner is locked out of every admin
  // endpoint with an indistinguishable 401.
  const ownerEmail = (envValue('OWNER_EMAIL') ?? '').toLowerCase();
  if (!ownerEmail) return false;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (error || !user) return false;

  return (user.email ?? '').trim().toLowerCase() === ownerEmail;
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
