import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { XCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cancelAppointment } from '@/api/appointments';
import { ApiError } from '@/api/client';

export default function CancelPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [state, setState] = useState<'loading' | 'success' | 'error' | 'already-cancelled'>(
    'loading'
  );
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMsg('Invalid cancellation link.');
      return;
    }

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
  }, [token]);

  return (
    <>
      <Helmet>
        <title>Cancel Appointment | Icon Studio</title>
      </Helmet>

      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
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
