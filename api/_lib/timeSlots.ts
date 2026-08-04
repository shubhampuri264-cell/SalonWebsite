export const SLOT_INTERVAL_MINUTES = 30;

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
  /**
   * Earliest start to offer, in minutes since midnight. Callers pass the
   * salon-local clock (plus any lead time) when the requested date is today,
   * so the grid stops advertising slots that have already begun. Omitted for
   * future dates, where every slot from opening time is still live.
   */
  minStartMinutes?: number;
}

/** 'HH:MM' or Postgres 'HH:MM:SS' to minutes since midnight. Seconds ignored. */
export function toMinutes(time: string): number {
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

/**
 * True when [startTime, startTime + durationMin) collides with nothing.
 *
 * This is the single definition of "free" for the whole app. The read path
 * (GET /api/availability) and the write path (POST /api/appointments) MUST
 * both go through it — when they disagreed, the site advertised slots the
 * database then rejected with a terminal 409.
 *
 * Works in minutes-since-midnight, so a booking that would run past midnight
 * simply produces an end value above 1440 and compares correctly. Callers pass
 * Postgres TIME values ('HH:MM:SS'); toMinutes ignores the seconds component.
 */
export function isSlotFree(input: {
  startTime: string;
  durationMin: number;
  existingAppointments: ExistingAppointment[];
  blockedSlots: BlockedSlotInput[];
}): boolean {
  const start = toMinutes(input.startTime);
  const end = start + input.durationMin;

  const hitsAppointment = input.existingAppointments.some((appt) => {
    const apptStart = toMinutes(appt.appointment_time);
    return overlaps(start, end, apptStart, apptStart + appt.duration_min);
  });
  if (hitsAppointment) return false;

  return !input.blockedSlots.some((slot) =>
    overlaps(start, end, toMinutes(slot.start_time), toMinutes(slot.end_time))
  );
}

export function generateAvailableSlots(input: GenerateSlotsInput): string[] {
  const { openTime, closeTime, slotDuration, existingAppointments, blockedSlots, minStartMinutes } = input;
  const openMinutes = toMinutes(openTime);
  const closeMinutes = toMinutes(closeTime);
  const available: string[] = [];

  // Advance in whole intervals from opening time rather than jumping straight
  // to minStartMinutes, so the grid stays aligned to 10:00/10:30/... instead of
  // being re-anchored to whatever minute the request happened to arrive at.
  let firstStart = openMinutes;
  if (minStartMinutes !== undefined && minStartMinutes > openMinutes) {
    const intervals = Math.ceil((minStartMinutes - openMinutes) / SLOT_INTERVAL_MINUTES);
    firstStart = openMinutes + intervals * SLOT_INTERVAL_MINUTES;
  }

  for (let start = firstStart; start + slotDuration <= closeMinutes; start += SLOT_INTERVAL_MINUTES) {
    const startTime = fromMinutes(start);
    if (isSlotFree({ startTime, durationMin: slotDuration, existingAppointments, blockedSlots })) {
      available.push(startTime);
    }
  }

  return available;
}
