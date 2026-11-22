import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Mail, MoreHorizontal, Phone, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  exportAdminAppointments,
  listAdminAppointments,
  updateAppointmentStatus,
  type AdminAppointment,
  type AppointmentFilters,
  type AppointmentView,
  type DatePeriod,
  type StatusUpdateResult,
} from '@/api/admin';
import { getStylists } from '@/api/stylists';
import { getAdminServices } from '@/api/adminServices';
import { useAuthStore } from '@/store/authStore';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type AppointmentStatus,
  type Service,
  type Stylist,
} from '@luxe/shared';
import { formatTime, salonToday } from '@/utils/dates';
import { cn } from '@/utils/cn';
import {
  ActionToast,
  Banner,
  ConfirmBody,
  PageSpinner,
  Sheet,
  Spinner,
  StatusBadge,
  dayHeading,
  shortDate,
  toFailure,
  type ConfirmRequest,
  type Feedback,
} from './adminUi';

// ---------------------------------------------------------------------------
// Filters live in the URL, so refresh and Back keep them.
// ---------------------------------------------------------------------------

const VIEWS: { key: AppointmentView; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

const PERIODS: { key: DatePeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors api/_lib/adminAppointments SEARCH_ALLOWED. The server is the
// authority (it rejects anything else); this only lets the screen explain
// instead of firing a request that would come back 400.
const SEARCH_ALLOWED = /^[\p{L}\p{M}\p{N} @.'+_()-]*$/u;
const SEARCH_MAX_LENGTH = 64;

const normalizeSearch = (value: string) => value.replace(/\s+/g, ' ').trim();
const isValidSearch = (value: string) =>
  value === '' ||
  (value.length <= SEARCH_MAX_LENGTH && SEARCH_ALLOWED.test(value) && /[\p{L}\p{N}]/u.test(value));

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** URL -> API filters. Junk in a hand-edited URL is dropped, not sent. */
function readFilters(params: URLSearchParams): AppointmentFilters {
  const range = oneOf(params.get('range'), PERIODS.map((p) => p.key));
  const matches = (key: string, re: RegExp) => {
    const value = params.get(key);
    return value && re.test(value) ? value : undefined;
  };
  let from = range ? undefined : matches('from', YMD);
  let to = range ? undefined : matches('to', YMD);
  if (from && to && from > to) [from, to] = [to, from];
  const q = normalizeSearch(params.get('q') ?? '');

  return {
    view: oneOf(params.get('view'), VIEWS.map((v) => v.key)),
    range,
    from,
    to,
    status: oneOf(params.get('status'), [...APPOINTMENT_STATUSES, 'any' as const]),
    stylist_id: matches('stylist', UUID),
    service_id: matches('service', UUID),
    q: q && isValidSearch(q) ? q : undefined,
  };
}

const URL_KEYS: Record<keyof AppointmentFilters, string> = {
  view: 'view',
  range: 'range',
  from: 'from',
  to: 'to',
  status: 'status',
  stylist_id: 'stylist',
  service_id: 'service',
  q: 'q',
};

// ---------------------------------------------------------------------------
// Status actions
// ---------------------------------------------------------------------------

type ActionKey = 'confirm' | 'complete' | 'no_show' | 'cancel' | 'restore';

const ACTIONS: Record<ActionKey, { status: AppointmentStatus; label: string; destructive?: boolean }> = {
  confirm: { status: 'confirmed', label: 'Mark confirmed' },
  complete: { status: 'completed', label: 'Mark completed' },
  no_show: { status: 'no_show', label: 'Mark no-show' },
  cancel: { status: 'cancelled', label: 'Cancel booking', destructive: true },
  restore: { status: 'confirmed', label: 'Restore booking' },
};

function actionsFor(status: AppointmentStatus): ActionKey[] {
  if (status === 'cancelled') return ['restore'];
  const keys: ActionKey[] = [];
  if (status !== 'confirmed') keys.push('confirm');
  if (status !== 'completed') keys.push('complete');
  if (status !== 'no_show') keys.push('no_show');
  keys.push('cancel');
  return keys;
}

/** Whether a booking with this status is in the list the server returns for `filter`. */
function inStatusFilter(status: AppointmentStatus, filter: AppointmentFilters['status']): boolean {
  if (!filter) return status !== 'cancelled';
  return filter === 'any' || filter === status;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function bookingSummary(appt: AdminAppointment, today: string): string {
  const service = appt.services?.name ?? 'Appointment';
  return `${appt.client_name} – ${service}, ${shortDate(appt.appointment_date, today)}, ${formatTime(appt.appointment_time)}`;
}

const salonClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Display hint for the confirm text only. The server makes the real decision
 * about whether a cancellation is emailed, and the result banner reports it.
 */
function hasStarted(appt: AdminAppointment): boolean {
  const today = salonToday();
  if (appt.appointment_date !== today) return appt.appointment_date < today;
  const [h, m] = salonClock.format(new Date()).split(':').map(Number);
  const [ah, am] = appt.appointment_time.split(':').map(Number);
  return ah * 60 + am <= h * 60 + m;
}

function confirmRequest(action: ActionKey, appt: AdminAppointment, today: string): ConfirmRequest {
  const summary = bookingSummary(appt, today);
  const first = firstName(appt.client_name);
  switch (action) {
    case 'cancel':
      return {
        title: `Cancel ${summary}?`,
        body: hasStarted(appt)
          ? `The appointment time has passed, so ${first} won't be emailed.`
          : `${first} will get a cancellation email.`,
        cancelLabel: 'Keep booking',
        confirmLabel: 'Cancel booking',
        destructive: true,
      };
    case 'restore':
      return {
        title: `Restore ${summary}?`,
        body: `It goes back to Confirmed. No email is sent, so let ${first} know yourself.`,
        cancelLabel: 'Back',
        confirmLabel: 'Restore booking',
      };
    case 'confirm':
      return { title: `Mark ${summary} as confirmed?`, body: 'No email is sent.', cancelLabel: 'Back', confirmLabel: 'Mark confirmed' };
    case 'complete':
      return { title: `Mark ${summary} as completed?`, body: 'No email is sent.', cancelLabel: 'Back', confirmLabel: 'Mark completed' };
    case 'no_show':
      return { title: `Mark ${summary} as a no-show?`, body: 'No email is sent.', cancelLabel: 'Back', confirmLabel: 'Mark no-show' };
  }
}

function failureText(action: ActionKey, name: string): string {
  switch (action) {
    case 'cancel':
      return `Couldn't cancel ${name}'s booking`;
    case 'restore':
      return `Couldn't restore ${name}'s booking`;
    case 'confirm':
      return `Couldn't mark ${name}'s booking confirmed`;
    case 'complete':
      return `Couldn't mark ${name}'s booking completed`;
    case 'no_show':
      return `Couldn't mark ${name}'s booking as a no-show`;
  }
}

function successFeedback(action: ActionKey, appt: AdminAppointment, result: StatusUpdateResult): Feedback {
  const name = appt.client_name;
  const first = firstName(name);
  if (action === 'cancel') {
    const email = result.email;
    if (email?.status === 'sent') return { kind: 'success', message: `Cancelled – ${first} was emailed.` };
    if (email?.status === 'failed') {
      return {
        kind: 'warning',
        message: appt.client_phone ? (
          <>
            Cancelled, but the email failed – please call {first} at{' '}
            <a href={`tel:${appt.client_phone}`} className="font-semibold underline">
              {appt.client_phone}
            </a>
            .
          </>
        ) : (
          `Cancelled, but the email failed – please contact ${first} at ${appt.client_email}.`
        ),
      };
    }
    if (email?.status === 'skipped' && email.reason === 'already_cancelled') {
      return { kind: 'success', message: `${name}'s booking was already cancelled – no email sent.` };
    }
    return { kind: 'success', message: 'Cancelled. No email was sent because the appointment time had passed.' };
  }
  if (action === 'restore') return { kind: 'success', message: `Restored ${name}'s booking – it's confirmed again.` };
  return {
    kind: 'success',
    message: `${name}'s booking marked ${APPOINTMENT_STATUS_LABELS[ACTIONS[action].status].toLowerCase()}.`,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value: string): string {
  // A cell starting with = + - @ is run as a formula by Excel and Sheets, and
  // names and notes come straight off the public booking form. A value made
  // only of digits and phone punctuation ("+1 (718) 555-0101") cannot call a
  // function, so it is left alone rather than exported with a stray quote.
  const formulaLike = /^[=+\-@\t\r]/.test(value) && !/^[+-]?[\d\s().-]+$/.test(value);
  const safe = formulaLike ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadCsv(rows: AdminAppointment[], today: string) {
  const header = ['Date', 'Time', 'Client', 'Email', 'Phone', 'Service', 'Stylist', 'Status', 'Notes'];
  const lines = [
    header,
    ...rows.map((a) => [
      a.appointment_date,
      a.appointment_time,
      a.client_name,
      a.client_email,
      a.client_phone ?? '',
      a.services?.name ?? '',
      a.stylists?.name ?? '',
      APPOINTMENT_STATUS_LABELS[a.status],
      a.notes ?? '',
    ]),
  ].map((row) => row.map((v) => csvCell(String(v))).join(','));

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bookings-${today}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminAppointments() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const view = filters.view ?? 'upcoming';

  const setFilters = useCallback(
    (patch: Partial<AppointmentFilters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch) as [keyof AppointmentFilters, string | undefined][]) {
            if (value) next.set(URL_KEYS[key], value);
            else next.delete(URL_KEYS[key]);
          }
          // Default view is implied; keep the link short.
          if (next.get('view') === 'upcoming') next.delete('view');
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // --- list -----------------------------------------------------------------
  const [rows, setRows] = useState<AdminAppointment[]>([]);
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState(salonToday());
  const [loaded, setLoaded] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState<Feedback | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // Loaded rows that no longer match the filters on the server (e.g. a booking
  // cancelled while cancelled ones are hidden). They stay on screen with their
  // new status, but the server's paging no longer counts them.
  const [dropped, setDropped] = useState(0);
  // Bumped on every filter change, so a slow "Load more" from the previous
  // filters can never append to the new list.
  const generation = useRef(0);

  useEffect(() => {
    if (!token) return;
    const gen = ++generation.current;
    const controller = new AbortController();
    setFetching(true);
    listAdminAppointments(filters, 0, token, controller.signal)
      .then((page) => {
        setRows(page.appointments);
        setDropped(0);
        setTotal(page.total);
        setToday(page.today);
        setLoadError(null);
        setLoaded(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(toFailure(err, "Couldn't load bookings", { action: 'load', changes: false }));
      })
      .finally(() => {
        if (gen === generation.current) setFetching(false);
      });
    return () => controller.abort();
  }, [filters, token, reloadTick]);

  // After the first load, the old list stays on screen (dimmed) while the
  // next one loads, instead of a spinner flashing on every keystroke.
  const refreshing = loaded && fetching;

  const serverOffset = rows.length - dropped;

  const loadMore = () => {
    // While the list reloads, `rows` still belongs to the previous filters.
    if (fetching || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    listAdminAppointments(filters, serverOffset, token)
      .then((page) => {
        if (gen !== generation.current) return;
        setRows((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...page.appointments.filter((a) => !seen.has(a.id))];
        });
        setTotal(page.total);
      })
      .catch((err) => setFeedback(toFailure(err, "Couldn't load more bookings", { action: 'load-more', changes: false })))
      .finally(() => setLoadingMore(false));
  };

  // --- search (updates as she types) -------------------------------------------
  const [searchText, setSearchText] = useState(filters.q ?? '');
  const searchInvalid = !isValidSearch(normalizeSearch(searchText));
  // The last search this box wrote to the URL. A different q in the URL came
  // from elsewhere (the Appointments tab, Clear all, a link) and replaces the
  // box's text, instead of the box writing its old text back.
  const pushedQ = useRef(filters.q ?? '');
  useEffect(() => {
    const urlQ = filters.q ?? '';
    if (urlQ === pushedQ.current) return;
    pushedQ.current = urlQ;
    setSearchText(urlQ);
  }, [filters.q]);
  useEffect(() => {
    const term = normalizeSearch(searchText);
    if (term === pushedQ.current || !isValidSearch(term)) return;
    const timer = setTimeout(() => {
      pushedQ.current = term;
      setFilters({ q: term || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, setFilters]);

  // --- filter options -----------------------------------------------------------
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [optionsError, setOptionsError] = useState(false);
  useEffect(() => {
    if (!token) return;
    Promise.all([getStylists(), getAdminServices(token)])
      .then(([s, sv]) => {
        setStylists(s);
        setServices(sv);
      })
      .catch((err) => {
        toFailure(err, 'Filter options failed to load', { action: 'filter-options', changes: false });
        setOptionsError(true);
      });
  }, [token]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (filters.range || filters.from || filters.to ? 1 : 0) +
    (filters.stylist_id ? 1 : 0) +
    (filters.service_id ? 1 : 0) +
    (filters.status ? 1 : 0);

  const clearAll = () => {
    setSearchText('');
    setFilters({ range: undefined, from: undefined, to: undefined, status: undefined, stylist_id: undefined, service_id: undefined, q: undefined });
  };

  // --- actions ------------------------------------------------------------------
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const dismissFeedback = useCallback(() => setFeedback(null), []);
  const [sheet, setSheet] = useState<{ appt: AdminAppointment; action?: ActionKey } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const runAction = async (appt: AdminAppointment, action: ActionKey) => {
    if (savingId) return;
    setSavingId(appt.id);
    setFeedback(null);
    try {
      const result = await updateAppointmentStatus(appt.id, ACTIONS[action].status, token);
      // Only now, with the server's answer, does the row change.
      setRows((prev) => prev.map((a) => (a.id === appt.id ? result.appointment : a)));
      const delta =
        Number(inStatusFilter(result.appointment.status, filters.status)) -
        Number(inStatusFilter(appt.status, filters.status));
      if (delta) {
        setTotal((t) => t + delta);
        setDropped((d) => d - delta);
      }
      setFeedback(successFeedback(action, appt, result));
    } catch (err) {
      const failure = toFailure(err, failureText(action, appt.client_name), { action: `status:${action}` });
      setFeedback(failure);
      // No answer from the server: the change may have gone through. Reload
      // so she sees what the database now says, not a possibly stale row.
      if (failure.kind === 'error' && failure.uncertain) setReloadTick((n) => n + 1);
    } finally {
      setSavingId(null);
      setSheet(null);
    }
  };

  // --- export -------------------------------------------------------------------
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const result = await exportAdminAppointments(filters, token);
      downloadCsv(result.appointments, result.today);
      if (result.truncated) {
        setFeedback({
          kind: 'warning',
          message: `Exported the first ${result.appointments.length} of ${result.total} bookings. Narrow the filters to export the rest.`,
        });
      }
    } catch (err) {
      setFeedback(toFailure(err, "Couldn't export bookings", { action: 'export', changes: false }));
    } finally {
      setExporting(false);
    }
  };

  // --- derived ------------------------------------------------------------------
  const groups = useMemo(() => {
    const out: { date: string; items: AdminAppointment[] }[] = [];
    for (const appt of rows) {
      const last = out[out.length - 1];
      if (last?.date === appt.appointment_date) last.items.push(appt);
      else out.push({ date: appt.appointment_date, items: [appt] });
    }
    return out;
  }, [rows]);

  const noun = view === 'upcoming' ? 'upcoming booking' : view === 'past' ? 'past booking' : 'booking';
  const headline =
    loaded && !loadError ? `${total} ${noun}${total === 1 ? '' : 's'}` : fetching ? 'Loading bookings…' : '';
  const hasDateFilter = !!(filters.range || filters.from || filters.to);
  const narrowed = activeFilterCount > 0 || !!filters.q;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold md:text-3xl">Appointments</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {headline}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || !loaded || !!loadError || total === 0}
          className="flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? <Spinner /> : <Download className="h-4 w-4" aria-hidden="true" />}
          Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Which bookings" className="mt-4 grid grid-cols-3 rounded-full bg-muted p-1 md:inline-grid md:w-auto">
        {VIEWS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setFilters({ view: key })}
            className={cn(
              'h-10 rounded-full px-5 text-sm font-medium transition-colors',
              view === key ? 'bg-white text-rose-700 shadow-xs' : 'text-foreground/70 hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Name, email or phone"
            aria-label="Search bookings by client name, email or phone"
            aria-invalid={searchInvalid}
            aria-describedby={searchInvalid ? 'search-hint' : undefined}
            maxLength={SEARCH_MAX_LENGTH * 2}
            enterKeyHint="search"
            className="h-11 w-full rounded-full border border-input bg-white pl-9 pr-10 text-base outline-hidden focus:ring-2 focus:ring-rose-400 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-controls="booking-filters"
          className={cn(
            'flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium',
            activeFilterCount ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-border bg-white hover:bg-muted'
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
      {searchInvalid && (
        <p id="search-hint" className="mt-1.5 px-3 text-xs text-destructive">
          Search can use letters, numbers, spaces and @ . &apos; + _ ( ) -, needs at least one letter or number, and is up to {SEARCH_MAX_LENGTH} characters.
        </p>
      )}

      <FiltersPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        stylists={stylists}
        services={services}
        optionsError={optionsError}
        activeCount={activeFilterCount}
        onClearAll={clearAll}
      />

      {/* List */}
      <div className="mt-5">
        {!loaded && !loadError ? (
          <PageSpinner />
        ) : loadError ? (
          <Banner
            feedback={loadError}
            action={
              !(loadError.kind === 'error' && loadError.expired) && (
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
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-white px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {narrowed ? 'No bookings match.' : view === 'upcoming' ? 'No upcoming bookings.' : view === 'past' ? 'No past bookings.' : 'No bookings yet.'}
            </p>
            {hasDateFilter && view !== 'all' && (
              <p className="mt-1 text-xs text-muted-foreground">The {view} tab only shows {view === 'upcoming' ? 'today onward' : 'dates before today'}; try All.</p>
            )}
            {narrowed && (
              <button type="button" onClick={clearAll} className="mt-3 text-sm font-medium text-rose-600 underline">
                Clear search and filters
              </button>
            )}
          </div>
        ) : (
          <div className={cn('transition-opacity', refreshing && 'opacity-60')} aria-busy={refreshing}>
            {/* Phone and small tablet: cards grouped by day */}
            <div className="space-y-5 md:hidden">
              {groups.map((group) => (
                <section key={group.date} aria-label={dayHeading(group.date, today)}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dayHeading(group.date, today)}
                  </h2>
                  <ul className="space-y-2.5">
                    {group.items.map((appt) => (
                      <BookingCard
                        key={appt.id}
                        appt={appt}
                        saving={savingId === appt.id}
                        disabled={!!savingId}
                        onActions={() => setSheet({ appt })}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* md and up: table */}
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-white md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th scope="col" className="px-4 py-3 font-medium">When</th>
                    <th scope="col" className="px-4 py-3 font-medium">Client</th>
                    <th scope="col" className="px-4 py-3 font-medium">Service</th>
                    <th scope="col" className="px-4 py-3 font-medium">Stylist</th>
                    <th scope="col" className="px-4 py-3 font-medium">Notes</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((appt) => (
                    <tr key={appt.id} className={cn('border-b border-border last:border-0 hover:bg-muted/20', savingId === appt.id && 'opacity-60')}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-medium">{dayHeading(appt.appointment_date, today)}</p>
                        <p className="text-muted-foreground">{formatTime(appt.appointment_time)}</p>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="break-words font-medium">{appt.client_name}</p>
                        <a href={`mailto:${appt.client_email}`} className="block break-all text-xs text-rose-600 hover:underline">{appt.client_email}</a>
                        {appt.client_phone && (
                          <a href={`tel:${appt.client_phone}`} className="block text-xs text-rose-600 hover:underline">{appt.client_phone}</a>
                        )}
                      </td>
                      <td className="px-4 py-3">{appt.services?.name ?? '-'}</td>
                      <td className="px-4 py-3">{appt.stylists?.name ?? '-'}</td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="line-clamp-2 text-xs text-muted-foreground">{appt.notes || '—'}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={appt.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <ActionsButton
                          appt={appt}
                          saving={savingId === appt.id}
                          disabled={!!savingId}
                          onClick={() => setSheet({ appt })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {serverOffset} of {total}
              </p>
              {serverOffset < total && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore || fetching}
                  className="flex h-11 items-center gap-2 rounded-full border border-border bg-white px-6 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {loadingMore && <Spinner />}
                  Load more
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Booking actions, then the confirm step, in one sheet */}
      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        busy={!!savingId}
        labelledBy="booking-sheet-title"
      >
        {sheet &&
          (sheet.action ? (
            <ConfirmBody
              titleId="booking-sheet-title"
              request={confirmRequest(sheet.action, sheet.appt, today)}
              busy={savingId === sheet.appt.id}
              onConfirm={() => sheet.action && runAction(sheet.appt, sheet.action)}
              onClose={() => setSheet(null)}
            />
          ) : (
            <>
              <h2 id="booking-sheet-title" className="font-serif text-lg font-semibold leading-snug">
                {bookingSummary(sheet.appt, today)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                With {sheet.appt.stylists?.name ?? 'any stylist'} · <StatusBadge status={sheet.appt.status} />
              </p>
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={() => setSheet(null)}
                  className="h-11 rounded-full border border-border bg-white text-sm font-semibold hover:bg-muted"
                >
                  Close
                </button>
                {actionsFor(sheet.appt.status).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSheet({ appt: sheet.appt, action: key })}
                    className={cn(
                      'h-11 rounded-full text-sm font-semibold',
                      ACTIONS[key].destructive
                        ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-muted text-foreground hover:bg-stone-200'
                    )}
                  >
                    {ACTIONS[key].label}
                  </button>
                ))}
              </div>
            </>
          ))}
      </Sheet>

      <ActionToast feedback={feedback} onDismiss={dismissFeedback} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionsButton({
  appt,
  saving,
  disabled,
  onClick,
}: {
  appt: AdminAppointment;
  saving: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={saving}
      aria-label={`Actions for ${appt.client_name}`}
      aria-haspopup="dialog"
      title="Actions"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-white hover:bg-muted disabled:opacity-50"
    >
      {saving ? <Spinner /> : <MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}

function BookingCard({
  appt,
  saving,
  disabled,
  onActions,
}: {
  appt: AdminAppointment;
  saving: boolean;
  disabled: boolean;
  onActions: () => void;
}) {
  return (
    <li className={cn('rounded-xl border border-border bg-white p-4', saving && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{formatTime(appt.appointment_time)}</p>
          <p className="mt-1 break-words font-medium">{appt.client_name}</p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">
            {appt.services?.name ?? 'Appointment'} · {appt.stylists?.name ?? 'Any stylist'}
          </p>
        </div>
        <StatusBadge status={appt.status} />
      </div>
      {appt.notes && <p className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground">{appt.notes}</p>}
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
        {appt.client_phone ? (
          <a
            href={`tel:${appt.client_phone}`}
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600"
            aria-label={`Call ${appt.client_name}`}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            Call
          </a>
        ) : (
          <span />
        )}
        <a
          href={`mailto:${appt.client_email}`}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold hover:bg-muted"
          aria-label={`Email ${appt.client_name}`}
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Email
        </a>
        <ActionsButton appt={appt} saving={saving} disabled={disabled} onClick={onActions} />
      </div>
    </li>
  );
}

function FiltersPanel({
  open,
  onClose,
  filters,
  setFilters,
  stylists,
  services,
  optionsError,
  activeCount,
  onClearAll,
}: {
  open: boolean;
  onClose: () => void;
  filters: AppointmentFilters;
  setFilters: (patch: Partial<AppointmentFilters>) => void;
  stylists: Stylist[];
  services: Service[];
  optionsError: boolean;
  activeCount: number;
  onClearAll: () => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const dateMode = filters.range ?? (filters.from || filters.to || customOpen ? 'custom' : 'any');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const chip = (active: boolean) =>
    cn(
      'h-10 rounded-full border px-4 text-sm font-medium transition-colors',
      active ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-border bg-white text-foreground/80 hover:bg-muted'
    );
  const selectClass =
    'h-11 w-full rounded-lg border border-input bg-white px-3 text-base outline-hidden focus:ring-2 focus:ring-rose-400 md:text-sm';

  const setFrom = (from: string) => {
    setFilters({ range: undefined, from: from || undefined, ...(filters.to && from > filters.to ? { to: from } : {}) });
  };
  const setTo = (to: string) => {
    setFilters({ range: undefined, to: to || undefined, ...(filters.from && to && to < filters.from ? { from: to } : {}) });
  };

  return (
    <>
      {/* Phone: a sheet over a backdrop. md and up: inline under the toolbar. */}
      <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
      <section
        id="booking-filters"
        aria-label="Filters"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl motion-safe:animate-sheet-up',
          'md:static md:z-auto md:mt-3 md:max-h-none md:animate-none md:rounded-xl md:border md:border-border md:shadow-none'
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">
            Filters{activeCount > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{activeCount} active</span>}
          </h2>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <button type="button" onClick={onClearAll} className="h-10 rounded-full px-3 text-sm font-medium text-rose-600 hover:bg-rose-50">
                Clear all
              </button>
            )}
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label="Close filters">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Date</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={dateMode === 'any'}
              className={chip(dateMode === 'any')}
              onClick={() => {
                setCustomOpen(false);
                setFilters({ range: undefined, from: undefined, to: undefined });
              }}
            >
              Any date
            </button>
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={dateMode === key}
                className={chip(dateMode === key)}
                onClick={() => {
                  setCustomOpen(false);
                  setFilters({ range: key, from: undefined, to: undefined });
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={dateMode === 'custom'}
              className={chip(dateMode === 'custom')}
              onClick={() => {
                setCustomOpen(true);
                if (filters.range) setFilters({ range: undefined });
              }}
            >
              Custom range
            </button>
          </div>
          {dateMode === 'custom' && (
            <div className="mt-3 grid grid-cols-2 gap-2 md:max-w-md">
              <label className="text-xs font-medium text-muted-foreground">
                From
                <input type="date" value={filters.from ?? ''} onChange={(e) => setFrom(e.target.value)} className={cn(selectClass, 'mt-1')} />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                To
                <input type="date" value={filters.to ?? ''} min={filters.from} onChange={(e) => setTo(e.target.value)} className={cn(selectClass, 'mt-1')} />
              </label>
            </div>
          )}
        </fieldset>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Stylist
            <select
              value={filters.stylist_id ?? ''}
              onChange={(e) => setFilters({ stylist_id: e.target.value || undefined })}
              className={cn(selectClass, 'mt-1')}
            >
              <option value="">All stylists</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Service
            <select
              value={filters.service_id ?? ''}
              onChange={(e) => setFilters({ service_id: e.target.value || undefined })}
              className={cn(selectClass, 'mt-1')}
            >
              <option value="">All services</option>
              {SERVICE_CATEGORIES.map((cat) => {
                const inCat = services.filter((s) => s.category === cat);
                return inCat.length ? (
                  <optgroup key={cat} label={SERVICE_CATEGORY_LABELS[cat]}>
                    {inCat.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.is_active ? '' : ' (hidden)'}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          <label className="text-sm font-medium">
            Status
            <select
              value={filters.status ?? ''}
              onChange={(e) => setFilters({ status: (e.target.value || undefined) as AppointmentFilters['status'] })}
              className={cn(selectClass, 'mt-1')}
            >
              <option value="">All except cancelled</option>
              <option value="any">All, including cancelled</option>
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>Only {APPOINTMENT_STATUS_LABELS[s].toLowerCase()}</option>
              ))}
            </select>
          </label>
        </div>
        {optionsError && (
          <p className="mt-2 text-xs text-destructive">Couldn't load the stylist and service lists. Refresh to try again.</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-full bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600 md:hidden"
        >
          Show bookings
        </button>
      </section>
    </>
  );
}
