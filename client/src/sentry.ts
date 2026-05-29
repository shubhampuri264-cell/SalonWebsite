import * as Sentry from '@sentry/react';

// Initialize once at app boot. No-op if VITE_SENTRY_DSN isn't set — keeps
// dev and previews from polluting the production project.
//
// Free-tier hygiene:
//   - tracesSampleRate: 0 — performance monitoring is disabled, all 5k
//     monthly events go to actual errors
//   - no Replay integration — session replay burns quota and we don't
//     need it for a salon booking site
//   - ignoreErrors: bot noise + benign browser quirks that Sentry's docs
//     specifically recommend filtering on the JS SDK
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_COMMIT_SHA as string | undefined) ?? undefined,
    tracesSampleRate: 0,
    ignoreErrors: [
      // Resize-observer loop warning — fires from third-party scripts, harmless
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors from cancelled requests when users navigate away
      'NetworkError when attempting to fetch resource',
      // Browser extension noise
      'top.GLOBALS',
    ],
    beforeSend(event) {
      // Drop events from localhost — only real production failures should
      // hit the dashboard.
      if (event.request?.url?.includes('localhost')) return null;
      return event;
    },
  });
}

// Re-exported so callers don't import @sentry/react directly — keeps the
// dependency in one place if we swap providers later.
export const captureException = Sentry.captureException;
