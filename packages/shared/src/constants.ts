import type { AppointmentStatus, ServiceCategory } from './types';

export const SERVICE_CATEGORIES: ServiceCategory[] = ['hair', 'threading', 'waxing', 'facial', 'special_treatment', 'male'];

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
  waxing: 'Waxing Services',
  facial: 'Facial Services',
  special_treatment: 'Special Treatments',
  male: 'Male Services',
};

// Slot interval in minutes — all appointments snap to :00 and :30
export const SLOT_INTERVAL_MINUTES = 30;

// Salon business hours (24h format)
export const BUSINESS_HOURS: Record<string, { open: string; close: string } | null> = {
  Monday:    { open: '10:00', close: '19:00' },
  Tuesday:   { open: '10:00', close: '19:00' },
  Wednesday: { open: '10:00', close: '19:00' },
  Thursday:  { open: '10:00', close: '19:00' },
  Friday:    { open: '10:00', close: '19:00' },
  Saturday:  { open: '10:00', close: '19:00' },
  Sunday:    { open: '10:00', close: '19:00' },
};
