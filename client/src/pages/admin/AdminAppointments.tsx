import { useEffect, useMemo, useState } from 'react';
import {
  getAdminAppointments,
  updateAppointmentStatus,
  type AdminAppointment,
} from '@/api/admin';
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

type QuickDateFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'custom';

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function inCurrentWeek(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const dayOfWeek = today.getDay();
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  const weekEnd = addDays(weekStart, 6);
  weekStart.setHours(0, 0, 0, 0);
  weekEnd.setHours(23, 59, 59, 999);
  return date >= weekStart && date <= weekEnd;
}

function toCsvValue(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function AdminAppointments() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';

  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | ''>('');
  const [filterDate, setFilterDate] = useState('');
  const [quickDate, setQuickDate] = useState<QuickDateFilter>('all');

  const load = () => {
    setLoading(true);
    setError(null);
    getAdminAppointments(
      {
        ...(filterStatus ? { status: filterStatus } : {}),
        ...(filterDate ? { date: filterDate } : {}),
      },
      token
    )
      .then(setAppointments)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load appointments');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterDate, token]);

  useEffect(() => {
    const today = new Date();
    if (quickDate === 'today') {
      setFilterDate(toYmd(today));
    } else if (quickDate === 'tomorrow') {
      setFilterDate(toYmd(addDays(today, 1)));
    } else if (quickDate === 'all' || quickDate === 'week') {
      setFilterDate('');
    }
  }, [quickDate]);

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

  const visibleAppointments = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    return appointments.filter((appt) => {
      if (quickDate === 'week' && !inCurrentWeek(appt.appointment_date)) {
        return false;
      }

      if (!needle) return true;

      const haystack = [
        appt.client_name,
        appt.client_email,
        appt.client_phone,
        appt.services?.name ?? '',
        appt.stylists?.name ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [appointments, quickDate, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: visibleAppointments.length,
      pending: visibleAppointments.filter((a) => a.status === 'pending').length,
      confirmed: visibleAppointments.filter((a) => a.status === 'confirmed').length,
      completed: visibleAppointments.filter((a) => a.status === 'completed').length,
    };
  }, [visibleAppointments]);

  const exportCsv = () => {
    if (!visibleAppointments.length) return;

    const rows = [
      [
        'Client',
        'Email',
        'Phone',
        'Service',
        'Stylist',
        'Date',
        'Time',
        'Status',
        'Notes',
      ],
      ...visibleAppointments.map((appt) => [
        appt.client_name,
        appt.client_email,
        appt.client_phone,
        appt.services?.name ?? '',
        appt.stylists?.name ?? '',
        appt.appointment_date,
        appt.appointment_time,
        appt.status,
        appt.notes ?? '',
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => toCsvValue(String(value))).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `appointments-${toYmd(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Appointments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        View, update, and export all client bookings from one screen.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
          <p className="mt-2 text-2xl font-semibold text-yellow-700">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed</p>
          <p className="mt-2 text-2xl font-semibold text-green-700">{stats.confirmed}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed</p>
          <p className="mt-2 text-2xl font-semibold text-blue-700">{stats.completed}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by client, phone, service, or stylist"
          className="min-w-[260px] flex-1 rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
          aria-label="Search appointments"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'today', label: 'Today' },
            { key: 'tomorrow', label: 'Tomorrow' },
            { key: 'week', label: 'This Week' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setQuickDate(key as QuickDateFilter)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                quickDate === key
                  ? 'border-rose-500 bg-rose-50 text-rose-700'
                  : 'border-border bg-white text-foreground/70 hover:bg-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => {
            setFilterDate(e.target.value);
            setQuickDate('custom');
          }}
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
        <button
          onClick={exportCsv}
          disabled={visibleAppointments.length === 0}
          className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>
        {(filterDate || filterStatus || searchTerm || quickDate !== 'all') && (
          <button
            onClick={() => {
              setFilterDate('');
              setFilterStatus('');
              setSearchTerm('');
              setQuickDate('all');
            }}
            className="text-sm text-rose-600 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-white">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-destructive">{error}</p>
        ) : visibleAppointments.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No appointments found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Client</th>
                <th className="px-4 py-3 text-left font-medium">Service</th>
                <th className="px-4 py-3 text-left font-medium">Stylist</th>
                <th className="px-4 py-3 text-left font-medium">Date and Time</th>
                <th className="px-4 py-3 text-left font-medium">Notes</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAppointments.map((appt) => (
                <tr key={appt.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{appt.client_name}</p>
                    <p className="text-xs text-muted-foreground">{appt.client_email}</p>
                    <p className="text-xs text-muted-foreground">{appt.client_phone}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <a
                        href={`mailto:${appt.client_email}`}
                        className="text-xs text-rose-600 underline"
                      >
                        Email
                      </a>
                      <a
                        href={`tel:${appt.client_phone}`}
                        className="text-xs text-rose-600 underline"
                      >
                        Call
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3">{appt.services?.name ?? '-'}</td>
                  <td className="px-4 py-3">{appt.stylists?.name ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(appt.appointment_date)}{' '}
                    <span className="text-muted-foreground">
                      {formatTime(appt.appointment_time)}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {appt.notes || 'No notes'}
                    </p>
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
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleStatusChange(appt.id, 'confirmed')}
                        className="rounded-md border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleStatusChange(appt.id, 'completed')}
                        className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handleStatusChange(appt.id, 'cancelled')}
                        className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        Cancel
                      </button>
                      <select
                        value={appt.status}
                        onChange={(e) =>
                          handleStatusChange(appt.id, e.target.value as AppointmentStatus)
                        }
                        className="rounded-md border border-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-rose-400"
                        aria-label={`Update status for ${appt.client_name}`}
                      >
                        {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
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
