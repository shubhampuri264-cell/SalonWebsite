import { apiFetch } from './client';
import type { CreateAppointmentPayload, CreateAppointmentResponse } from '@luxe/shared';

export function createAppointment(
  payload: CreateAppointmentPayload
): Promise<CreateAppointmentResponse> {
  return apiFetch<CreateAppointmentResponse>('/api/appointments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cancelAppointment(token: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/appointments/cancel?token=${token}`);
}
