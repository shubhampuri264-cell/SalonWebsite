import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomerAuthStore } from '@/store/customerAuthStore';

interface ContactFormProps {
  mode: 'booking' | 'message';
  disabled: boolean;
  onSubmit: (intent: string, params: Record<string, unknown>) => void;
}

/**
 * Real form fields, never a conversation.
 *
 * Iris is instructed never to ask for a name, email or phone number in prose,
 * and this component is why that instruction is keepable: the details are typed
 * into inputs and POSTed as parameters. They never enter a model's context
 * window, so no amount of prompt injection can extract them and no
 * hallucination can alter them.
 *
 * It is also the only place personal details are collected in the whole widget.
 */
export default function ContactForm({ mode, disabled, onSubmit }: ContactFormProps) {
  const profile = useCustomerAuthStore((s) => s.profile);
  const session = useCustomerAuthStore((s) => s.session);

  // Prefilled for signed-in customers from their own profile — same data the
  // booking wizard prefills, and it never leaves the browser except as this
  // submission.
  const [name, setName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(profile?.email ?? session?.user?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const inputClass =
    'w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-50';

  const submit = () => {
    // Mirrors the server bounds so a typo is caught here rather than as a 400
    // after a round trip. The server remains the real guarantee.
    if (name.trim().length < 2) return setError('Please enter your name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Please enter a valid email');

    if (mode === 'message') {
      if (message.trim().length < 10) return setError('Please write a little more so the salon can help');
      setError(null);
      setSubmitted(true);
      onSubmit('contact_salon', { name: name.trim(), email: email.trim(), message: message.trim() });
      return;
    }

    if (phone.replace(/\D/g, '').length < 7) return setError('Please enter a phone number');

    setError(null);
    setSubmitted(true);
    onSubmit('submit_contact', {
      client_name: name.trim(),
      client_email: email.trim(),
      client_phone: phone.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(consent ? { marketing_consent: true } : {}),
    });
  };

  // Collapsed after submission rather than unmounted: the transcript above it
  // stays scrollable and the customer can see what they sent.
  if (submitted) {
    return (
      <div className="rounded-xl border border-gold-200 bg-white/70 p-3 text-sm text-muted-foreground">
        Details sent.
      </div>
    );
  }

  return (
    <div className="card-lux bg-white p-3.5">
      <h3 className="mb-2.5 font-serif text-[15px] font-semibold">
        {mode === 'booking' ? 'Your details' : 'Message the salon'}
      </h3>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="iris-name">
            Name
          </label>
          <input
            id="iris-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            autoComplete="name"
            maxLength={100}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="iris-email">
            Email
          </label>
          <input
            id="iris-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            autoComplete="email"
            maxLength={254}
            className={inputClass}
          />
        </div>

        {mode === 'booking' ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="iris-phone">
                Phone
              </label>
              <input
                id="iris-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={disabled}
                autoComplete="tel"
                maxLength={20}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="iris-notes">
                Anything we should know? (optional)
              </label>
              <input
                id="iris-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={disabled}
                maxLength={500}
                className={inputClass}
              />
            </div>
            <label className="flex items-start gap-2 pt-0.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={disabled}
                className="mt-0.5 h-3.5 w-3.5 rounded border-input accent-rose-500"
              />
              <span>Email me about offers. Unticked by default, and you can stop any time.</span>
            </label>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="iris-message">
              Message
            </label>
            <textarea
              id="iris-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={disabled}
              rows={3}
              maxLength={1000}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="mt-3 w-full rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
      >
        {mode === 'booking' ? 'Review booking' : 'Send message'}
      </button>

      {mode === 'booking' && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Nothing is booked yet — you will see the details to check first.
        </p>
      )}
    </div>
  );
}

/**
 * Shown instead of an appointment list when nobody is signed in.
 *
 * Three genuine routes and no fourth. In particular it never asks for an email
 * address to "look up" a booking: an assistant that confirms whether an
 * appointment exists for an arbitrary address is an enumeration oracle, which
 * is exactly what the password-reset flow is written to avoid.
 */
export function SignInCard() {
  return (
    <div className="card-lux bg-white p-3.5">
      <h3 className="mb-1.5 font-serif text-[15px] font-semibold">Sign in to see your appointments</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Or use the cancellation link in your confirmation email, or give the salon a call.
      </p>
      <Link
        to="/profile"
        className="inline-flex w-full items-center justify-center rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
      >
        Sign in
      </Link>
    </div>
  );
}
