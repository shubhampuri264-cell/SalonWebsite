import { useState } from 'react';
import { X } from 'lucide-react';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { cn } from '@/utils/cn';

interface Props {
  onClose: () => void;
}

type Tab = 'signin' | 'signup';

export default function CustomerAuthModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  const { signIn, signUp, isLoading, error, clearError, session } = useCustomerAuthStore();

  // Close modal once signed in
  if (session) {
    onClose();
    return null;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await signIn(email.trim(), password);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!fullName.trim()) return;
    if (password !== confirmPassword) {
      return;
    }
    await signUp(email.trim(), password, fullName.trim());
    // If no error after signUp, show success message (email confirmation may be required)
    setSignUpSuccess(true);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    clearError();
    setSignUpSuccess(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl font-semibold">
            {tab === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex rounded-full border border-border bg-muted p-1">
          <button
            onClick={() => switchTab('signin')}
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
              tab === 'signin' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Sign In
          </button>
          <button
            onClick={() => switchTab('signup')}
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
              tab === 'signup' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Create Account
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-4" noValidate>
            <div>
              <label htmlFor="signin-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="signin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="signin-password" className="mb-1 block text-sm font-medium">
                Password
              </label>
              <input
                id="signin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full rounded-full bg-rose-500 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              No account?{' '}
              <button
                type="button"
                onClick={() => switchTab('signup')}
                className="text-rose-600 underline"
              >
                Create one
              </button>
            </p>
          </form>
        ) : signUpSuccess ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">✉️</div>
            <p className="font-medium">Check your email!</p>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
            </p>
            <button
              onClick={() => switchTab('signin')}
              className="text-sm text-rose-600 underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4" noValidate>
            <div>
              <label htmlFor="signup-name" className="mb-1 block text-sm font-medium">
                Full Name
              </label>
              <input
                id="signup-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="signup-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-1 block text-sm font-medium">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="signup-confirm" className="mb-1 block text-sm font-medium">
                Confirm Password
              </label>
              <input
                id="signup-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading || !email || !password || !fullName || password !== confirmPassword}
              className="w-full rounded-full bg-rose-500 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Creating account…' : 'Create Account'}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchTab('signin')}
                className="text-rose-600 underline"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
