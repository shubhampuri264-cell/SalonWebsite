import { apiFetch } from './client';
import type { Stylist } from '@luxe/shared';

export function getStylists(): Promise<Stylist[]> {
  return apiFetch<Stylist[]>('/api/stylists');
}
