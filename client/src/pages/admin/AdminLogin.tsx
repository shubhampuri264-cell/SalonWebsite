import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy, ShieldCheck, Smartphone, Scissors } from 'lucide-react';
import { adminDenial, getAdminWhoAmI } from '@/api/admin';
import { supabase } from '@/api/supabase';
import { captureException } from '@/sentry';
import { useAuthStore } from '@/store/authStore';
import { Spinner } from './adminUi';

// Admin sign-in, in two steps: email + password, then a 6-digit code from an
// authenticator app. The server decides who the owner is (owner role on the
// account) and refuses admin requests until the code step is done (session
// aal2) -- this page only walks her through it.
//
// First sign-in after this was introduced: no authenticator is set up yet, so
// the code step becomes a one-time setup (add to app, enter its code).

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter an email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginValues = z.infer<typeof loginSchema>;

type Step =
  | { kind: 'password' }
  | { kind: 'checking' }
  | { kind: 'verify'; factorId: string }
  | { kind: 'setup' }
  | { kind: 'pending-approval' }
  | { kind: 'not-owner' }
  | { kind: 'error'; message: string };

const inputClass =
  'w-full rounded-lg border border-input px-4 py-2.5 text-base outline-hidden focus:ring-2 focus:ring-rose-400 md:text-sm';
const primaryButton =
  'flex w-full items-center justify-center gap-2 rounded-full bg-rose-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { session, signIn, signOut, setSession, isLoading, error, clearError } = useAuthStore();
  const [step, setStep] = useState<Step>({ kind: session ? 'checking' : 'password' });

  /** With a session in hand, ask the server what is still missing. */
  const resolve = useCallback(
    async () => {
      // Read the newest token at call time: it changes on every hourly
      // refresh and when a code upgrades the session.
      const token = useAuthStore.getState().session?.access_token;
      if (!token) {
        setStep({ kind: 'password' });
        return;
      }
      setStep({ kind: 'checking' });
      try {
        await getAdminWhoAmI(token);
        navigate('/admin/appointments', { replace: true });
      } catch (err) {
        const denial = adminDenial(err);
        if (denial === 'MFA_REQUIRED') {
          const { data, error: listError } = await supabase.auth.mfa.listFactors();
          if (listError || !data) {
            setStep({ kind: 'error', message: "Couldn't load your two-step settings. Try again." });
            return;
          }
          const factor = data.totp[0];
          setStep(factor ? { kind: 'verify', factorId: factor.id } : { kind: 'setup' });
        } else if (denial === 'FACTOR_NOT_APPROVED') {
          setStep({ kind: 'pending-approval' });
        } else if (denial === 'NOT_OWNER') {
          setStep({ kind: 'not-owner' });
        } else if (denial === 'UNAUTHENTICATED') {
          // A stale or revoked session: clear it and start again.
          await signOut();
          setStep({ kind: 'password' });
        } else {
          captureException(err, { tags: { area: 'admin', action: 'login:resolve' } });
          setStep({ kind: 'error', message: "Couldn't reach the server. Check your connection and try again." });
        }
      }
    },
    [navigate, signOut]
  );

  // Keyed on the user, not the token. An hourly token refresh must not
  // restart the flow: on the setup step that would throw away the
  // authenticator she has just added and issue a new one.
  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) void resolve();
    else setStep({ kind: 'password' });
  }, [userId, resolve]);

  /** After a code is accepted the session is upgraded; pick up the new token and re-check. */
  const onVerified = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await resolve();
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginValues) => {
    clearError();
    await signIn(values.email, values.password);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-xs sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
            {step.kind === 'verify' || step.kind === 'setup' || step.kind === 'pending-approval' ? (
              <ShieldCheck className="h-6 w-6 text-rose-600" aria-hidden="true" />
            ) : (
              <Scissors className="h-6 w-6 text-rose-600" aria-hidden="true" />
            )}
          </div>
          <h1 className="mt-3 font-serif text-2xl font-semibold">
            {step.kind === 'verify'
              ? 'Enter your code'
              : step.kind === 'setup'
                ? 'Set up two-step sign-in'
                : step.kind === 'pending-approval'
                  ? 'Almost done'
                  : 'Admin Login'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Icon Studio Dashboard</p>
        </div>

        {step.kind === 'checking' && (
          <div className="flex justify-center py-6" role="status" aria-label="Checking your sign-in">
            <Spinner className="h-6 w-6 text-rose-500" />
          </div>
        )}

        {step.kind === 'password' && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                {...register('email')}
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                className={inputClass}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">
                Password
              </label>
              <input
                {...register('password')}
                id="password"
                type="password"
                autoComplete="current-password"
                className={inputClass}
                aria-invalid={!!errors.password}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>
            {error && (
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={isLoading} className={primaryButton}>
              {isLoading && <Spinner />}
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {step.kind === 'verify' && (
          <CodeForm
            factorId={step.factorId}
            intro="Open your authenticator app and enter the 6-digit code for Icon Studio."
            onVerified={onVerified}
            footer={
              <p className="text-xs text-muted-foreground">
                Lost your phone? Ask your website administrator to reset two-step sign-in for your account.
              </p>
            }
          />
        )}

        {step.kind === 'setup' && <SetupForm onVerified={onVerified} />}

        {step.kind === 'pending-approval' && (
          <div className="space-y-3">
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">
              Your authenticator app is set up. One last step: your website administrator approves it
              once, so that nobody else can add their own. Ask them to approve it, then tap below.
            </p>
            <button type="button" onClick={() => resolve()} className={primaryButton}>
              It's approved – continue
            </button>
          </div>
        )}

        {step.kind === 'not-owner' && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="alert">
            You are signed in as {session?.user?.email}, which is not the owner account.
          </p>
        )}

        {step.kind === 'error' && (
          <div className="space-y-3">
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {step.message}
            </p>
            <button type="button" onClick={() => resolve()} className={primaryButton}>
              Try again
            </button>
          </div>
        )}

        {step.kind !== 'password' && step.kind !== 'checking' && (
          <button
            type="button"
            onClick={signOut}
            className="mt-4 w-full text-center text-sm font-medium text-muted-foreground underline hover:text-foreground"
          >
            Sign out and use a different account
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CodeForm({
  factorId,
  intro,
  onVerified,
  footer,
}: {
  factorId: string;
  intro?: ReactNode;
  onVerified: () => Promise<void>;
  footer?: ReactNode;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setBusy(false);
      setCode('');
      setMessage(
        error.status === 429
          ? 'Too many attempts. Wait a few minutes, then try again.'
          : "That code didn't work. Codes change every 30 seconds, so enter the one showing now."
      );
      return;
    }
    await onVerified();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      <div>
        <label htmlFor="otp" className="mb-1 block text-sm font-medium">
          6-digit code
        </label>
        <input
          id="otp"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          autoFocus
          className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
          aria-invalid={!!message}
          aria-describedby={message ? 'otp-error' : undefined}
        />
        {message && (
          <p id="otp-error" className="mt-2 text-sm text-destructive" role="alert">
            {message}
          </p>
        )}
      </div>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy && <Spinner />}
        Verify
      </button>
      {footer}
    </form>
  );
}

interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
  uri: string;
}

/**
 * Clears abandoned setups and starts a new one. Runs once per mounted setup
 * screen: the promise is kept and shared, so a re-run of the effect (React's
 * development double-invoke) cannot start a second enrolment that removes the
 * first.
 */
async function startEnrollment(): Promise<Enrollment | null> {
  // An abandoned earlier attempt leaves an unverified factor behind, and a
  // second one with the same name would be refused. Verified factors are
  // never touched here.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Icon Studio admin',
    issuer: 'Icon Studio',
  });
  if (error || !data) {
    captureException(error ?? new Error('MFA enroll returned no data'), { tags: { area: 'admin', action: 'mfa:enroll' } });
    return null;
  }
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

function SetupForm({ onVerified }: { onVerified: () => Promise<void> }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const pending = useRef<Promise<Enrollment | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    pending.current ??= startEnrollment();
    pending.current.then((result) => {
      if (cancelled) return;
      if (result) setEnrollment(result);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
        Couldn't start the setup. Refresh the page to try again.
      </p>
    );
  }
  if (!enrollment) {
    return (
      <div className="flex justify-center py-6" role="status" aria-label="Preparing setup">
        <Spinner className="h-6 w-6 text-rose-500" />
      </div>
    );
  }

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        From now on, signing in also needs a code from an app on your phone. This is a one-time setup.
      </p>
      <ol className="space-y-4 text-sm">
        <li>
          <p className="font-medium">1. Install an authenticator app</p>
          <p className="text-muted-foreground">Google Authenticator or Microsoft Authenticator, free from your app store.</p>
        </li>
        <li className="space-y-2">
          <p className="font-medium">2. Add Icon Studio to it</p>
          <a
            href={enrollment.uri}
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-rose-300 bg-rose-50 text-sm font-semibold text-rose-700 hover:bg-rose-100"
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            On this phone: tap to add
          </a>
          <p className="text-muted-foreground">On a computer: scan this with the app.</p>
          <img src={enrollment.qr} alt="QR code for your authenticator app" className="mx-auto h-44 w-44" />
          <p className="text-muted-foreground">Or type this key into the app:</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">{enrollment.secret}</code>
            <button
              type="button"
              onClick={copySecret}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </li>
        <li>
          <p className="font-medium">3. Enter the code the app shows</p>
        </li>
      </ol>
      <CodeForm factorId={enrollment.factorId} onVerified={onVerified} />
    </div>
  );
}
