import { ApiError, apiFetch } from './client';
import type { Appointment, AppointmentStatus, BlockedSlot } from '@luxe/shared';

/** The columns GET /api/admin/appointments returns (see api/_lib/adminAppointments ADMIN_COLUMNS). */
export type AdminAppointment = Pick<
  Appointment,
  | 'id'
  | 'stylist_id'
  | 'service_id'
  | 'client_name'
  | 'client_email'
  | 'client_phone'
  | 'appointment_date'
  | 'appointment_time'
  | 'duration_min'
  | 'notes'
  | 'status'
  | 'created_at'
> & {
  services: { name: string; category: string } | null;
  stylists: { name: string } | null;
};

export type AppointmentView = 'upcoming' | 'past' | 'all';
export type DatePeriod = 'today' | 'tomorrow' | 'week' | 'month';

export interface AppointmentFilters {
  view?: AppointmentView;
  range?: DatePeriod;
  from?: string;
  to?: string;
  /** Absent = everything except cancelled; 'any' = include cancelled. */
  status?: AppointmentStatus | 'any';
  stylist_id?: string;
  service_id?: string;
  q?: string;
}

export interface AppointmentPage {
  appointments: AdminAppointment[];
  total: number;
  offset: number;
  limit: number;
  /** The salon's date (New York), from the server. */
  today: string;
}

export interface AppointmentExport {
  appointments: AdminAppointment[];
  total: number;
  truncated: boolean;
  today: string;
}

export interface AppointmentSummary {
  today: string;
  week: { from: string; to: string };
  month: { from: string; to: string };
  counts: { today: number; week: number; month: number; upcoming: number };
}

export type CancelEmailOutcome =
  | { status: 'sent' }
  | { status: 'failed' }
  | { status: 'skipped'; reason: 'past' | 'already_cancelled' };

export interface StatusUpdateResult {
  appointment: AdminAppointment;
  /** Present only when the request was a cancellation. */
  email?: CancelEmailOutcome;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.toString();
}

export function listAdminAppointments(
  filters: AppointmentFilters,
  offset: number,
  token: string,
  signal?: AbortSignal
): Promise<AppointmentPage> {
  return apiFetch<AppointmentPage>(
    `/api/admin/appointments?${toQuery({ ...filters, offset: offset || undefined })}`,
    { token, signal }
  );
}

/** Every booking matching the filters (not just the loaded page), for CSV. */
export function exportAdminAppointments(
  filters: AppointmentFilters,
  token: string
): Promise<AppointmentExport> {
  return apiFetch<AppointmentExport>(
    `/api/admin/appointments?${toQuery({ ...filters, export: '1' })}`,
    { token }
  );
}

/**
 * "Is this login the owner's, with two-step verification done?" Resolves when
 * it is. Otherwise rejects with ApiError: 401 (not signed in / expired), or
 * 403 with `data.code` 'NOT_OWNER', 'MFA_REQUIRED' or 'FACTOR_NOT_APPROVED'
 * (two-step done, but with an authenticator not yet approved by the site
 * administrator), or 503 when the check itself could not run. The admin
 * screens ask this instead of carrying the owner's identity in the public JS.
 */
export function getAdminWhoAmI(token: string): Promise<{ owner: true }> {
  return apiFetch<{ owner: true }>('/api/admin/appointments?me=1', { token });
}

export type AdminDenialCode = 'NOT_OWNER' | 'MFA_REQUIRED' | 'FACTOR_NOT_APPROVED';
const DENIAL_CODES: readonly unknown[] = ['NOT_OWNER', 'MFA_REQUIRED', 'FACTOR_NOT_APPROVED'];

/** The server's reason for refusing an admin request, if it gave one. */
export function adminDenial(err: unknown): AdminDenialCode | 'UNAUTHENTICATED' | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 401) return 'UNAUTHENTICATED';
  const code = (err.data as { code?: unknown } | undefined)?.code;
  return err.status === 403 && DENIAL_CODES.includes(code) ? (code as AdminDenialCode) : null;
}

export function getAppointmentSummary(token: string): Promise<AppointmentSummary> {
  return apiFetch<AppointmentSummary>('/api/admin/appointments?summary=1', { token });
}

export function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  token: string
): Promise<StatusUpdateResult> {
  return apiFetch<StatusUpdateResult>(`/api/admin/appointments?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    token,
  });
}

export function createBlockedSlot(
  data: Omit<BlockedSlot, 'id' | 'created_at'>,
  token: string
): Promise<BlockedSlot> {
  return apiFetch<BlockedSlot>('/api/admin/blocked-slots', {
    method: 'POST',
    body: JSON.stringify(data),
    token,
  });
}

export function getBlockedSlots(
  filters: { stylist_id?: string; date?: string },
  token: string
): Promise<BlockedSlot[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v != null) as [string, string][]
    )
  );
  return apiFetch<BlockedSlot[]>(`/api/admin/blocked-slots?${query}`, { token });
}

export function deleteBlockedSlot(id: string, token: string): Promise<void> {
  return apiFetch<void>(`/api/admin/blocked-slots?id=${id}`, {
    method: 'DELETE',
    token,
  });
}
