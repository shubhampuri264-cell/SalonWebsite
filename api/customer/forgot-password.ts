import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { checkRateLimit, enforceRateLimit } from '../lib/ratelimit';
import { sendPasswordResetEmail } from '../lib/emails';
import { captureError } from '../lib/sentry';

// Self-serve password reset.
//
// Why not supabase.auth.resetPasswordForEmail directly from the client?
// Supabase's built-in SMTP is capped at ~3 emails/hour on the free tier —
// usable for demos, useless in production. This endpoint asks the Supabase
// Admin API to mint a recovery action_link (which still expires in 1 hour
// and is single-use, exactly like the built-in flow), then ships the email
// through Resend like every other transactional email in this app.
//
// Anti-enumeration: the response is ALWAYS 200 (except for malformed input
// or a per-IP 429), regardless of whether the email matched a real account
// or whether the email was suppressed by the per-email cooldown.

const bodySchema = z.object({
  email: z.string().email().max(254),
});

const GENERIC_OK = { message: 'If an account exists for that email, a reset link has been sent.' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Per-IP throttle — cheap, bounds the abuse window before any DB or email
  // work. A 429 here is fine to reveal; it's the same response a user
  // mashing the button would see.
  if (!(await enforceRateLimit(req, res, 'passwordReset'))) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const email = parsed.data.email.trim().toLowerCase();

  // Per-email cooldown — silent. If the same address asked in the last 10
  // minutes, they already have a valid link in their inbox; we suppress
  // duplicates without revealing which addresses are throttled.
  const perEmailOk = await checkRateLimit(req, 'passwordResetPerEmail', `email:${email}`);
  if (!perEmailOk) {
    return res.status(200).json(GENERIC_OK);
  }

  try {
    const redirectTo = `${process.env.CLIENT_URL ?? ''}/auth/reset`;
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      // Email doesn't match a user, or Supabase returned an error. Either
      // way, return 200 — never leak which case it was.
      console.warn(`[forgot-password] generateLink miss for ${email}: ${error?.message ?? 'no link'}`);
      return res.status(200).json(GENERIC_OK);
    }

    await sendPasswordResetEmail(email, data.properties.action_link);
  } catch (err) {
    // Surface the failure in server logs AND Sentry so a Resend or Supabase
    // outage is visible, but never expose it to the caller.
    console.error('[forgot-password] send failed:', err);
    await captureError(err, {
      fingerprint: 'api:forgot-password:send',
      tags: { endpoint: 'POST /api/customer/forgot-password' },
    });
  }

  return res.status(200).json(GENERIC_OK);
}
