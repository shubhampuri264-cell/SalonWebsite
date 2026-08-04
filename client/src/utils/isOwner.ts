import type { Session } from '@supabase/supabase-js';

const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL as string | undefined)
  ?.trim()
  .toLowerCase();

let warnedMissingOwnerEmail = false;

/**
 * True when this session belongs to the salon owner.
 *
 * The admin API re-checks ownership server-side on every request, so this is
 * not the security boundary — it exists so a signed-in *customer* (anyone can
 * create an account) doesn't get the admin shell rendered at them. The old
 * check only required that a session exist at all.
 *
 * Fails open when VITE_OWNER_EMAIL is missing from the build: locking the
 * owner out of their own dashboard over an unset build-time variable is worse
 * than briefly rendering a shell whose every request comes back 403.
 *
 * AdminLogin and AdminDashboard must both route on this same predicate —
 * if one redirects on `session` and the other on `isOwner`, a signed-in
 * non-owner bounces between them forever.
 */
export function isOwner(session: Session | null): boolean {
  if (!session) return false;
  if (!OWNER_EMAIL) {
    if (!warnedMissingOwnerEmail) {
      console.warn(
        '[admin] VITE_OWNER_EMAIL is not set — the admin shell will render for any signed-in user'
      );
      warnedMissingOwnerEmail = true;
    }
    return true;
  }
  return session.user?.email?.trim().toLowerCase() === OWNER_EMAIL;
}
