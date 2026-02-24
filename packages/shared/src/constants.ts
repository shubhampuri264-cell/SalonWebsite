import type { AppointmentStatus, ServiceCategory } from './types';

export const SERVICE_CATEGORIES: ServiceCategory[] = ['hair', 'threading'];

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No Show',
};

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  hair: 'Hair Services',
  threading: 'Threading Services',
};

// Slot interval in minutes — all appointments snap to :00 and :30
export const SLOT_INTERVAL_MINUTES = 30;

// Salon business hours (24h format) — placeholder, update before launch
export const BUSINESS_HOURS: Record<string, { open: string; close: string } | null> = {
  Monday:    { open: '09:00', close: '19:00' },
  Tuesday:   { open: '09:00', close: '19:00' },
  Wednesday: { open: '09:00', close: '19:00' },
  Thursday:  { open: '09:00', close: '19:00' },
  Friday:    { open: '09:00', close: '19:00' },
  Saturday:  { open: '09:00', close: '18:00' },
  Sunday:    null, // Closed
};
