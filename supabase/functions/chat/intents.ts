// The intent registry — the single boundary between "something was asked for"
// and "something happens".
//
// Both ways of talking to Iris converge here. A menu tap arrives as an intent
// directly; free text arrives as an intent the model *proposed*. Neither is
// trusted: every intent name is checked against the enum below and every
// parameter against the schema for that intent before a handler sees it.
//
// This is what makes OWASP LLM06 (Excessive Agency) structurally absent rather
// than merely mitigated. The model has no tools. Its entire influence over the
// system is the ability to name one of the strings in MODEL_INTENTS and fill in
// a few validated fields — and the two intents that actually cost something
// (creating a booking, sending mail) are not in that list at all.

import { z } from 'zod';

export const INTENT_IDS = [
  // Navigation
  'root',
  'back',

  // Booking funnel
  'book_start',
  'pick_category',
  'pick_service',
  'pick_stylist',
  'pick_date',
  'pick_time',
  'submit_contact',
  'confirm_booking',

  // Account
  'my_appointments',
  'cancel_appointment',
  'reschedule_start',
  'reschedule_confirm',

  // Information
  'prices',
  'service_info',
  'promotions',
  'hours',

  // Escape hatches
  'escalate',
  'contact_salon',
] as const;

export type IntentId = (typeof INTENT_IDS)[number];

export const intentIdSchema = z.enum(INTENT_IDS);

/**
 * The intents the MODEL is allowed to propose.
 *
 * Deliberately narrower than INTENT_IDS. Three kinds of intent are excluded:
 *
 *   confirm_booking, reschedule_confirm — these write to the database. They are
 *     fired by a human clicking a button on a card that shows the real service,
 *     stylist, time and price. No sentence a customer types can reach them, so
 *     "just book it, don't ask me" cannot work, and neither can an injected
 *     instruction telling Iris to book.
 *
 *   submit_contact, contact_salon — these carry personal details and send mail.
 *     They come from real form fields, so the model never handles the values and
 *     a hallucinated email address can never be submitted.
 *
 *   cancel_appointment — destructive. Same reasoning as confirm_booking: it is a
 *     button on the customer's own appointment card.
 *
 * The model can still *route* to the screens these live on (my_appointments,
 * escalate), which is the useful half without the dangerous half.
 */
export const MODEL_INTENTS = [
  'root',
  'book_start',
  'pick_category',
  'pick_service',
  'pick_stylist',
  'pick_date',
  'pick_time',
  'my_appointments',
  'reschedule_start',
  'prices',
  'service_info',
  'promotions',
  'hours',
  'escalate',
] as const satisfies readonly IntentId[];

export const modelIntentSchema = z.enum(MODEL_INTENTS);

// --- parameter schemas ------------------------------------------------------
//
// Contact details reuse the exact bounds from api/appointments.ts. Two copies
// is one too many, but a Deno function cannot import a Node module and a
// mismatch here would show up as a confusing 400 from Vercel after the customer
// had already filled in the form. Server-side validation on Vercel remains the
// real guarantee; this exists to fail early with a message Iris can explain.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CATEGORIES = ['hair', 'threading', 'waxing', 'facial', 'special_treatment'] as const;

const uuid = z.string().uuid();

export const contactSchema = z.object({
  client_name: z.string().trim().min(2).max(100),
  client_email: z.string().trim().email().max(254),
  client_phone: z.string().trim().min(7).max(20),
  notes: z.string().max(500).optional(),
  marketing_consent: z.boolean().optional(),
});

/**
 * Per-intent parameter schemas. An intent with no entry takes no parameters,
 * and anything sent alongside it is dropped rather than passed through.
 */
export const INTENT_PARAMS = {
  pick_category: z.object({ category: z.enum(CATEGORIES) }),
  pick_service: z.object({ service_id: uuid }),
  // A named stylist only. 'anyone' used to be accepted here and resolved at
  // booking time by picking at random from whoever was free — including
  // stylists who do not perform the service. See migration 018.
  pick_stylist: z.object({ stylist_id: uuid }),
  pick_date: z.object({ date: z.string().regex(DATE_RE, 'Invalid date') }),
  pick_time: z.object({ time: z.string().regex(TIME_RE, 'Invalid time') }),
  submit_contact: contactSchema,
  confirm_booking: z.object({ pending_id: uuid }),
  cancel_appointment: z.object({ appointment_id: uuid }),
  reschedule_start: z.object({ appointment_id: uuid }),
  reschedule_confirm: z.object({
    appointment_id: uuid,
    date: z.string().regex(DATE_RE, 'Invalid date'),
    time: z.string().regex(TIME_RE, 'Invalid time'),
  }),
  prices: z.object({ category: z.enum(CATEGORIES).optional() }),
  service_info: z.object({ service_id: uuid }),
  contact_salon: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    message: z.string().trim().min(10).max(1000),
  }),
} as const;

export type IntentParams = {
  [K in keyof typeof INTENT_PARAMS]: z.infer<(typeof INTENT_PARAMS)[K]>;
};

/**
 * Validates params for an intent.
 *
 * Returns `{ ok: false }` rather than throwing so the caller can decide what a
 * failure means: from a menu tap it is a 400 (our own client sent something
 * wrong), from the model it is a silent fallback to the menu (the model
 * hallucinated, and the customer should not see a validation error about it).
 */
export function validateParams(
  intent: IntentId,
  params: unknown,
): { ok: true; params: Record<string, unknown> } | { ok: false; message: string } {
  const schema = (INTENT_PARAMS as Record<string, z.ZodTypeAny | undefined>)[intent];
  if (!schema) return { ok: true, params: {} };

  const parsed = schema.safeParse(params ?? {});
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid details' };
  }
  return { ok: true, params: parsed.data as Record<string, unknown> };
}

// --- conversation nodes -----------------------------------------------------

export const NODE_IDS = [
  'root',
  'category',
  'service',
  'stylist',
  'date',
  'time',
  'contact',
  'confirm',
  'booked',
  'appointments',
  'reschedule_date',
  'reschedule_time',
  'prices',
  'promotions',
  'hours',
  'escalate',
  'terminated',
] as const;

export type NodeId = (typeof NODE_IDS)[number];
