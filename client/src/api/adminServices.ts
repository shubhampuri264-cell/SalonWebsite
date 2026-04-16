import { apiFetch } from './client';
import type { Service, ServiceCategory } from '@luxe/shared';

export function getAdminServices(token: string): Promise<Service[]> {
  return apiFetch<Service[]>('/api/admin/services', { token });
}

export function createService(
  data: {
    category: ServiceCategory;
    name: string;
    description?: string;
    price_min: number;
    price_max?: number | null;
    duration_min: number;
  },
  token: string
): Promise<Service> {
  return apiFetch<Service>('/api/admin/services', {
    method: 'POST',
    body: JSON.stringify(data),
    token,
  });
}

export function updateService(
  id: string,
  data: Partial<Pick<Service, 'name' | 'description' | 'price_min' | 'price_max' | 'duration_min' | 'is_active'>>,
  token: string
): Promise<Service> {
  return apiFetch<Service>(`/api/admin/services?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    token,
  });
}
