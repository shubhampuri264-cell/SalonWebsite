import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { supabase } from '@/api/supabase';
import {
  getCustomerAppointments,
  resendConfirmationEmail,
  type CustomerAppointment,
} from '@/api/customer';
import { cancelAppointment } from '@/api/appointments';
import { ApiError } from '@/api/client';
import { APPOINTMENT_STATUS_LABELS } from '@luxe/shared';
import type { AppointmentStatus } from '@luxe/shared';
import { formatDate, formatTime } from '@/utils/dates';
import { cn } from '@/utils/cn';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-stone-100 text-stone-600',
  completed: 'bg-stone-100 text-stone-600',
  no_show: 'bg-stone-100 text-stone-500',
};

export default function CustomerProfile() {
  const navigate = useNavigate();
  const { session, profile, signOut, loadProfile } = useCustomerAuthStore();
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<Record<string, 'sent' | 'error'>>({});

  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
      return;
    }
    if (!profile) loadProfile();
  }, [session, profile, navigate, loadProfile]);

  useEffect(() => {
    if (!session) return;
    // Pull the freshest token directly from supabase rather than the persisted
    // zustand copy — supabase auto-refreshes; zustand may be one cycle behind.
    supabase.auth.getSession()
      .then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) throw new Error('Your session has expired. Please sign in again.');
        return getCustomerAppointments(token);
      })
      .then(setAppointments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load appointments'))
      .finally(() => setLoading(false));
  }, [session]);

  const handleResend = async (appt: CustomerAppointment) => {
    setResendingId(appt.id);
    setResendStatus((s) => {
      const next = { ...s };
      delete next[appt.id];
      return next;
    });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      await resendConfirmationEmail(appt.id, token);
      setResendStatus((s) => ({ ...s, [appt.id]: 'sent' }));
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 429
          ? 'Please wait a few minutes before resending again.'
          : err instanceof Error
          ? err.message
          : 'Failed to resend email.';
      setResendStatus((s) => ({ ...s, [appt.id]: 'error' }));
      window.alert(message);
    } finally {
      setResendingId(null);
    }
  };

  const handleCancel = async (appt: CustomerAppointment) => {
    if (!window.confirm('Cancel this appointment? This cannot be undone.')) return;
    setCancellingId(appt.id);
    try {
      await cancelAppointment(appt.cancellation_token);
      // Optimistically mark as cancelled locally so the row moves to "Past"
      // without needing a refetch.
      setAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: 'cancelled' } : a))
      );
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? 'This appointment was already cancelled.'
          : err instanceof Error
          ? err.message
          : 'Failed to cancel. Please try again.';
      window.alert(message);
    } finally {
      setCancellingId(null);
    }
  };

  if (!session) return null;

  const displayName = profile?.full_name || profile?.email || 'My Account';
  const todayLocal = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
  const upcoming = appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'completed' && a.appointment_date >= todayLocal);
  const past = appointments.filter((a) => a.status === 'completed' || a.status === 'cancelled' || a.appointment_date < todayLocal);

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
              className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
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
            <AppointmentList
              appointments={upcoming}
              onCancel={handleCancel}
              cancellingId={cancellingId}
              onResend={handleResend}
              resendingId={resendingId}
              resendStatus={resendStatus}
            />
          )}
        </div>

        {/* Past appointments */}
        {!loading && !error && (
          <div className="mt-10">
            <h2 className="font-serif text-xl font-semibold">Past Appointments</h2>
            {past.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border py-10 text-center">
                <p className="text-muted-foreground">No appointments made previously.</p>
              </div>
            ) : (
              <AppointmentList appointments={past} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface AppointmentListProps {
  appointments: CustomerAppointment[];
  onCancel?: (appt: CustomerAppointment) => void;
  cancellingId?: string | null;
  onResend?: (appt: CustomerAppointment) => void;
  resendingId?: string | null;
  resendStatus?: Record<string, 'sent' | 'error'>;
}

function AppointmentList({
  appointments,
  onCancel,
  cancellingId,
  onResend,
  resendingId,
  resendStatus,
}: AppointmentListProps) {
  const showActions = !!onCancel || !!onResend;
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">Date & Time</th>
            <th className="px-4 py-3 text-left font-medium">Service</th>
            <th className="px-4 py-3 text-left font-medium">Stylist</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            {showActions && <th className="px-4 py-3 text-right font-medium">Actions</th>}
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
              {showActions && (
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {onResend && (
                      <button
                        onClick={() => onResend(appt)}
                        disabled={resendingId === appt.id || resendStatus?.[appt.id] === 'sent'}
                        className="rounded-full border border-border px-3 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resendingId === appt.id
                          ? 'Sending…'
                          : resendStatus?.[appt.id] === 'sent'
                          ? 'Sent ✓'
                          : 'Resend Email'}
                      </button>
                    )}
                    {onCancel && (
                      <button
                        onClick={() => onCancel(appt)}
                        disabled={cancellingId === appt.id}
                        className="rounded-full border border-rose-300 px-3 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {cancellingId === appt.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
