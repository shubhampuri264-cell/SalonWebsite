import { BUSINESS_HOURS } from '@luxe/shared';

/** Format a YYYY-MM-DD string to "Monday, March 15, 2026" */
export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Format "HH:MM" (24h) to "9:00 AM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/** Returns today's date as YYYY-MM-DD string */
export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Check if the salon is open on a given JS Date */
export function isSalonOpen(date: Date): boolean {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  return BUSINESS_HOURS[dayName] !== null;
}

/**
 * Business hours displayed on the Location page.
 * Returns an array of { day, hours } pairs for the hours table.
 */
export const HOURS_DISPLAY: Array<{ day: string; hours: string }> = [
  { day: 'Monday', hours: '9:00 AM – 7:00 PM' },
  { day: 'Tuesday', hours: '9:00 AM – 7:00 PM' },
  { day: 'Wednesday', hours: '9:00 AM – 7:00 PM' },
  { day: 'Thursday', hours: '9:00 AM – 7:00 PM' },
  { day: 'Friday', hours: '9:00 AM – 7:00 PM' },
  { day: 'Saturday', hours: '9:00 AM – 6:00 PM' },
  { day: 'Sunday', hours: 'Closed' },
];

export const SALON_INFO = {
  name: 'Icon Studio',
  address: '123 Rose Gold Ave, New York, NY 10001',
  phone: '(212) 555-0100',
  email: 'hello@iconstudionyc.com',
  instagram: 'https://instagram.com/iconstudionyc',
  facebook: 'https://facebook.com/iconstudionyc',
} as const;
