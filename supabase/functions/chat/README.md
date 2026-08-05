# Iris — deploy runbook

Iris is the chat assistant on the public site. It runs **here, on Supabase Edge
Functions** — not on Vercel — because Vercel's Hobby plan caps the project at 12
serverless functions and all 12 are in use. Putting chat here meant not having
to merge two existing endpoints, so `/api/services` and `/api/stylists` are
untouched and browsing and booking work exactly as they did before.

## The one thing to remember

**Iris is an addition, never a replacement.** With the widget switched off,
uninstalled, or completely broken, the site and the four-step booking wizard
behave identically to before it existed. Even with the widget on and Anthropic
unreachable, the menu still books, cancels, reschedules, and shows prices,
offers and hours — those paths make no model call at all.

## First deploy

### 1. Database

Migration `017_promotions.sql` must be applied (via the Supabase SQL Editor).
Check with:

```
npm run migrate:status
```

### 2. Vercel

Add one variable in **Settings → Environment Variables**:

| Key | Value |
|---|---|
| `INTERNAL_API_TOKEN` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Redeploy so it takes effect.

### 3. Supabase function secrets

```
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  CHAT_ENABLED=true \
  UPSTASH_REDIS_REST_URL=... \
  UPSTASH_REDIS_REST_TOKEN=... \
  INTERNAL_API_TOKEN=<the SAME value as Vercel> \
  VERCEL_API_BASE=https://iconht.studio \
  CLIENT_URL=https://iconht.studio \
  SALON_TIMEZONE=America/New_York \
  ENVIRONMENT=production \
  --project-ref anysbhiiwsnuzksrlvtf
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not set them.

Notes:

- `VERCEL_API_BASE` — no trailing slash. Availability, booking, cancel and
  reschedule are all called through this.
- `CLIENT_URL` is the **CORS allowlist**. A request from any other origin gets a
  403. Never set it to `*`.
- `ENVIRONMENT=production` makes the rate limiters **fail closed**. Without it a
  broken Upstash silently means no rate limiting at all.
- `INTERNAL_API_TOKEN` must match Vercel **exactly**. It authenticates the
  *service*, never the *customer*: it is used only to choose a rate-limit
  bucket, and every action touching an appointment still requires that
  customer's own token.

### 4. Deploy the function

```
npm run deploy:chat
```

### 5. Vercel again — the client

| Key | Value |
|---|---|
| `VITE_CHAT_URL` | `https://anysbhiiwsnuzksrlvtf.supabase.co/functions/v1/chat` |
| `VITE_CHAT_ENABLED` | `true` |

Both are needed. With either missing the widget renders nothing at all — which
is the correct behaviour for a half-configured deploy, not a bug.

No CSP change is required: `vercel.json` already allows `https://*.supabase.co`
in `connect-src`.

## Switching it off

Fastest first:

| Want | Do | Effect |
|---|---|---|
| Hide the widget entirely | `VITE_CHAT_ENABLED=false` on Vercel, redeploy | No widget. Site identical to pre-Iris. |
| Keep the widget, stop the AI | `supabase secrets set CHAT_ENABLED=false` | Composer replaced by a note; **menu still books**. |
| Stop the spend, keep everything | Remove `ANTHROPIC_API_KEY` | Same as above. |

The first is a redeploy; the other two take effect on the next request.

## Checks before shipping

```
npm run typecheck     # client, server, api
npm run test          # vitest — includes the wire-contract check
npm run check:edge    # deno check + deno lint on this function
npm run test:edge     # deno test — pre-filter, intent boundary, history shaping
npm run eval          # golden set, dry run, free
npm run eval -- --live   # golden set against the real models — COSTS ~$0.30
```

Run `npm run eval -- --live` after **every** edit to `prompt.ts`, and bump
`PROMPT_VERSION` in the same commit. A prompt change that breaks topic control
throws no error — the model just starts answering strangers' homework on the
salon's account.

## Costs

Measured, not estimated — these are the numbers from a live run against the real
catalogue (55 services), at Sonnet 5's introductory rate of $2/$10 per MTok
through **2026-08-31**. After that date the Sonnet figures rise by half.

The system prompt renders to **5,652 tokens** and is cached; each turn adds only
about 112 volatile input tokens and produces about 75 output tokens.

| What the visitor did | Cost |
|---|---|
| Tapped a menu button | **$0** — never reaches a model |
| Asked something off-topic | $0.0004 — the Haiku classifier turns it away before Sonnet |
| Typed something in scope, cache warm | **$0.0025** |
| Typed something in scope, cache cold | $0.016 |

At roughly 200 conversations a month that is **about $4**.

The cache is the difference between $0.0025 and $0.012 a message, and it is
shared across every session because the prompt bytes are identical. Its TTL is
five minutes and every read renews it, so on a salon with any traffic at all
almost every message is warm. `cache_read` in the logs is how you know.

Seven limiters bound the worst case: 30 messages/hour per IP, 5/minute burst,
25/hour per session, 40/hour per signed-in account, **400/day globally**, a
60k-token/day budget per session, and a separate, much looser budget for menu
taps (200/hour, 60/minute) so the two never compete.

The global cap is the ceiling on spend — a bad day costs a few dollars, not
twenty. **Also set a spend limit in the Anthropic Console.** It is the only stop
that still works if something in `ratelimit.ts` is wrong.

Hitting any cap is not an outage. The customer gets a canned message and the
menu keeps booking.

## What to look at when something is wrong

Supabase → Edge Functions → chat → Logs. The function logs **no message
content, ever** — only structured lines:

- `{"at":"understand","prompt_version":...,"cache_read":N,...}` — one per model
  call. **`cache_read` should be non-zero from the second message of a session
  onward.** If it is always 0, prompt caching has stopped engaging and the cost
  roughly triples with no other symptom.
- `{"at":"safety","label":"self_harm"|"abusive"}` — a conversation was ended.
  Recorded without the message.
- `{"at":"guard","rule":"no_numbers"}` — the model wrote a price or a time and
  the reply was replaced. A few are normal; a lot means the prompt has drifted.
- `{"at":"validate",...}` — a malformed menu tap. Means the widget and the
  function are out of sync; check the wire contract test.
