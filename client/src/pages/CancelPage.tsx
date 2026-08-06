import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { XCircle, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { cancelAppointment } from '@/api/appointments';
import { ApiError } from '@/api/client';

export default function CancelPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  // 'idle' is the default — the cancellation will NOT fire until the user
  // explicitly clicks "Confirm cancellation". This prevents email link scanners
  // (Microsoft Safe Links, Gmail prefetch, antivirus URL checkers) from
  // silently cancelling real appointments when they preview the link.
  const [state, setState] = useState<
    'idle' | 'loading' | 'success' | 'error' | 'already-cancelled'
  >(token ? 'idle' : 'error');
  const [errorMsg, setErrorMsg] = useState<string>(
    token ? '' : 'Invalid cancellation link.'
  );

  const handleConfirm = () => {
    if (!token) return;
    setState('loading');
    cancelAppointment(token)
      .then(() => setState('success'))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 409) {
          setState('already-cancelled');
        } else {
          setState('error');
          setErrorMsg(e.message || 'Something went wrong.');
        }
      });
  };

  return (
    <>
      <Helmet>
        <title>Cancel Appointment | Icon Studio</title>
      </Helmet>

      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
        {state === 'idle' && (
          <>
            <AlertTriangle className="h-16 w-16 text-rose-500" aria-hidden="true" />
            <h1 className="mt-4 font-serif text-3xl font-semibold">Cancel Your Appointment?</h1>
            <p className="mt-2 max-w-md text-muted-foreground">
              This action cannot be undone. Click the button below to confirm
              that you want to cancel your appointment.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleConfirm}
                className="rounded-full bg-rose-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 transition-colors"
              >
                Confirm Cancellation
              </button>
              <Link
                to="/"
                className="rounded-full border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                Keep My Appointment
              </Link>
            </div>
          </>
        )}

        {state === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-rose-400" aria-hidden="true" />
            <p className="mt-4 text-muted-foreground">Processing your cancellation...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle className="h-16 w-16 text-rose-500" aria-hidden="true" />
            <h1 className="mt-4 font-serif text-3xl font-semibold">Appointment Cancelled</h1>
            <p className="mt-2 text-muted-foreground">
              Your appointment has been cancelled. You'll receive a confirmation email shortly.
            </p>
            <Link
              to="/book"
              className="mt-6 rounded-full bg-rose-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 transition-colors"
            >
              Book a New Appointment
            </Link>
          </>
        )}

        {state === 'already-cancelled' && (
          <>
            <XCircle className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
            <h1 className="mt-4 font-serif text-3xl font-semibold">Already Cancelled</h1>
            <p className="mt-2 text-muted-foreground">
              This appointment has already been cancelled.
            </p>
            <Link
              to="/"
              className="mt-6 text-sm text-rose-600 underline"
            >
              Return to homepage
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="h-16 w-16 text-destructive" aria-hidden="true" />
            <h1 className="mt-4 font-serif text-3xl font-semibold">Something Went Wrong</h1>
            <p className="mt-2 text-muted-foreground">{errorMsg}</p>
            <Link
              to="/contact"
              className="mt-6 text-sm text-rose-600 underline"
            >
              Contact us for help
            </Link>
          </>
        )}
      </div>
    </>
  );
}
