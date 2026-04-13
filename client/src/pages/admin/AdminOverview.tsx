import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Ban, Scissors } from 'lucide-react';
import { getAdminAppointments, type AdminAppointment } from '@/api/admin';
import { useAuthStore } from '@/store/authStore';
import { APPOINTMENT_STATUS_LABELS } from '@luxe/shared';
import type { AppointmentStatus } from '@luxe/shared';
import { formatTime } from '@/utils/dates';
import { cn } from '@/utils/cn';

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  no_show: 'bg-gray-100 text-gray-700',
};

export default function AdminOverview() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';

  const [todayAppts, setTodayAppts] = useState<AdminAppointment[]>([]);
  const [allAppts, setAllAppts] = useState<AdminAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const today = toYmd(new Date());

  useEffect(() => {
    if (!token) return;

    Promise.all([
      getAdminAppointments({ date: today }, token),
      getAdminAppointments({}, token),
    ])
      .then(([todays, all]) => {
        setTodayAppts(todays);
        setAllAppts(all);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, today]);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = allAppts.filter((a) => {
    const [y, m, d] = a.appointment_date.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date >= weekStart;
  });

  const thisMonth = allAppts.filter((a) => {
    const [y, m] = a.appointment_date.split('-').map(Number);
    const now = new Date();
    return y === now.getFullYear() && m === now.getMonth() + 1;
  });

  const pending = allAppts.filter((a) => a.status === 'pending');

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* Stats */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={todayAppts.length} color="text-rose-700" />
        <StatCard label="This Week" value={thisWeek.length} color="text-purple-700" />
        <StatCard label="This Month" value={thisMonth.length} color="text-blue-700" />
        <StatCard label="Pending Action" value={pending.length} color="text-yellow-700" />
      </div>

      {/* Quick links */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link
          to="/admin/appointments"
          className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 hover:border-rose-300 hover:shadow-sm transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
            <Calendar className="h-5 w-5 text-rose-600" />
          </div>
          <span className="font-medium">Appointments</span>
        </Link>
        <Link
          to="/admin/services"
          className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 hover:border-rose-300 hover:shadow-sm transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
            <Scissors className="h-5 w-5 text-rose-600" />
          </div>
          <span className="font-medium">Services & Prices</span>
        </Link>
        <Link
          to="/admin/blocked-slots"
          className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 hover:border-rose-300 hover:shadow-sm transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
            <Ban className="h-5 w-5 text-rose-600" />
          </div>
          <span className="font-medium">Block Slots</span>
        </Link>
      </div>

      {/* Today's appointments */}
      <div className="mt-8">
        <h2 className="font-serif text-xl font-semibold">Today's Appointments</h2>
        {todayAppts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No appointments scheduled for today.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Client</th>
                  <th className="px-4 py-3 text-left font-medium">Service</th>
                  <th className="px-4 py-3 text-left font-medium">Stylist</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {todayAppts.map((appt) => (
                  <tr key={appt.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-sm">{formatTime(appt.appointment_time)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{appt.client_name}</p>
                      <p className="text-xs text-muted-foreground">{appt.client_phone}</p>
                    </td>
                    <td className="px-4 py-3">{appt.services?.name ?? '-'}</td>
                    <td className="px-4 py-3">{appt.stylists?.name ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[appt.status as AppointmentStatus])}>
                        {APPOINTMENT_STATUS_LABELS[appt.status as AppointmentStatus]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold', color)}>{value}</p>
    </div>
  );
}
