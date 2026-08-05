// The bridge to the Vercel API.
//
// Everything with real logic stays on the Vercel side: availability, booking,
// cancel, reschedule, and the contact form. Iris calls those endpoints over
// HTTP rather than reimplementing them, so there remains exactly ONE place an
// appointment is created — which is also why the per-customer booking caps
// cannot be sidestepped by going through the chat.
//
// TWO DIFFERENT CREDENTIALS TRAVEL ON THESE REQUESTS AND THEY MEAN DIFFERENT
// THINGS.
//
//   X-Internal-Token  authenticates the SERVICE. It proves the request came
//                     from our Edge Function and nothing more. It is used on
//                     the far side only to pick a rate-limit bucket. It is NOT
//                     authorisation and must never be treated as such.
//
//   Authorization     authenticates the CUSTOMER, forwarded verbatim from the
//                     browser. Every ownership check on the Vercel side is made
//                     against this and only this. Iris cannot mint one, cannot
//                     alter one, and cannot act without one on any endpoint
//                     that touches an existing appointment.
//
// The consequence worth stating plainly: possession of the internal token does
// not let anything read or change a customer's appointment.

const VERCEL_BASE = Deno.env.get('VERCEL_API_BASE') ?? '';
const INTERNAL_TOKEN = Deno.env.get('INTERNAL_API_TOKEN') ?? '';

/** Requests that hang would hold a customer at a spinner; fail fast instead. */
const TIMEOUT_MS = 10_000;

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** The machine-readable code, when the API sent one (SLOT_TAKEN, RATE_LIMITED, ...). */
  code: string | null;
}

async function call<T>(
  path: string,
  init: {
    method: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    customerToken?: string;
    clientIp: string;
  },
): Promise<ApiResult<T>> {
  if (!VERCEL_BASE || !INTERNAL_TOKEN) {
    console.error('[vercel] VERCEL_API_BASE or INTERNAL_API_TOKEN missing');
    return { ok: false, status: 0, data: null, error: 'Service unavailable', code: null };
  }

  const headers: Record<string, string> = {
    'X-Internal-Token': INTERNAL_TOKEN,
    // Chat traffic all leaves from Supabase's egress addresses. Without this the
    // Vercel limiter would see one IP for every chat customer and 429 the tenth
    // booking of the hour across all of them.
    'X-Client-IP': init.clientIp,
  };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.customerToken) headers['Authorization'] = `Bearer ${init.customerToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${VERCEL_BASE}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const body = payload as { error?: string; code?: string } | null;
      return {
        ok: false,
        status: response.status,
        data: null,
        error: body?.error ?? 'Request failed',
        code: body?.code ?? null,
      };
    }

    return { ok: true, status: response.status, data: payload as T, error: null, code: null };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    console.error('[vercel] call failed:', aborted ? 'timeout' : String(err));
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Could not reach the booking system',
      code: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface AvailabilitySlot {
  time: string;
  availableStylistIds: string[];
}

export function getAvailability(
  input: { date: string; serviceId: string; stylistId: string; clientIp: string },
): Promise<ApiResult<{ slots: AvailabilitySlot[]; message?: string }>> {
  const query = new URLSearchParams({
    date: input.date,
    service_id: input.serviceId,
    stylist_id: input.stylistId,
  });
  return call(`/api/availability?${query}`, { method: 'GET', clientIp: input.clientIp });
}

export interface CreatedAppointment {
  appointment: { id: string; status: string; appointment_date: string; appointment_time: string };
}

export function createBooking(
  input: {
    body: Record<string, unknown>;
    customerToken?: string;
    clientIp: string;
  },
): Promise<ApiResult<CreatedAppointment>> {
  return call('/api/appointments', {
    method: 'POST',
    body: input.body,
    customerToken: input.customerToken,
    clientIp: input.clientIp,
  });
}

export function reschedule(
  input: {
    appointmentId: string;
    date: string;
    time: string;
    customerToken: string;
    clientIp: string;
  },
): Promise<ApiResult<CreatedAppointment>> {
  return call('/api/appointments', {
    method: 'PATCH',
    body: {
      appointment_id: input.appointmentId,
      appointment_date: input.date,
      appointment_time: input.time,
    },
    customerToken: input.customerToken,
    clientIp: input.clientIp,
  });
}

export function cancelByToken(
  input: { token: string; clientIp: string },
): Promise<ApiResult<{ message: string }>> {
  return call(`/api/appointments?token=${encodeURIComponent(input.token)}`, {
    method: 'GET',
    clientIp: input.clientIp,
  });
}

export interface CustomerAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  duration_min: number;
  status: string;
  notes: string | null;
  cancellation_token: string;
  services: { name: string; category: string } | Array<{ name: string; category: string }> | null;
  stylists: { name: string } | Array<{ name: string }> | null;
}

export function getCustomerAppointments(
  input: { customerToken: string; clientIp: string },
): Promise<ApiResult<CustomerAppointment[]>> {
  return call('/api/customer/appointments', {
    method: 'GET',
    customerToken: input.customerToken,
    clientIp: input.clientIp,
  });
}

export function sendContactMessage(
  input: { name: string; email: string; message: string; clientIp: string },
): Promise<ApiResult<{ message: string }>> {
  return call('/api/contact', {
    method: 'POST',
    body: { name: input.name, email: input.email, message: input.message },
    clientIp: input.clientIp,
  });
}

/** Supabase types a to-one join as an array; the runtime returns an object. */
export function unwrapJoin<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
