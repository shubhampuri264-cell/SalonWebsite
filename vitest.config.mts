import { defineConfig } from 'vitest/config';

// Deliberately narrow. This repo had zero test infrastructure, and the goal is
// not blanket coverage — it is a fast gate over the pure functions whose
// failure modes are silent and expensive (booking window validation, price
// formatting, the chat pre-filter and intent schemas). Anything needing a live
// Supabase, Upstash or Anthropic is verified manually against a preview deploy
// instead; see the verification tables in the plan.
export default defineConfig({
  test: {
    // `node`, not jsdom: everything covered here is a pure function. A file
    // that genuinely needs a DOM can opt in with a
    // `// @vitest-environment jsdom` pragma once jsdom is installed.
    environment: 'node',
    include: [
      'api/**/*.test.ts',
      'packages/**/src/**/*.test.ts',
      'client/src/**/*.test.ts',
    ],
    // supabase/functions is excluded on purpose. Those files are Deno modules:
    // they import with explicit `.ts` extensions, resolve dependencies through
    // `npm:` specifiers, and read `Deno.env` — none of which vitest can load.
    // They have their own suite, run by `npm run test:edge` (deno test) and by
    // the same CI job. Both run on every PR; only the runner differs.
    exclude: ['**/node_modules/**', '**/dist/**', 'server/**', 'supabase/**'],
  },
});
