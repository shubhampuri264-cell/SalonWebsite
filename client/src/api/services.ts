import { apiFetch } from './client';
import type { Service, ServiceCategory } from '@luxe/shared';

export function getServices(): Promise<Record<ServiceCategory, Service[]>> {
  return apiFetch<Record<ServiceCategory, Service[]>>('/api/services');
}
