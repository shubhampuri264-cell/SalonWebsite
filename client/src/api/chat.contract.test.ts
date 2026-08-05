import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Card and Chip types are declared TWICE: once in the Deno Edge Function
// that produces them (supabase/functions/chat/handlers.ts) and once in the
// browser client that renders them (client/src/api/chat.ts).
//
// They have to be, because a Deno module cannot be imported by Vite and a
// shared package built for both runtimes would be a build pipeline for two type
// aliases. The duplication is accepted; going UNNOTICED is not.
//
// Drift here is silent and nasty: the server starts sending `offer_text` while
// the card reads `offerText`, TypeScript is happy on both sides because each
// compiles against its own copy, and the customer sees a blank promotion. So
// the two declarations are compared as text on every CI run.
//
// If this fails, edit BOTH files. Do not edit the test to make it pass.

const ROOT = resolve(__dirname, '../../..');
const SERVER = resolve(ROOT, 'supabase/functions/chat/handlers.ts');
const CLIENT = resolve(ROOT, 'client/src/api/chat.ts');

/** Pulls out `export type Card = ...` up to the first line that ends the union. */
function extractCardUnion(source: string): string {
  const start = source.indexOf('export type Card =');
  expect(start, 'Card union not found').toBeGreaterThan(-1);
  const end = source.indexOf('| { type: \'signIn\' };', start);
  expect(end, 'Card union terminator not found').toBeGreaterThan(-1);
  return source.slice(start, end + '| { type: \'signIn\' };'.length);
}

function extractChipInterface(source: string): string {
  const start = source.indexOf('export interface Chip {');
  expect(start, 'Chip interface not found').toBeGreaterThan(-1);
  const end = source.indexOf('}', start);
  return source.slice(start, end + 1);
}

/**
 * Whitespace and the `IntentId` vs `string` difference are not drift.
 *
 * The server types `Chip.intent` as its own `IntentId` union; the client types
 * it as `string`, because the client has no business enumerating intents — it
 * echoes back whatever the server sent. Everything else must match exactly.
 */
function normalise(block: string): string {
  return block
    .replace(/intent:\s*IntentId/g, 'intent: string')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('chat wire contract', () => {
  const server = readFileSync(SERVER, 'utf8');
  const client = readFileSync(CLIENT, 'utf8');

  it('the Card union is identical on both sides', () => {
    expect(normalise(extractCardUnion(client))).toBe(normalise(extractCardUnion(server)));
  });

  it('the Chip shape is identical on both sides', () => {
    expect(normalise(extractChipInterface(client))).toBe(normalise(extractChipInterface(server)));
  });

  it('every card type the server can emit is handled by the renderer', () => {
    const cardsComponent = readFileSync(
      resolve(ROOT, 'client/src/components/chat/ChatCards.tsx'),
      'utf8',
    );
    const types = [...extractCardUnion(server).matchAll(/type:\s*'(\w+)'/g)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(5);
    for (const type of types) {
      // A missing case would render nothing at all — no error, just an empty
      // space where the price card should be.
      expect(cardsComponent, `ChatCards.tsx has no case for '${type}'`).toContain(`case '${type}':`);
    }
  });
});
