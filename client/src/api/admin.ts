import { apiFetch } from './client';
import type { Appointment, AppointmentStatus, BlockedSlot } from '@luxe/shared';

interface AdminAppointment extends Appointment {
  services: { name: string; category: string } | null;
  stylists: { name: string } | null;
}

export function getAdminAppointments(
  filters: { date?: string; status?: AppointmentStatus; stylist_id?: string },
  token: string
): Promise<AdminAppointment[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v != null) as [string, string][]
    )
  );
  return apiFetch<AdminAppointment[]>(`/api/admin/appointments?${query}`, { token });
}

export function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  token: string
): Promise<Appointment> {
  return apiFetch<Appointment>(`/api/admin/appointments?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    token,
  });
}

export function deleteAppointment(id: string, token: string): Promise<void> {
  return apiFetch<void>(`/api/admin/appointments?id=${id}`, {
    method: 'DELETE',
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
