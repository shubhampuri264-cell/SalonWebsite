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
  { day: 'Monday',    hours: '10:00 AM – 7:00 PM' },
  { day: 'Tuesday',   hours: '10:00 AM – 7:00 PM' },
  { day: 'Wednesday', hours: '10:00 AM – 7:00 PM' },
  { day: 'Thursday',  hours: '10:00 AM – 7:00 PM' },
  { day: 'Friday',    hours: '10:00 AM – 7:00 PM' },
  { day: 'Saturday',  hours: '10:00 AM – 7:00 PM' },
  { day: 'Sunday',    hours: '10:00 AM – 7:00 PM' },
];

export const SALON_INFO = {
  name: 'Icon Studio',
  address: '39-46 Queens Blvd, Sunnyside, NY 11104',
  phone: '(718) 255-6940',
  email: 'sumipuri34@gmail.com',
  instagram: 'https://www.instagram.com/sumilovestyle/',
  tiktok: 'https://www.tiktok.com/@sumi91_',
} as const;
