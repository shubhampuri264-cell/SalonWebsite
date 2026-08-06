import { apiFetch } from './client';

export interface AvailabilityResponse {
  slots: { time: string }[];
  message?: string;
}

/**
 * `stylist_id` is required: the endpoint returns one named stylist's free
 * slots. It used to accept "anyone" and union the whole roster, which showed
 * times nobody who does the service was actually free for.
 */
export function getAvailability(params: {
  date: string;
  service_id: string;
  stylist_id: string;
}): Promise<AvailabilityResponse> {
  const query = new URLSearchParams(params);
  return apiFetch<AvailabilityResponse>(`/api/availability?${query}`);
}
