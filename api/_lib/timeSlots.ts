const SLOT_INTERVAL_MINUTES = 30;

interface ExistingAppointment {
  appointment_time: string;
  duration_min: number;
}

interface BlockedSlotInput {
  start_time: string;
  end_time: string;
}

interface GenerateSlotsInput {
  openTime: string;
  closeTime: string;
  slotDuration: number;
  existingAppointments: ExistingAppointment[];
  blockedSlots: BlockedSlotInput[];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function generateAvailableSlots(input: GenerateSlotsInput): string[] {
  const { openTime, closeTime, slotDuration, existingAppointments, blockedSlots } = input;
  const openMinutes = toMinutes(openTime);
  const closeMinutes = toMinutes(closeTime);
  const available: string[] = [];

  for (let start = openMinutes; start + slotDuration <= closeMinutes; start += SLOT_INTERVAL_MINUTES) {
    const end = start + slotDuration;

    const blockedByAppointment = existingAppointments.some((appt) => {
      const apptStart = toMinutes(appt.appointment_time);
      const apptEnd = apptStart + appt.duration_min;
      return overlaps(start, end, apptStart, apptEnd);
    });
    if (blockedByAppointment) continue;

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
