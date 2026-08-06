// The quality gate for Iris — a golden set, not a vibe check.
//
//   npm run eval           dry run: pre-filter + scoring logic only, NO API calls, free
//   npm run eval -- --live the real thing, WHICH COSTS MONEY (see below)
//
// Run --live after every edit to prompt.ts, and bump PROMPT_VERSION in the same
// commit. A prompt change that quietly breaks topic control is otherwise
// invisible: nothing errors, the model just starts answering maths questions
// on the salon's account.
//
// COST. Roughly 70 cases. Every case runs the Haiku classifier (~$0.0004);
// in-scope cases also run Sonnet (~$0.005). Call it $0.30 a run. Small, but
// real, so --live is opt-in and never the default.
//
// Four scored dimensions, in order of how much they matter:
//
//   no-numbers    a deterministic regex over the reply. The most
//                 liability-relevant check and the cheapest one — a price Iris
//                 invents is the salon's legal problem (Moffatt v. Air Canada).
//   refusal       does an out-of-scope question get turned away.
//   intent        does a natural phrasing route to the right handler.
//   containment   the model never proposes a booking or a cancellation.

import { classify, isInScope, type Label } from '../supabase/functions/chat/classify.ts';
import {
  fetchLivePromotions,
  fetchServices,
  fetchStylistServices,
  fetchStylists,
} from '../supabase/functions/chat/catalog.ts';
import { buildSystemPrompt, PROMPT_VERSION } from '../supabase/functions/chat/prompt.ts';
import { containsNumbers, understand } from '../supabase/functions/chat/understand.ts';
import { prefilter } from '../supabase/functions/chat/prefilter.ts';
import { modelIntentSchema } from '../supabase/functions/chat/intents.ts';
import { salonNow, salonToday } from '../supabase/functions/chat/dates.ts';
import Anthropic from '@anthropic-ai/sdk';

interface GoldenCase {
  id: string;
  message: string;
  expect: {
    /** The classifier label this should get. */
    label?: Label;
    /** The intent the main model should propose. */
    intent?: string;
    /** Should be turned away rather than answered. */
    refuse?: boolean;
    /** Should be caught by the pre-filter, with no model call at all. */
    prefilter?: boolean;
    /** The reply must contain no price, time, duration or percentage. */
    neverNumbers?: boolean;
    /** These intents must never be proposed. */
    neverIntent?: string[];
  };
}

interface Score {
  id: string;
  dimension: 'no-numbers' | 'refusal' | 'intent' | 'containment' | 'prefilter';
  pass: boolean;
  detail: string;
}

const live = Deno.args.includes('--live');

async function loadCases(): Promise<GoldenCase[]> {
  const text = await Deno.readTextFile(new URL('./golden.jsonl', import.meta.url));
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GoldenCase);
}

function scorePrefilter(testCase: GoldenCase): Score | null {
  const verdict = prefilter(testCase.message);

  if (testCase.expect.prefilter) {
    return {
      id: testCase.id,
      dimension: 'prefilter',
      pass: verdict.blocked,
      detail: verdict.blocked ? `blocked (${verdict.reason})` : 'NOT blocked — reached the model',
    };
  }

  // A case that was not meant to be pre-filtered but was is a FALSE POSITIVE,
  // which is the failure mode that matters here: it turns away a real customer.
  if (verdict.blocked) {
    return {
      id: testCase.id,
      dimension: 'prefilter',
      pass: false,
      detail: `false positive — pre-filter blocked a legitimate message (${verdict.reason})`,
    };
  }

  return null;
}

async function main() {
  const cases = await loadCases();
  const scores: Score[] = [];

  console.log(`\nIris eval — prompt ${PROMPT_VERSION} — ${cases.length} cases`);
  console.log(live ? 'MODE: live (API calls will be billed)\n' : 'MODE: dry run (no API calls)\n');

  // --- pre-filter, free, always runs ---------------------------------------
  for (const testCase of cases) {
    const score = scorePrefilter(testCase);
    if (score) scores.push(score);
  }

  if (!live) {
    report(scores);
    console.log('Only the pre-filter dimension ran. Use `npm run eval -- --live` for the rest.\n');
    return;
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set. Aborting rather than reporting a false pass.');
    Deno.exit(1);
  }
  const client = new Anthropic({ apiKey });

  const [services, stylists, stylistServices, promotions] = await Promise.all([
    fetchServices(),
    fetchStylists(),
    fetchStylistServices(),
    fetchLivePromotions(),
  ]);
  if (services.length === 0) {
    console.error('No services loaded — check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
    Deno.exit(1);
  }
  const systemPrompt = buildSystemPrompt({
    services,
    stylists,
    stylistServices,
    promotions,
    now: Date.now(),
  });
  console.log(`Catalogue: ${services.length} services, ${stylists.length} stylists, ${promotions.length} live offers\n`);

  for (const testCase of cases) {
    // Already handled deterministically; sending it to a model would only cost
    // money to confirm what the pre-filter settled.
    if (prefilter(testCase.message).blocked) continue;

    const classification = await classify(client, testCase.message);

    if (testCase.expect.label) {
      scores.push({
        id: testCase.id,
        dimension: 'refusal',
        pass: classification.label === testCase.expect.label,
        detail: `label ${classification.label}, expected ${testCase.expect.label}`,
      });
    }

    if (testCase.expect.refuse) {
      scores.push({
        id: testCase.id,
        dimension: 'refusal',
        pass: !isInScope(classification.label),
        detail: isInScope(classification.label)
          ? `LEAKED — classified ${classification.label}, reached the main model`
          : `turned away (${classification.label})`,
      });
    }

    // Out of scope stops here in production, so the eval stops here too.
    if (!isInScope(classification.label)) continue;

    const result = await understand(client, {
      systemPrompt,
      message: testCase.message,
      node: 'root',
      draft: {},
      history: [],
      today: salonToday(),
      nowTime: salonNow(),
      signedIn: false,
    });

    // The cheapest and most important check.
    scores.push({
      id: testCase.id,
      dimension: 'no-numbers',
      pass: !containsNumbers(result.reply),
      detail: containsNumbers(result.reply) ? `WROTE A NUMBER: "${result.reply}"` : 'clean',
    });

    if (testCase.expect.intent) {
      scores.push({
        id: testCase.id,
        dimension: 'intent',
        pass: result.intent === testCase.expect.intent,
        detail: `got ${result.intent}, expected ${testCase.expect.intent}`,
      });
    }

    // Containment is checked on EVERY case, not only the ones that try to break
    // it. A forbidden intent would have to get past modelIntentSchema to do any
    // damage, but seeing the model attempt one is a signal worth surfacing.
    const forbidden = testCase.expect.neverIntent ?? [];
    const attempted = result.intent && forbidden.includes(result.intent);
    const outOfEnum = result.intent && !modelIntentSchema.safeParse(result.intent).success;
    scores.push({
      id: testCase.id,
      dimension: 'containment',
      pass: !attempted && !outOfEnum,
      detail: attempted
        ? `PROPOSED A FORBIDDEN INTENT: ${result.intent}`
        : outOfEnum
          ? `proposed an unknown intent: ${result.intent} (rejected by the enum in production)`
          : 'contained',
    });
  }

  report(scores);
}

function report(scores: Score[]) {
  const dimensions = ['no-numbers', 'refusal', 'intent', 'containment', 'prefilter'] as const;

  console.log('  dimension     pass  total   rate');
  console.log('  ' + '-'.repeat(38));
  for (const dimension of dimensions) {
    const rows = scores.filter((s) => s.dimension === dimension);
    if (rows.length === 0) continue;
    const passed = rows.filter((s) => s.pass).length;
    const rate = ((passed / rows.length) * 100).toFixed(0);
    console.log(`  ${dimension.padEnd(13)} ${String(passed).padStart(4)}  ${String(rows.length).padStart(5)}  ${rate.padStart(4)}%`);
  }

  const failures = scores.filter((s) => !s.pass);
  if (failures.length > 0) {
    console.log(`\n  ${failures.length} failure(s):`);
    for (const failure of failures) {
      console.log(`    [${failure.dimension}] ${failure.id}: ${failure.detail}`);
    }
  }

  console.log('');
  // A non-zero exit so this can gate a release rather than merely inform one.
  if (failures.length > 0) Deno.exit(1);
}

await main();
