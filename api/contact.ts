import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { checkRateLimit, enforceRateLimit } from './_lib/ratelimit';
import { sendContactMessageEmail } from './_lib/emails';
import { captureError } from './_lib/sentry';

// Website contact form.
//
// Replaces a `mailto:` link that handed the message to the OS mail client.
// That works on a desktop with Outlook or Mail configured, and silently loses
// the message everywhere else — mobile browsers without a default handler, and
// anyone using webmail. Enquiries were being dropped with no trace on either
// side, which is why this endpoint is worth the twelfth (and final) Vercel
// function slot.
//
// This is the only public, unauthenticated endpoint in the app that sends mail
// on demand, so it carries three independent brakes: a per-IP rate limit, a
// global daily cap that survives IP rotation, and a honeypot field.

const bodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(1000),
  // Honeypot. Hidden from humans by CSS, so a real submission always leaves it
  // empty; form-filling bots populate every input they find. Not `.max(0)` —
  // a validation error would tell the bot which field gave it away.
  website: z.string().max(200).optional(),
});

// Shown whenever the message could not be delivered. Always names a second way
// to reach the salon: a contact form that fails without giving the visitor a
// fallback is no better than the mailto: it replaced.
const FALLBACK =
  'Sorry, we could not send your message. Please call us on (718) 255-6940 or try again in a few minutes.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Layer 1: per-IP throttle, before any parsing or mail work.
  if (!(await enforceRateLimit(req, res, 'contact'))) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { name, email, message, website } = parsed.data;

  // Layer 2: honeypot. Report success and send nothing — a bot told it was
  // blocked just retries with the field cleared. Checked before the global cap
  // so bot traffic cannot exhaust the day's budget for real visitors.
  if (website) {
    console.warn('[contact] honeypot triggered — message dropped');
    return res.status(200).json({ message: 'Message sent. We will get back to you soon.' });
  }

  // Layer 3: global daily cap. Per-IP limits do nothing against a spammer
  // rotating addresses, and every contact email comes out of the same Resend
  // quota as booking confirmations. Refuse rather than let form spam stop
  // customers receiving their confirmations.
  if (!(await checkRateLimit(req, 'contactGlobal', 'global'))) {
    console.error('[contact] global daily cap reached — message refused');
    return res.status(429).json({ error: FALLBACK });
  }

  try {
    const delivered = await sendContactMessageEmail({
      name,
      email: email.toLowerCase(),
      message,
    });
    if (!delivered) {
      // OWNER_EMAIL or RESEND_API_KEY is unset. Misconfiguration, not the
      // visitor's fault — but never claim success, or the message vanishes
      // exactly the way the mailto: version did.
      await captureError(new Error('Contact form could not deliver: email sending not configured'), {
        fingerprint: 'api:contact:not-configured',
        tags: { endpoint: 'POST /api/contact' },
      });
      return res.status(500).json({ error: FALLBACK });
    }
  } catch (err) {
    console.error('[contact] send failed:', err);
    await captureError(err, {
      fingerprint: 'api:contact:send',
      tags: { endpoint: 'POST /api/contact' },
      extra: { sender_email: email },
    });
    return res.status(502).json({ error: FALLBACK });
  }

  return res.status(200).json({ message: 'Message sent. We will get back to you soon.' });
}
