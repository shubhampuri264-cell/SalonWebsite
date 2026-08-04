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
