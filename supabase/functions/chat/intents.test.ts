// The containment boundary, asserted.
//
// Two claims are made all over this feature's design notes: the model cannot
// book, and a hallucinated intent does nothing. Both reduce to properties of
// the tables in intents.ts, so both are checkable without a network.

import { assert, assertEquals, assertFalse } from '@std/assert';
import {
  INTENT_IDS,
  intentIdSchema,
  MODEL_INTENTS,
  modelIntentSchema,
  validateParams,
} from './intents.ts';
import { containsNumbers } from './understand.ts';

Deno.test('the model cannot propose an intent that writes or mails', () => {
  // If any of these ever appears in MODEL_INTENTS, "a booking is only created
  // when a human clicks Confirm" stops being true.
  const forbidden = [
    'confirm_booking',
    'reschedule_confirm',
    'cancel_appointment',
    'submit_contact',
    'contact_salon',
  ];
  for (const intent of forbidden) {
    assertFalse(
      (MODEL_INTENTS as readonly string[]).includes(intent),
      `${intent} must never be model-proposable`,
    );
  }
});

Deno.test('every model intent is a real intent', () => {
  for (const intent of MODEL_INTENTS) {
    assert((INTENT_IDS as readonly string[]).includes(intent));
  }
});

Deno.test('hallucinated intents are rejected by the enum', () => {
  const hallucinated = [
    'delete_all_appointments',
    'book_appointment',
    'give_discount',
    'confirm_booking',
    '',
    'ROOT',
  ];
  for (const intent of hallucinated) {
    assertFalse(modelIntentSchema.safeParse(intent).success, `should reject: ${intent}`);
  }
});

Deno.test('the menu accepts every declared intent', () => {
  for (const intent of INTENT_IDS) {
    assert(intentIdSchema.safeParse(intent).success);
  }
});

Deno.test('validateParams rejects malformed ids rather than passing them on', () => {
  assertFalse(validateParams('pick_service', { service_id: 'not-a-uuid' }).ok);
  assertFalse(validateParams('pick_service', {}).ok);
  assertFalse(validateParams('confirm_booking', { pending_id: '../../etc/passwd' }).ok);
  assertFalse(validateParams('pick_date', { date: '04/08/2026' }).ok);
  assertFalse(validateParams('pick_time', { time: '25:00' }).ok);
  assertFalse(validateParams('pick_time', { time: '2pm' }).ok);
  assertFalse(validateParams('pick_category', { category: 'male' }).ok);
});

Deno.test('validateParams accepts well-formed params', () => {
  const uuid = '7ebccb06-174b-452e-983b-4beb9c505d58';
  assert(validateParams('pick_service', { service_id: uuid }).ok);
  assert(validateParams('pick_stylist', { stylist_id: 'anyone' }).ok);
  assert(validateParams('pick_stylist', { stylist_id: uuid }).ok);
  assert(validateParams('pick_date', { date: '2026-08-06' }).ok);
  assert(validateParams('pick_time', { time: '14:30' }).ok);
  assert(validateParams('pick_category', { category: 'hair' }).ok);
});

Deno.test('intents with no schema ignore anything sent alongside them', () => {
  const result = validateParams('hours', { evil: 'DROP TABLE appointments' });
  assert(result.ok);
  if (result.ok) assertEquals(Object.keys(result.params).length, 0);
});

Deno.test('contact details are bounded the same way the booking API bounds them', () => {
  const valid = {
    client_name: 'Jane Doe',
    client_email: 'jane@example.com',
    client_phone: '7182556940',
  };
  assert(validateParams('submit_contact', valid).ok);
  assertFalse(validateParams('submit_contact', { ...valid, client_email: 'nope' }).ok);
  assertFalse(validateParams('submit_contact', { ...valid, client_name: 'J' }).ok);
  assertFalse(validateParams('submit_contact', { ...valid, client_phone: '123' }).ok);
  assertFalse(validateParams('submit_contact', { ...valid, notes: 'x'.repeat(501) }).ok);
});

Deno.test('the no-numbers guard catches invented prices, times and durations', () => {
  const bad = [
    'A balayage is $200 to $300.',
    'That comes to 45 dollars.',
    "We're open until 8pm.",
    'I can do 2:30 pm on Thursday.',
    'It takes about 90 minutes.',
    'That takes 3 hours.',
    "You'd get 20% off.",
  ];
  for (const reply of bad) {
    assert(containsNumbers(reply), `should catch: ${reply}`);
  }
});

Deno.test('the no-numbers guard leaves legitimate replies alone', () => {
  const good = [
    "Here's the balayage — the price and timing are on the card below.",
    'Our hours are below.',
    "I've put those times up for you, pick whichever suits.",
    "That's booked in. Check your email for the confirmation.",
    'We are at 39-46 Queens Blvd.',
    "Here's what's on at the moment.",
  ];
  for (const reply of good) {
    assertFalse(containsNumbers(reply), `should allow: ${reply}`);
  }
});
