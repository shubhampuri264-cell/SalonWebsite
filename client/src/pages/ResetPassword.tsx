import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabase';
import { useCustomerAuthStore } from '@/store/customerAuthStore';

// Landing page for the password-reset link emailed by Supabase.
// Flow:
//   1. Supabase's JS client reads the recovery tokens out of the URL hash on
//      load and fires onAuthStateChange with event === 'PASSWORD_RECOVERY'.
//   2. That puts us in a temporary recovery session — auth.updateUser can be
//      called to set a new password.
//   3. The recovery token is single-use and expires 1h after issue (Supabase
//      default), so this page is harmless if revisited without a valid link.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword, isLoading, error, clearError } = useCustomerAuthStore();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // If the user opens this page directly (no email link), there's no
    // recovery session — gate the form behind PASSWORD_RECOVERY firing.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    // The event fires once on load if the URL has the recovery hash; also
    // check getSession in case it already settled before we subscribed.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (password.length < 6) return;
    if (password !== confirm) return;
    const ok = await updatePassword(password);
    if (ok) {
      setSuccess(true);
      // Send the user to their profile after a short pause so they see the
      // success state. They're now signed in with the new password.
      setTimeout(() => navigate('/profile'), 1500);
    }
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 font-serif text-3xl">Set a new password</h1>

      {!ready && !success && (
        <p className="text-sm text-muted-foreground">
          This link is invalid or has expired. Request a new password reset from
          the sign-in screen.
        </p>
      )}

      {ready && !success && (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
              placeholder="At least 6 characters"
              className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-hidden focus:ring-2 focus:ring-rose-400 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-hidden focus:ring-2 focus:ring-rose-400 focus:border-transparent"
            />
            {confirm && password !== confirm && (
              <p className="mt-1 text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading || password.length < 6 || password !== confirm}
            className="w-full rounded-full bg-rose-500 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}

      {success && (
        <p className="text-sm text-muted-foreground">
          Password updated. Redirecting to your profile…
        </p>
      )}
    </div>
  );
}
