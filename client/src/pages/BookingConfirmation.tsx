import { useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, Calendar, Clock } from 'lucide-react';
import { formatDate, formatTime } from '@/utils/dates';

interface LocationState {
  appointment?: {
    id: string;
    status: string;
    appointment_date: string;
    appointment_time: string;
  };
}

export default function BookingConfirmation() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  const appointment = state?.appointment;

  return (
    <>
      <Helmet>
        <title>Booking Confirmed | Luxe Threads</title>
      </Helmet>

      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center md:px-6">
        <CheckCircle
          className="h-16 w-16 text-rose-500"
          aria-hidden="true"
        />
        <h1 className="mt-6 font-serif text-4xl font-semibold">
          Booking Confirmed!
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Your appointment has been confirmed. A confirmation email is on its way
          to you with all the details.
        </p>

        {appointment && (
          <div className="mt-8 rounded-2xl border border-rose-100 bg-rose-50 p-6 text-left text-sm">
            <div className="flex items-center gap-2 text-rose-700">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium">
                {formatDate(appointment.appointment_date)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-rose-700">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium">
                {formatTime(appointment.appointment_time)}
              </span>
            </div>
            <p className="mt-3 text-xs text-rose-500">
              Booking ref: {appointment.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/"
            className="rounded-full border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back to Home
          </Link>
          <Link
            to="/book"
            className="rounded-full bg-rose-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 transition-colors"
          >
            Book Another
          </Link>
        </div>
      </div>
    </>
  );
}
