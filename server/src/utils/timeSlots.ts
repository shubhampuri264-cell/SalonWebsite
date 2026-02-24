import { SLOT_INTERVAL_MINUTES } from '@luxe/shared';

interface ExistingAppointment {
  appointment_time: string; // HH:MM
  duration_min: number;
}

interface BlockedSlotInput {
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
}

interface GenerateSlotsInput {
  openTime: string;      // HH:MM
  closeTime: string;     // HH:MM
  slotDuration: number;  // minutes (from selected service)
  existingAppointments: ExistingAppointment[];
  blockedSlots: BlockedSlotInput[];
}

/** Convert "HH:MM" to total minutes since midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert total minutes since midnight back to "HH:MM" */
function fromMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True if interval [aStart, aEnd) overlaps [bStart, bEnd) */
function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generate available time slot strings for a given day.
 * Returns only slots that do not overlap with existing appointments or blocked periods.
 */
export function generateAvailableSlots(input: GenerateSlotsInput): string[] {
  const { openTime, closeTime, slotDuration, existingAppointments, blockedSlots } =
    input;

  const openMinutes = toMinutes(openTime);
  const closeMinutes = toMinutes(closeTime);

  const available: string[] = [];

  for (
    let start = openMinutes;
    start + slotDuration <= closeMinutes;
    start += SLOT_INTERVAL_MINUTES
  ) {
    const end = start + slotDuration;

    // Check overlap with existing appointments
    const blockedByAppointment = existingAppointments.some((appt) => {
      const apptStart = toMinutes(appt.appointment_time);
      const apptEnd = apptStart + appt.duration_min;
      return overlaps(start, end, apptStart, apptEnd);
    });

    if (blockedByAppointment) continue;

    // Check overlap with blocked slots
    const blockedBySlot = blockedSlots.some((slot) => {
      const slotStart = toMinutes(slot.start_time);
      const slotEnd = toMinutes(slot.end_time);
      return overlaps(start, end, slotStart, slotEnd);
    });

    if (blockedBySlot) continue;

    available.push(fromMinutes(start));
  }

  return available;
}
