// The history shaping is the one piece of understand.ts that can be tested
// without calling a model, and it is also the piece whose failure is invisible:
// a malformed message list makes the API 400, understand() catches its own
// errors, and free text silently degrades to "I didn't catch that" forever.

import { assertEquals } from '@std/assert';
import { toApiHistory } from './understand.ts';

Deno.test('drops a greeting-only history — menu taps record no user turn', () => {
  // What a session looks like after tapping the launcher and nothing else.
  assertEquals(toApiHistory([{ role: 'assistant', text: "I'm Iris." }]), []);
});

Deno.test('drops leading assistant turns so the first message is from the user', () => {
  // The bug this exists for: tap "Book an appointment", then type. Without the
  // trim the first message is an assistant turn and the request is rejected.
  const result = toApiHistory([
    { role: 'assistant', text: "I'm Iris." },
    { role: 'assistant', text: 'What are you booking in for?' },
    { role: 'user', text: 'a balayage' },
    { role: 'assistant', text: 'Who would you like to see?' },
  ]);
  assertEquals(result, [
    { role: 'user', content: 'a balayage' },
    { role: 'assistant', content: 'Who would you like to see?' },
  ]);
});

Deno.test('merges consecutive assistant turns rather than sending them raw', () => {
  // Ordinary mid-conversation shape: type a message, then tap two chips.
  const result = toApiHistory([
    { role: 'user', text: 'do you do balayage' },
    { role: 'assistant', text: 'We do.' },
    { role: 'assistant', text: 'Which day suits you?' },
  ]);
  assertEquals(result, [
    { role: 'user', content: 'do you do balayage' },
    { role: 'assistant', content: 'We do.\n\nWhich day suits you?' },
  ]);
});

Deno.test('keeps an ordinary alternating transcript intact', () => {
  const history = [
    { role: 'user' as const, text: 'how much is threading' },
    { role: 'assistant' as const, text: 'Prices are below.' },
    { role: 'user' as const, text: 'book me in' },
    { role: 'assistant' as const, text: 'Which day?' },
  ];
  assertEquals(toApiHistory(history), [
    { role: 'user', content: 'how much is threading' },
    { role: 'assistant', content: 'Prices are below.' },
    { role: 'user', content: 'book me in' },
    { role: 'assistant', content: 'Which day?' },
  ]);
});

Deno.test('never ends on a user turn, which would sit beside the live message', () => {
  const result = toApiHistory([
    { role: 'user', text: 'first' },
    { role: 'assistant', text: 'reply' },
    { role: 'user', text: 'second' },
  ]);
  assertEquals(result[result.length - 1].role, 'assistant');
});

Deno.test('an empty history is empty, not malformed', () => {
  assertEquals(toApiHistory([]), []);
});
