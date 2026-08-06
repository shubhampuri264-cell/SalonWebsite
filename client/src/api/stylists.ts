import { apiFetch } from './client';
import type { Stylist } from '@luxe/shared';

/**
 * Active stylists. Pass a serviceId to get only those who perform it — the
 * booking wizard always does, so a customer is never offered a stylist the
 * booking API would reject.
 */
export async function getStylists(serviceId?: string): Promise<Stylist[]> {
  const query = serviceId ? `?service_id=${encodeURIComponent(serviceId)}` : '';
  return apiFetch<Stylist[]>(`/api/stylists${query}`);
}
