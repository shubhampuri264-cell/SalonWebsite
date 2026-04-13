import { apiFetch } from './client';
import type { AnyoneAvailabilitySlot } from '@luxe/shared';

export interface AvailabilityResponse {
  slots: AnyoneAvailabilitySlot[];
  message?: string;
}

export function getAvailability(params: {
  date: string;
  service_id: string;
  stylist_id?: string;
}): Promise<AvailabilityResponse> {
  const query = new URLSearchParams({
    date: params.date,
    service_id: params.service_id,
    ...(params.stylist_id ? { stylist_id: params.stylist_id } : {}),
  });
  return apiFetch<AvailabilityResponse>(`/api/availability?${query}`);
}
