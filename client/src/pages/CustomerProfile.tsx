import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { getCustomerAppointments, type CustomerAppointment } from '@/api/customer';
import { APPOINTMENT_STATUS_LABELS } from '@luxe/shared';
import type { AppointmentStatus } from '@luxe/shared';
import { formatDate, formatTime } from '@/utils/dates';
import { cn } from '@/utils/cn';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  no_show: 'bg-gray-100 text-gray-700',
};

export default function CustomerProfile() {
  const navigate = useNavigate();
  const { session, profile, signOut, loadProfile } = useCustomerAuthStore();
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
      return;
    }
    if (!profile) loadProfile();
  }, [session, profile, navigate, loadProfile]);

  useEffect(() => {
    if (!session?.access_token) return;
    getCustomerAppointments(session.access_token)
      .then(setAppointments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load appointments'))
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  if (!session) return null;

  const displayName = profile?.full_name || profile?.email || 'My Account';
  const upcoming = appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'completed' && a.appointment_date >= new Date().toISOString().slice(0, 10));
  const past = appointments.filter((a) => a.status === 'completed' || a.status === 'cancelled' || a.appointment_date < new Date().toISOString().slice(0, 10));

  return (
    <>
      <Helmet>
        <title>My Account | Icon Studio</title>
      </Helmet>

      <div className="container mx-auto max-w-3xl px-4 py-12 md:px-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold">{displayName}</h1>
            {profile?.email && (
              <p className="mt-1 text-sm text-muted-foreground">{profile.email}</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              to="/book"
              className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
            >
              Book Again
            </Link>
            <button
              onClick={() => { signOut(); navigate('/'); }}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Upcoming appointments */}
        <div className="mt-10">
          <h2 className="font-serif text-xl font-semibold">Upcoming Appointments</h2>
          {loading ? (
            <div className="mt-4 flex h-24 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
            </div>
          ) : error ? (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          ) : upcoming.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border py-10 text-center">
              <p className="text-muted-foreground">No upcoming appointments.</p>
              <Link to="/book" className="mt-3 inline-block text-sm text-rose-600 underline">
                Book one now
              </Link>
            </div>
          ) : (
            <AppointmentList appointments={upcoming} />
          )}
        </div>

        {/* Past appointments */}
        {!loading && !error && past.length > 0 && (
          <div className="mt-10">
            <h2 className="font-serif text-xl font-semibold">Past Appointments</h2>
            <AppointmentList appointments={past} />
          </div>
        )}
      </div>
    </>
  );
}

function AppointmentList({ appointments }: { appointments: CustomerAppointment[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">Date & Time</th>
            <th className="px-4 py-3 text-left font-medium">Service</th>
            <th className="px-4 py-3 text-left font-medium">Stylist</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((appt) => (
            <tr key={appt.id} className="border-b border-border last:border-0 hover:bg-muted/20">
              <td className="px-4 py-3 whitespace-nowrap">
                <p className="font-medium">{formatDate(appt.appointment_date)}</p>
                <p className="text-xs text-muted-foreground">{formatTime(appt.appointment_time)}</p>
              </td>
              <td className="px-4 py-3">{appt.services?.name ?? '-'}</td>
              <td className="px-4 py-3">{appt.stylists?.name ?? '-'}</td>
              <td className="px-4 py-3">
                <span className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  STATUS_COLORS[appt.status] ?? 'bg-gray-100 text-gray-600'
                )}>
                  {APPOINTMENT_STATUS_LABELS[appt.status as AppointmentStatus] ?? appt.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
