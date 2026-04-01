import { apiFetch } from './client';
import type { Stylist } from '@luxe/shared';

export async function getStylists(): Promise<Stylist[]> {
  return apiFetch<Stylist[]>('/api/stylists');
}
