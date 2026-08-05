// Iris — Icon Studio's booking assistant.
//
// The pipeline, in order. Each step is cheaper than the one after it, which is
// the whole design: junk traffic is rejected before it costs anything, and a
// spend cap can never block someone who is trying to book.
//
//   0  CORS + method + body shape
//   1  terminated session / cooled-off IP        no model, no Redis writes
//   2  rate limits: burst, hourly, session, user
//   3  MENU TAP -> straight to the handler       ZERO model calls
//   4  free text: deterministic pre-filter       no model call
//   5  daily global cap + session token budget   AI branch only
//   6  Haiku classifier                          off-topic/self-harm/abusive stop here
//   7  Sonnet: reply + proposed intent           no tools
//   8  zod validation of that intent             unknown -> menu fallback
//   9  handler: real data, real cards
//
// Step 3 is why the menu is not scaffolding. It is the offline path, the error
// path, and the discovery path — and it is the reason a customer can still book,
// cancel and reschedule with ANTHROPIC_API_KEY unset.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { fetchLivePromotions, fetchServices, fetchStylists } from './catalog.ts';
import { classify, isInScope } from './classify.ts';
import { salonNow, salonToday } from './dates.ts';
import { trackBlocked, trackLabel, trackNode } from './funnel.ts';
import { chipsForNode, handle, type Card, type Chip, type HandlerContext } from './handlers.ts';
import { intentIdSchema, modelIntentSchema, validateParams, type IntentId } from './intents.ts';
import { prefilter, sanitize, MAX_MESSAGE_LENGTH } from './prefilter.ts';
import { buildSystemPrompt, PROMPT_VERSION } from './prompt.ts';
import {
  clientIp,
  recordTokens,
  withinLimit,
  withinTokenBudget,
} from './ratelimit.ts';
import {
  ABUSIVE_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  COOLED_OFF_MESSAGE,
  FALLBACK_MESSAGE,
  isCooledOff,
  OFF_TOPIC_MESSAGE,
  RATE_LIMITED_MESSAGE,
  recordStrike,
  SELF_HARM_MESSAGE,
} from './safety.ts';
import { loadSession, pushHistory, saveSession } from './session.ts';
import { containsNumbers, understand } from './understand.ts';

// --- configuration ----------------------------------------------------------

const CLIENT_URL = Deno.env.get('CLIENT_URL') ?? '';
const CHAT_ENABLED = (Deno.env.get('CHAT_ENABLED') ?? 'true') !== 'false';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

/**
 * Origins allowed to call this function.
 *
 * An explicit allowlist, never `*`. The site's own origin plus the two local
 * dev ports, and localhost only when CLIENT_URL says we are not in production.
 */
const ALLOWED_ORIGINS = new Set(
  [CLIENT_URL, ...(CLIENT_URL.includes('localhost') ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])]
    .filter(Boolean)
    .map((o) => o.replace(/\/+$/, '')),
);

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!ANTHROPIC_API_KEY || !CHAT_ENABLED) return null;
  if (!anthropic) anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return anthropic;
}

// --- request contract -------------------------------------------------------

const requestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().max(MAX_MESSAGE_LENGTH * 4).optional(),
  intent: intentIdSchema.optional(),
  params: z.record(z.unknown()).optional(),
}).refine((body) => (body.message === undefined) !== (body.intent === undefined), {
  message: 'Send exactly one of message or intent',
});

interface ChatResponse {
  sessionId: string;
  reply: string;
  cards: Card[];
  chips: Chip[];
  node: string;
  /** False when the session is terminated or free text is unavailable. */
  composerEnabled: boolean;
  terminated: boolean;
  promptVersion: string;
}

// --- entry point ------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin') ?? '';
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  // An unrecognised origin is refused outright rather than answered without CORS
  // headers: the browser would block it anyway, and refusing here means a
  // scripted caller does not get a free response either.
  if (origin && !ALLOWED_ORIGINS.has(origin.replace(/\/+$/, ''))) {
    return json({ error: 'Origin not allowed' }, 403, cors);
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request' }, 400, cors);
  }

  const ip = clientIp(req);
  const now = Date.now();

  // The customer's own Supabase token, forwarded untouched to Vercel where it
  // is verified. This function never inspects it, never decodes it, and never
  // decides anything on the strength of it.
  const customerToken = req.headers.get('x-customer-token') ?? undefined;

  // A session id is minted server-side. A caller-supplied UUID is accepted only
  // because the widget has to send back the one we gave it — and it carries no
  // authority whatsoever: guessing one gets you an empty conversation, since
  // the pending-booking record lives under a separate id and every account
  // action re-checks the customer's own token.
  const sessionId = body.sessionId ?? crypto.randomUUID();

  try {
    return await respond({ body, ip, sessionId, customerToken, now, cors });
  } catch (err) {
    console.error('[chat] unhandled:', err instanceof Error ? err.message : 'unknown');
    return json(
      {
        sessionId,
        reply: FALLBACK_MESSAGE,
        cards: [],
        chips: [{ label: 'Start over', intent: 'root' }],
        node: 'root',
        composerEnabled: true,
        terminated: false,
        promptVersion: PROMPT_VERSION,
      } satisfies ChatResponse,
      200,
      cors,
    );
  }
});

async function respond(input: {
  body: z.infer<typeof requestSchema>;
  ip: string;
  sessionId: string;
  customerToken?: string;
  now: number;
  cors: Record<string, string>;
}): Promise<Response> {
  const { body, ip, sessionId, customerToken, now, cors } = input;

  const session = await loadSession(sessionId, now);

  // --- 1. terminated / cooled off ------------------------------------------
  //
  // Both checked before any limiter is spent and before any model is reached.
  // A terminated session costs nothing to keep refusing, which is the point.
  if (session.terminated) {
    return reply(sessionId, {
      text: session.terminatedReason === 'self_harm' ? SELF_HARM_MESSAGE : ABUSIVE_MESSAGE,
      node: 'terminated',
      composerEnabled: false,
      terminated: true,
    }, cors);
  }

  if (await isCooledOff(ip)) {
    return reply(sessionId, {
      text: COOLED_OFF_MESSAGE,
      node: 'terminated',
      composerEnabled: false,
      terminated: true,
    }, cors);
  }

  // --- 2. rate limits -------------------------------------------------------
  //
  // Menu taps and typed messages are metered SEPARATELY, because they cost
  // different things. A tap makes no model call; a message makes two. Metering
  // them together meant a customer six clicks into a booking hit the
  // five-a-minute message budget and got a 429 — a limiter designed to bound
  // spend standing squarely in front of a sale. See ratelimit.ts.
  const isMenuTap = Boolean(body.intent);

  const budgets = isMenuTap
    ? await Promise.all([
      withinLimit('actionBurst', ip),
      withinLimit('action', ip),
    ])
    : await Promise.all([
      withinLimit('chatBurst', ip),
      withinLimit('chat', ip),
      withinLimit('chatSession', sessionId),
      customerToken ? withinLimit('chatUser', `tok:${await fingerprint(customerToken)}`) : true,
    ]);

  if (budgets.some((ok) => !ok)) {
    trackBlocked(isMenuTap ? 'action_rate_limited' : 'rate_limited');
    return reply(sessionId, {
      text: RATE_LIMITED_MESSAGE,
      node: session.node,
      // A fixed pair of chips, deliberately not chipsForNode: that would need a
      // catalogue query, and a limiter that runs a database query per rejected
      // request is doing the attacker's work for them. "Book an appointment" is
      // a menu tap, which is on the separate and much looser action budget — so
      // hitting the MESSAGE limit still leaves booking one click away.
      chips: [
        { label: 'Book an appointment', intent: 'book_start', style: 'primary' },
        { label: 'Start over', intent: 'root', style: 'ghost' },
      ],
      composerEnabled: false,
    }, cors, 429);
  }

  session.turns += 1;

  const [services, stylists] = await Promise.all([fetchServices(), fetchStylists()]);
  const baseContext: Omit<HandlerContext, 'params'> = {
    session,
    clientIp: ip,
    customerToken,
    services,
    stylists,
  };

  // --- 3. menu tap: no model at all ----------------------------------------
  if (body.intent) {
    const validated = validateParams(body.intent, body.params);
    if (!validated.ok) {
      // A malformed menu tap means OUR widget sent something wrong, or someone
      // is poking at the endpoint by hand. Either way the customer did not
      // cause it, so they get a sentence rather than "Invalid uuid" — the zod
      // message goes to the logs, where it is useful.
      console.warn(JSON.stringify({ at: 'validate', intent: body.intent, reason: validated.message }));
      return reply(sessionId, {
        text: "Something went wrong with that option. Let's try again.",
        chips: chipsForNode(session.node, session, services),
        node: session.node,
        composerEnabled: aiAvailable(),
      }, cors, 400);
    }

    const result = await handle(body.intent, { ...baseContext, params: validated.params });
    session.node = result.node;
    pushHistory(session, 'assistant', result.reply);
    await saveSession(sessionId, session);
    trackNode(result.node);

    return reply(sessionId, {
      text: result.reply,
      cards: result.cards,
      chips: result.chips,
      node: result.node,
      composerEnabled: aiAvailable(),
    }, cors);
  }

  // --- 4. free text: deterministic pre-filter -------------------------------
  const raw = body.message ?? '';
  const message = sanitize(raw);
  const verdict = prefilter(message);

  if (verdict.blocked) {
    trackBlocked(verdict.reason);
    // Not saved to history and the draft is untouched: a blocked message never
    // happened as far as the conversation is concerned.
    return reply(sessionId, {
      text: verdict.reply,
      chips: chipsForNode(session.node, session, services),
      node: session.node,
      composerEnabled: aiAvailable(),
    }, cors);
  }

  // Free text with no model behind it. The menu still works, so this is a
  // reduced Iris rather than a broken one.
  const client = getAnthropic();
  if (!client) {
    return reply(sessionId, {
      text: AI_UNAVAILABLE_MESSAGE,
      chips: chipsForNode(session.node, session, services),
      node: session.node,
      composerEnabled: false,
    }, cors);
  }

  // --- 5. spend caps --------------------------------------------------------
  //
  // Deliberately AFTER the menu branch. A daily spend ceiling must never stop
  // someone booking an appointment — it only stops the AI understanding typed
  // messages.
  const [globalOk, tokensOk] = await Promise.all([
    withinLimit('chatGlobal', 'global'),
    withinTokenBudget(sessionId),
  ]);
  if (!globalOk || !tokensOk) {
    trackBlocked(globalOk ? 'token_budget' : 'global_cap');
    return reply(sessionId, {
      text: AI_UNAVAILABLE_MESSAGE,
      chips: chipsForNode(session.node, session, services),
      node: session.node,
      composerEnabled: false,
    }, cors);
  }

  // --- 6. classifier --------------------------------------------------------
  const classification = await classify(client, message);
  await recordTokens(sessionId, classification.inputTokens + classification.outputTokens);
  trackLabel(classification.label);

  if (classification.label === 'self_harm') {
    // The model is NEVER invoked on this path. Hand-written referral, session
    // closed gently. No strike is recorded — this is not abuse.
    session.terminated = true;
    session.terminatedReason = 'self_harm';
    await saveSession(sessionId, session);
    console.warn(JSON.stringify({ at: 'safety', label: 'self_harm' }));

    return reply(sessionId, {
      text: SELF_HARM_MESSAGE,
      node: 'terminated',
      composerEnabled: false,
      terminated: true,
    }, cors);
  }

  if (classification.label === 'abusive') {
    session.terminated = true;
    session.terminatedReason = 'abusive';
    await saveSession(sessionId, session);
    await recordStrike(ip);
    // Logged WITHOUT the message. We record that it happened, never what was said.
    console.warn(JSON.stringify({ at: 'safety', label: 'abusive' }));

    return reply(sessionId, {
      text: ABUSIVE_MESSAGE,
      node: 'terminated',
      composerEnabled: false,
      terminated: true,
    }, cors);
  }

  if (!isInScope(classification.label)) {
    // Canned string, not model output — so the answer to "what is 47 * 92" is
    // byte-identical every time and no prompt can negotiate it. Sonnet is never
    // reached, so an off-topic message costs one Haiku call and nothing more.
    return reply(sessionId, {
      text: OFF_TOPIC_MESSAGE,
      chips: chipsForNode(session.node, session, services),
      node: session.node,
      composerEnabled: true,
    }, cors);
  }

  // --- 7. main model --------------------------------------------------------
  const promotions = await fetchLivePromotions();
  const systemPrompt = buildSystemPrompt({ services, stylists, promotions, now });

  const understood = await understand(client, {
    systemPrompt,
    message,
    node: session.node,
    draft: session.draft as Record<string, unknown>,
    history: session.history,
    today: salonToday(),
    nowTime: salonNow(),
    signedIn: Boolean(customerToken),
  });
  await recordTokens(
    sessionId,
    understood.inputTokens + understood.outputTokens + understood.cacheReadTokens,
  );

  // --- 8. validate what came back -------------------------------------------
  //
  // A refusal, a hallucinated intent, and an empty response all land in the same
  // place: the menu. Nothing is executed on an intent that is not in the enum.
  const proposed = modelIntentSchema.safeParse(understood.intent);
  if (understood.refused || !proposed.success) {
    return reply(sessionId, {
      text: understood.refused ? OFF_TOPIC_MESSAGE : FALLBACK_MESSAGE,
      chips: chipsForNode(session.node, session, services),
      node: session.node,
      composerEnabled: true,
    }, cors);
  }

  const intent = proposed.data as IntentId;
  const validated = validateParams(intent, understood.params);

  // Bad params are dropped and the intent runs bare — "you meant to pick a
  // service but named one that does not exist" is best answered by showing the
  // list, not by surfacing a validation error the customer did not cause.
  const params = validated.ok ? validated.params : {};

  // --- 9. the reply the customer sees ---------------------------------------
  //
  // Numbers are stripped here, not warned about. The reply is decoration on top
  // of cards that carry the real figures, so replacing it loses nothing — and
  // it is the last gate on the rule that decides liability.
  let modelReply = understood.reply.trim();
  if (modelReply && containsNumbers(modelReply)) {
    console.warn(JSON.stringify({ at: 'guard', rule: 'no_numbers', prompt_version: PROMPT_VERSION }));
    modelReply = '';
  }

  const result = await handle(intent, { ...baseContext, params, modelReply });

  session.node = result.node;
  pushHistory(session, 'user', message);
  pushHistory(session, 'assistant', result.reply);
  await saveSession(sessionId, session);
  trackNode(result.node);

  return reply(sessionId, {
    text: result.reply,
    cards: result.cards,
    chips: result.chips,
    node: result.node,
    composerEnabled: true,
  }, cors);
}

// --- plumbing ---------------------------------------------------------------

function aiAvailable(): boolean {
  return Boolean(ANTHROPIC_API_KEY) && CHAT_ENABLED;
}

/**
 * A stable, non-reversible key for a signed-in customer.
 *
 * The per-user limiter needs one bucket per account, but the raw token must not
 * become a Redis key — tokens are credentials and Redis keys end up in logs and
 * dashboards. A SHA-256 prefix is stable for the life of the token, which is
 * all the limiter needs.
 */
async function fingerprint(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.has(origin.replace(/\/+$/, ''));
  return {
    // Echoed only when the origin is on the list. Never `*` — this endpoint
    // receives a customer token header.
    'Access-Control-Allow-Origin': allowed ? origin : (CLIENT_URL || 'null'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-customer-token, authorization, apikey',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function reply(
  sessionId: string,
  input: {
    text: string;
    cards?: Card[];
    chips?: Chip[];
    node: string;
    composerEnabled?: boolean;
    terminated?: boolean;
  },
  cors: Record<string, string>,
  status = 200,
): Response {
  const payload: ChatResponse = {
    sessionId,
    reply: input.text,
    cards: input.cards ?? [],
    chips: input.chips ?? [],
    node: input.node,
    composerEnabled: input.composerEnabled ?? true,
    terminated: input.terminated ?? false,
    promptVersion: PROMPT_VERSION,
  };
  return json(payload, status, cors);
}
