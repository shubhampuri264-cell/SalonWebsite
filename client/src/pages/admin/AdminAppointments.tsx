import { useEffect, useState } from 'react';
import { getAdminAppointments, updateAppointmentStatus } from '@/api/admin';
import { useAuthStore } from '@/store/authStore';
import { APPOINTMENT_STATUS_LABELS } from '@luxe/shared';
import type { AppointmentStatus } from '@luxe/shared';
import { formatDate, formatTime } from '@/utils/dates';
import { cn } from '@/utils/cn';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  no_show: 'bg-gray-100 text-gray-700',
};

export default function AdminAppointments() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';

  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | ''>('');
  const [filterDate, setFilterDate] = useState('');

  const load = () => {
    setLoading(true);
    getAdminAppointments(
      {
        ...(filterStatus ? { status: filterStatus } : {}),
        ...(filterDate ? { date: filterDate } : {}),
      },
      token
    )
      .then(setAppointments)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filterStatus, filterDate, token]);

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    try {
      await updateAppointmentStatus(id, status, token);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Appointments</h1>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
          aria-label="Filter by date"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as AppointmentStatus | '')}
          className="rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {(filterDate || filterStatus) && (
          <button
            onClick={() => {
              setFilterDate('');
              setFilterStatus('');
            }}
            className="text-sm text-rose-600 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-white">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
          </div>
        ) : appointments.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No appointments found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Client</th>
                <th className="px-4 py-3 text-left font-medium">Service</th>
                <th className="px-4 py-3 text-left font-medium">Stylist</th>
                <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => (
                <tr key={appt.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{appt.client_name}</p>
                    <p className="text-xs text-muted-foreground">{appt.client_email}</p>
                  </td>
                  <td className="px-4 py-3">{appt.services?.name ?? '—'}</td>
                  <td className="px-4 py-3">{appt.stylists?.name ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(appt.appointment_date)}{' '}
                    <span className="text-muted-foreground">
                      {formatTime(appt.appointment_time)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        STATUS_COLORS[appt.status as AppointmentStatus]
                      )}
                    >
                      {APPOINTMENT_STATUS_LABELS[appt.status as AppointmentStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={appt.status}
                      onChange={(e) =>
                        handleStatusChange(appt.id, e.target.value as AppointmentStatus)
                      }
                      className="rounded-lg border border-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-rose-400"
                      aria-label={`Update status for ${appt.client_name}`}
                    >
                      {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
