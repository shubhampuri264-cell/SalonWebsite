import { apiFetch } from './client';
import type { Service, ServiceCategory } from '@luxe/shared';

export async function getServices(): Promise<Record<ServiceCategory, Service[]>> {
  const data = await apiFetch<Service[]>('/api/services');

  const grouped = data.reduce<Record<ServiceCategory, Service[]>>(
    (acc, service) => {
      const cat = service.category as ServiceCategory;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(service);
      return acc;
    },
    {} as Record<ServiceCategory, Service[]>
  );

  return grouped;
}
