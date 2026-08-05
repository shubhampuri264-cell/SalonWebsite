// Layer 1 of topic control: pure, deterministic, and free.
//
// Everything here runs before any model is called, so a message caught at this
// stage costs nothing, consumes no session turn, and cannot be argued with.
// That is the entire point — the cheapest defence against cost abuse is one
// that never reaches a token meter (OWASP LLM10).
//
// This layer is deliberately NOT the main topic boundary. Denylists are easy to
// paraphrase around, and a long one produces false positives on real customers
// ("I want to ignore my grey roots"). It catches the loud, obvious, high-volume
// cases; the Haiku classifier catches meaning.

export const MAX_MESSAGE_LENGTH = 500;

export type PrefilterVerdict =
  | { blocked: false }
  | { blocked: true; reason: PrefilterReason; reply: string };

export type PrefilterReason = 'too_long' | 'empty' | 'injection' | 'task_abuse';

/**
 * Attempts to move the model off its instructions. Matching here is a signal of
 * intent, not of harm — the honest answer is that these strings would fail
 * anyway, because the model has no tools and its system prompt contains only
 * public catalogue data (LLM07). Blocking them early just avoids paying to be
 * told no.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(your\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(your\s+|the\s+)?(previous|prior|above|earlier|system)/i,
  /\b(system|initial|original)\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\s+(a|an|if)\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
  /\b(developer|debug|god|jailbreak|dan)\s+mode\b/i,
  /\brepeat\s+(everything|the\s+text)\s+above\b/i,
  /\bprint\s+(your|the)\s+(instructions?|prompt|rules)/i,
  /<\|.*?\|>/,
  /\[\s*(INST|\/INST|SYSTEM)\s*\]/i,
];

/**
 * Using the salon's Anthropic account as free general-purpose compute. This is
 * the cost-abuse case rather than the safety case: nothing here is harmful, it
 * simply is not what the salon is paying for.
 */
const TASK_ABUSE_PATTERNS: RegExp[] = [
  // The `(\w+\s+){0,2}` allows for adjectives between the article and the noun:
  // "write a python program", "write me a short funny poem". Without it the
  // pattern only catches the bare phrasing, which is the easier half.
  /\bwrite\s+(me\s+)?(a|an|the)?\s*(\w+\s+){0,2}(essay|poem|story|song|script|article|email|letter|blog|code|program|function|snippet|query)\b/i,
  /\b(translate|summari[sz]e|rewrite|proofread)\s+(this|the\s+following|it)\b/i,
  /```/,
  /\b(solve|calculate|compute)\b.*\d/i,
  /\bhomework\b/i,
];

const INJECTION_REPLY =
  "I can only help with things at Icon Studio — booking, prices, offers, and hours. What can I help you with?";

const TASK_ABUSE_REPLY =
  "I'm just the salon's booking assistant, so that's outside what I can do. I can book you in, check prices, or look up your appointments.";

const TOO_LONG_REPLY =
  `That message is a bit long for me — could you keep it under ${MAX_MESSAGE_LENGTH} characters? Or tap one of the options below.`;

/**
 * Runs the deterministic checks. `message` is the raw customer text.
 *
 * Order matters: length is checked first so a very long message is rejected
 * without running a dozen regexes over it.
 */
export function prefilter(message: string): PrefilterVerdict {
  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return { blocked: true, reason: 'empty', reply: 'What can I help you with?' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { blocked: true, reason: 'too_long', reply: TOO_LONG_REPLY };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { blocked: true, reason: 'injection', reply: INJECTION_REPLY };
    }
  }

  for (const pattern of TASK_ABUSE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { blocked: true, reason: 'task_abuse', reply: TASK_ABUSE_REPLY };
    }
  }

  return { blocked: false };
}

// C0/C1 control characters. \t \n \r are excluded because they are legitimate
// in a typed message and get collapsed into single spaces below.
// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// Zero-width characters and bidirectional overrides. These render as nothing
// (or reverse the visible order of what follows) while still being real bytes
// the model reads — so a message can look benign on screen and read as
// something else entirely in the context window.
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * Normalises a message so that what the customer sees, what the model reads,
 * and what we log are the same text.
 */
export function sanitize(message: string): string {
  return message
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}
