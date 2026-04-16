import { apiFetch } from './client';

export interface CustomerAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  duration_min: number;
  status: string;
  notes: string | null;
  services: { name: string; category: string } | null;
  stylists: { name: string } | null;
}

export function getCustomerAppointments(token: string): Promise<CustomerAppointment[]> {
  return apiFetch<CustomerAppointment[]>('/api/customer/appointments', { token });
}
