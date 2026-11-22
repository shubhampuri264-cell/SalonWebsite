// Shared pieces for the admin screens: feedback banners, the confirm dialog,
// status badges and the date labels used by the bookings lists.
//
// Failures in admin used to go to console.error only -- the owner tapped a
// button, the server refused, and nothing on screen changed. Every admin
// failure now goes through toFailure(): a banner she can read, plus Sentry.
// The lint config bans console.* in this folder so it cannot quietly return.

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from '@luxe/shared';
import { ApiError } from '@/api/client';
import { adminDenial } from '@/api/admin';
import { captureException } from '@/sentry';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type Feedback =
  | { kind: 'success' | 'warning'; message: ReactNode }
  | {
      kind: 'error';
      message: ReactNode;
      expired?: boolean;
      /** No reply from our server: a save may or may not have gone through. */
      uncertain?: boolean;
    };

/**
 * True when the server rejected the login itself: expired or signed out
 * elsewhere (401), or no longer accepted as the owner / two-step verification
 * missing (403 NOT_OWNER / MFA_REQUIRED). Signing in again fixes all three.
 */
function isExpired(err: unknown): boolean {
  return adminDenial(err) !== null;
}

function reasonOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  // fetch() rejects with a TypeError when the request never reached the server.
  if (err instanceof TypeError) return 'no connection';
  return 'unexpected error';
}

/**
 * Turns a failed request into the banner the owner sees, and reports it.
 *
 * `what` names the action in her terms, e.g. "Couldn't cancel Jane Doe's
 * booking". `changes` says whether the action would have changed anything.
 *
 * "Nothing was changed" is only claimed when our own API answered with a
 * refusal (its errors are JSON with an `error` field). A dropped connection or
 * a gateway timeout gives no such answer -- and a cancel commits before its
 * email is sent, so a timeout there can follow a change that did happen.
 * Those are reported as uncertain instead.
 */
export function toFailure(
  err: unknown,
  what: string,
  { action, changes = true }: { action: string; changes?: boolean }
): Feedback {
  if (isExpired(err)) {
    return { kind: 'error', expired: true, message: `${what} – please sign in again.` };
  }
  captureException(err, { tags: { area: 'admin', action } });

  if (err instanceof ApiError && (err.data as { code?: string } | undefined)?.code === 'SLOT_TAKEN') {
    return { kind: 'error', message: `${what} – that time has since been booked by someone else.` };
  }
  const reason = reasonOf(err);
  if (!changes) return { kind: 'error', message: `${what} (${reason}).` };

  const serverRefused =
    err instanceof ApiError && typeof (err.data as { error?: unknown } | undefined)?.error === 'string';
  if (!serverRefused) {
    return {
      kind: 'error',
      uncertain: true,
      message: `${what} – no reply from the server (${reason}). It may still have gone through, so check the booking before trying again.`,
    };
  }
  return { kind: 'error', message: `${what} – nothing was changed (${reason}).` };
}

const BANNER_STYLES = {
  success: { box: 'border-green-200 bg-green-50 text-green-800', Icon: CheckCircle2 },
  warning: { box: 'border-amber-300 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  error: { box: 'border-red-200 bg-red-50 text-red-800', Icon: XCircle },
} as const;

/** Inline banner. Errors are announced assertively, everything else politely. */
export function Banner({
  feedback,
  onDismiss,
  action,
  className,
}: {
  feedback: Feedback;
  onDismiss?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  const signOut = useAuthStore((s) => s.signOut);
  const { box, Icon } = BANNER_STYLES[feedback.kind];
  const expired = feedback.kind === 'error' && feedback.expired;

  return (
    <div
      role={feedback.kind === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm shadow-xs', box, className)}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words">
        <p>{feedback.message}</p>
        {(expired || action) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {expired && (
              // Signing out clears the stale session; the admin shell then
              // sends her to the login page.
              <button
                type="button"
                onClick={signOut}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Sign in again
              </button>
            )}
            {action}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded-full p-1 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * Result of an action, pinned to the bottom of the screen so it is seen
 * wherever she has scrolled to. Success fades after a few seconds; errors and
 * warnings stay until dismissed.
 */
export function ActionToast({ feedback, onDismiss }: { feedback: Feedback | null; onDismiss: () => void }) {
  useEffect(() => {
    if (feedback?.kind !== 'success') return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss]);

  if (!feedback) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:justify-end md:px-6 md:pb-6">
      <Banner
        feedback={feedback}
        onDismiss={onDismiss}
        className="pointer-events-auto w-full max-w-md shadow-lg"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

/**
 * Native <dialog> as a modal: focus trap, Escape and the backdrop come from
 * the browser. A bottom sheet on phones, a centred card from md up.
 * Escape and the backdrop are ignored while `busy`, so a save in flight
 * cannot be dismissed half way.
 */
export function Sheet({
  open,
  onClose,
  busy = false,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  labelledBy: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // showModal() moves focus to the first focusable element inside, which is
  // why every sheet puts its safe choice first.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        // A click on the <dialog> element itself is a click on the backdrop.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-0 text-foreground shadow-2xl',
        'backdrop:bg-black/40 open:motion-safe:animate-sheet-up',
        'md:inset-0 md:m-auto md:h-fit md:max-w-md md:rounded-2xl md:open:animate-none'
      )}
    >
      {open && <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-6">{children}</div>}
    </dialog>
  );
}

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
}

/**
 * Title, explanation and two buttons, safe choice first. Takes focus when it
 * mounts, so it can also replace other content inside an open Sheet.
 */
export function ConfirmBody({
  request,
  busy,
  onConfirm,
  onClose,
  titleId,
}: {
  request: ConfirmRequest;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  titleId: string;
}) {
  const safeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    safeRef.current?.focus();
  }, []);

  return (
    <>
      <h2 id={titleId} className="font-serif text-lg font-semibold leading-snug">
        {request.title}
      </h2>
      <div className="mt-2 text-sm text-muted-foreground">{request.body}</div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button
          ref={safeRef}
          type="button"
          onClick={onClose}
          disabled={busy}
          className="h-11 rounded-full border border-border bg-white px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          {request.cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
          className={cn(
            'flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-70',
            request.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-rose-500 hover:bg-rose-600'
          )}
        >
          {busy && <Spinner />}
          {request.confirmLabel}
        </button>
      </div>
    </>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      aria-hidden="true"
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex h-40 items-center justify-center" role="status" aria-label="Loading">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  completed: 'bg-blue-100 text-blue-800',
  no_show: 'bg-gray-200 text-gray-800',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[status])}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Dates (display only -- which bookings are "today" is decided by the server)
// ---------------------------------------------------------------------------

function utcDay(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** "Sat Nov 28", with the year added when it is not the current one. */
export function shortDate(ymd: string, today: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const label = date
    .toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .replace(',', '');
  return ymd.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${y}`;
}

/** Day heading for a group of bookings: "Today · Sun Nov 22", "Tomorrow · ...". */
export function dayHeading(ymd: string, today: string): string {
  const label = shortDate(ymd, today);
  switch (utcDay(ymd) - utcDay(today)) {
    case 0:
      return `Today · ${label}`;
    case 1:
      return `Tomorrow · ${label}`;
    case -1:
      return `Yesterday · ${label}`;
    default:
      return label;
  }
}
