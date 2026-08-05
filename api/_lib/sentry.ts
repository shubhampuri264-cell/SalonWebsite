// Sentry wrapper for Vercel serverless functions.
//
// Why a wrapper? Two reasons:
//   1. Lazy init keyed off SENTRY_DSN — when the env var is absent (local
//      dev, previews), every call is a no-op. No accidental errors-to-cloud
//      while iterating locally.
//   2. Serverless functions need an explicit flush before returning, or
//      events get dropped when the runtime tears the process down. The
//      captureError helper does the flush for callers.

import * as Sentry from '@sentry/node';
import { envValue } from './env';

let initialized = false;

/**
 * Keys whose values are customer PII and must never leave the process, no
 * matter which layer attached them. Matched case-insensitively against the
 * whole key, so `client_email`, `clientEmail` and `email` are all caught.
 */
const PII_KEY_PATTERN =
  /(email|phone|client_name|customer|full_name|password|token|authorization|cookie|address)/i;

const REDACTED = '[redacted]';

/**
 * Strip anything that could carry personal data before an event is sent.
 *
 * `sendDefaultPii: false` already stops the SDK attaching bodies and headers on
 * its own, but it does not police what *our* code passes as `extra` — and the
 * natural thing for a caller to do when a booking fails is attach the booking.
 * This makes that safe by construction rather than by reviewer vigilance.
 */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    // Bodies and cookies never carry useful debugging signal here; the URL and
    // method do, so those stay.
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    // Query strings can carry a cancellation token or an email.
    delete event.request.query_string;
  }

  const scrub = (bag: Record<string, unknown> | undefined) => {
    if (!bag) return;
    for (const key of Object.keys(bag)) {
      if (PII_KEY_PATTERN.test(key)) bag[key] = REDACTED;
    }
  };

  scrub(event.extra);
  scrub(event.tags as Record<string, unknown> | undefined);

  // `user` is only ever set from an auth context; keep the id for correlation
  // and drop the rest.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  return event;
}

function initSentry(): boolean {
  if (initialized) return true;
  const dsn = envValue('SENTRY_DSN');
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Errors only. No perf monitoring or profiling — keeps the free-tier
    // quota focused on the events we actually want to see.
    tracesSampleRate: 0,
    // Defaults to true; explicit so anyone reading this knows we rely on it
    // for unhandled rejection capture in the handler wrappers below.
    enabled: true,
    // Explicit even though it is the SDK default: every request body reaching
    // these functions carries customer PII (name, email, phone on
    // /api/appointments; message text on /api/contact). Flipping this on would
    // ship that to a third party, and inadvertent PII in logs is itself
    // treated as a reportable breach under NY's SHIELD Act.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });

  initialized = true;
  return true;
}

interface CaptureContext {
  tags?: Record<string, string | number | boolean>;
  extra?: Record<string, unknown>;
  // Tag a route/job for grouping in the Sentry UI (e.g. "cron:reminders",
  // "api:appointments:POST"). Always set this — it makes the dashboard usable.
  fingerprint?: string;
}

/**
 * Report an error to Sentry and flush before returning. Safe to call without
 * SENTRY_DSN configured — it becomes a no-op. Never throws: caller code
 * shouldn't have to wrap this in try/catch.
 */
export async function captureError(err: unknown, ctx: CaptureContext = {}): Promise<void> {
  if (!initSentry()) {
    // Always echo to stderr so the error is visible even when Sentry isn't
    // configured. Without this, captureError() in dev would silently swallow.
    console.error('[sentry: no DSN]', err, ctx);
    return;
  }
  try {
    Sentry.withScope((scope) => {
      if (ctx.tags) {
        for (const [k, v] of Object.entries(ctx.tags)) scope.setTag(k, v);
      }
      if (ctx.extra) {
        for (const [k, v] of Object.entries(ctx.extra)) scope.setExtra(k, v);
      }
      if (ctx.fingerprint) scope.setFingerprint([ctx.fingerprint]);
      Sentry.captureException(err);
    });
    // Vercel kills the function shortly after the response is sent. Without
    // a flush, the HTTP request to Sentry can be cancelled mid-flight and the
    // event is lost. 2s is well under any sane request budget.
    await Sentry.flush(2000);
  } catch (sentryErr) {
    // If Sentry itself is down or misconfigured, don't propagate — log and
    // move on. The original error matters more than the reporting failure.
    console.error('[sentry] capture/flush failed:', sentryErr);
  }
}
