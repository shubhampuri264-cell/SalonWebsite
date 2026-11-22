import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Ban, Phone, Scissors } from 'lucide-react';
import {
  getAppointmentSummary,
  listAdminAppointments,
  type AdminAppointment,
  type AppointmentSummary,
} from '@/api/admin';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatTime } from '@/utils/dates';
import { cn } from '@/utils/cn';
import { Banner, PageSpinner, StatusBadge, toFailure, type Feedback } from './adminUi';

// Every number here is counted by the server (GET ?summary=1): New York
// dates, Monday-Sunday weeks, cancelled bookings excluded. The browser does no
// date maths, so a phone's timezone or clock cannot change the totals.

interface OverviewData {
  summary: AppointmentSummary;
  today: AdminAppointment[];
  todayTotal: number;
}

export default function AdminOverview() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';

  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<Feedback | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setError(null);
    Promise.all([
      getAppointmentSummary(token),
      listAdminAppointments({ view: 'upcoming', range: 'today' }, 0, token),
    ])
      .then(([summary, todayPage]) => {
        if (cancelled) return;
        setData({ summary, today: todayPage.appointments, todayTotal: todayPage.total });
      })
      .catch((err) => {
        if (cancelled) return;
        // A failed load is an error on screen, never a row of zeros.
        setData(null);
        setError(toFailure(err, "Couldn't load bookings", { action: 'overview', changes: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadTick]);

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold md:text-3xl">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data ? formatDate(data.summary.today) : ' '}
      </p>

      {error ? (
        <Banner
          className="mt-6"
          feedback={error}
          action={
            !(error.kind === 'error' && error.expired) && (
              <button
                type="button"
                onClick={() => setReloadTick((n) => n + 1)}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            )
          }
        />
      ) : !data ? (
        <PageSpinner />
      ) : (
        <>
          {/* Tiles: 2x2 on a phone, one row from lg. Each opens the list it counts. */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Today" value={data.summary.counts.today} color="text-rose-700" to="/admin/appointments?range=today" />
            <StatCard label="This week" value={data.summary.counts.week} color="text-purple-700" to="/admin/appointments?view=all&range=week" />
            <StatCard label="This month" value={data.summary.counts.month} color="text-blue-700" to="/admin/appointments?view=all&range=month" />
            <StatCard label="Upcoming" value={data.summary.counts.upcoming} color="text-green-700" to="/admin/appointments" />
          </div>

          {/* Today's appointments */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold">Today's appointments</h2>
              <Link to="/admin/appointments" className="shrink-0 text-sm font-medium text-rose-600 hover:underline">
                All bookings
              </Link>
            </div>
            {data.today.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No appointments scheduled for today.</p>
            ) : (
              <>
                {/* Phone: cards */}
                <ul className="mt-3 space-y-2.5 md:hidden">
                  {data.today.map((appt) => (
                    <li key={appt.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-white p-4">
                      <div className="min-w-0">
                        <p className="text-lg font-semibold leading-tight">{formatTime(appt.appointment_time)}</p>
                        <p className="mt-1 break-words font-medium">{appt.client_name}</p>
                        <p className="mt-0.5 break-words text-sm text-muted-foreground">
                          {appt.services?.name ?? 'Appointment'} · {appt.stylists?.name ?? 'Any stylist'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge status={appt.status} />
                        {appt.client_phone && (
                          <a
                            href={`tel:${appt.client_phone}`}
                            className="flex h-10 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:bg-muted"
                            aria-label={`Call ${appt.client_name}`}
                          >
                            <Phone className="h-4 w-4" aria-hidden="true" />
                            Call
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* md and up: table */}
                <div className="mt-3 hidden overflow-x-auto rounded-xl border border-border bg-white md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-left">
                        <th scope="col" className="px-4 py-3 font-medium">Time</th>
                        <th scope="col" className="px-4 py-3 font-medium">Client</th>
                        <th scope="col" className="px-4 py-3 font-medium">Service</th>
                        <th scope="col" className="px-4 py-3 font-medium">Stylist</th>
                        <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.today.map((appt) => (
                        <tr key={appt.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-sm">{formatTime(appt.appointment_time)}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{appt.client_name}</p>
                            <p className="text-xs text-muted-foreground">{appt.client_phone}</p>
                          </td>
                          <td className="px-4 py-3">{appt.services?.name ?? '-'}</td>
                          <td className="px-4 py-3">{appt.stylists?.name ?? '-'}</td>
                          <td className="px-4 py-3"><StatusBadge status={appt.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.todayTotal > data.today.length && (
                  <Link to="/admin/appointments?range=today" className="mt-3 inline-block text-sm font-medium text-rose-600 hover:underline">
                    See all {data.todayTotal} of today's bookings
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Quick links */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <QuickLink to="/admin/appointments" icon={Calendar} label="Appointments" />
            <QuickLink to="/admin/services" icon={Scissors} label="Services & Prices" />
            <QuickLink to="/admin/blocked-slots" icon={Ban} label="Block Slots" />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, to }: { label: string; value: number; color: string; to: string }) {
  return (
    <Link to={to} className="rounded-xl border border-border bg-white p-4 transition-colors hover:border-rose-300">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold', color)}>{value}</p>
    </Link>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Calendar; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 transition-all hover:border-rose-300 hover:shadow-xs"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
        <Icon className="h-5 w-5 text-rose-600" aria-hidden="true" />
      </div>
      <span className="font-medium">{label}</span>
    </Link>
  );
}
