// Safety responses and conversation termination.
//
// Claude's own safety training is the first line here and this file does not
// try to second-guess it. What a model cannot do for itself is END a
// conversation and route a person to real help — so that is what this adds.
//
// Every string below is HAND-WRITTEN and returned verbatim. None of it is ever
// generated, paraphrased, or passed through a model. That is the point: a
// crisis referral must say the same thing every time, and no prompt can talk
// Iris out of a constant.

import { getRedis } from './ratelimit.ts';

export const SALON_PHONE = '(718) 255-6940';

/**
 * Self-harm.
 *
 * The model is never invoked on this path. Iris does not counsel, does not ask
 * follow-up questions, and does not improvise — it names the 988 Suicide &
 * Crisis Lifeline and stops.
 *
 * NY Article 47 (effective 2025-11-05) requires operators to detect suicidal
 * ideation and refer to crisis services. Its obligations target "companion"
 * chatbots and a salon booking assistant is very likely out of scope — but the
 * salon is in Sunnyside, NY, someone eventually types something serious into a
 * free-text box, and a hand-written referral is both the right response and
 * cheaper than arguing about definitions.
 */
export const SELF_HARM_MESSAGE =
  "I'm really sorry you're going through this, and I want to make sure you're talking to someone who can properly help — I'm only a salon booking assistant.\n\n" +
  'Please contact the 988 Suicide & Crisis Lifeline: call or text 988 (US), any time, free and confidential.\n\n' +
  `If you'd like to reach the salon about an appointment, you can call us on ${SALON_PHONE}.`;

/**
 * Threats, violence, harassment, sexual content, requests for illegal help.
 *
 * Ends the conversation rather than arguing. The session is marked terminated
 * in Redis, so every later request on that session id returns this same message
 * with no model call at all — which is both the correct response and the one
 * that costs nothing to repeat.
 */
export const ABUSIVE_MESSAGE =
  "I'm not able to continue this conversation. If you need to reach Icon Studio about an appointment, " +
  `please call ${SALON_PHONE}.`;

/** Anything Iris is not for: maths, code, geography, general knowledge, advice. */
export const OFF_TOPIC_MESSAGE =
  "I can only help with Icon Studio — booking appointments, prices, current offers, our hours, and questions about our services. " +
  'What can I help you with?';

/** The model failed, refused, or returned something unusable. */
export const FALLBACK_MESSAGE =
  "Sorry, I didn't quite catch that. You can tap one of the options below, or tell me what you'd like to do.";

/** Anthropic is unreachable or CHAT_ENABLED is off. Menus still work. */
export const AI_UNAVAILABLE_MESSAGE =
  "I can't understand typed messages at the moment, but the buttons below still work for booking, prices, offers and hours. " +
  `You can also call us on ${SALON_PHONE}.`;

/** The IP has had three conversations terminated within the hour. */
export const COOLED_OFF_MESSAGE =
  `Chat isn't available right now. You can still book on the website, or call us on ${SALON_PHONE}.`;

/** A limiter was tripped. Never blocks booking on the main site. */
export const RATE_LIMITED_MESSAGE =
  "We've hit the limit for messages for now — sorry about that. You can book on the website as normal, " +
  `or call us on ${SALON_PHONE}.`;

/**
 * Records a terminated conversation against the caller's IP and reports whether
 * that address should now be cooled off entirely.
 *
 * Strikes are counted for `abusive` only. A self-harm message is not abuse and
 * must never contribute to a penalty — someone in crisis who then wants to book
 * a haircut should find chat working normally.
 */
export async function recordStrike(ip: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const key = `chat:strikes:${ip}`;
    const total = await redis.incr(key);
    // INCR on a missing key leaves it with no expiry; set the window on first use.
    if (total === 1) await redis.expire(key, 3600);
    if (total >= 3) console.warn('[safety] ip cooled off after repeated terminations');
  } catch (err) {
    console.error('[safety] strike record failed:', err);
  }
}

export async function isCooledOff(ip: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const strikes = await redis.get<number>(`chat:strikes:${ip}`);
    return (strikes ?? 0) >= 3;
  } catch (err) {
    console.error('[safety] strike read failed:', err);
    // Fail open. A Redis blip must not lock a real customer out of the chat,
    // and the damage this limiter prevents is nuisance rather than harm — the
    // spend limiters are the ones that fail closed.
    return false;
  }
}
