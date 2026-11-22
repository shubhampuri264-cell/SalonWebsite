import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    // supabase/ and evals/ are Deno code, already linted by `deno lint` via
    // npm run check:edge. dist/ and graphify-out/ are generated output.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'supabase/**',
      'evals/**',
      'graphify-out/**',
      'client/public/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // tsconfig noUnusedLocals already fails the build on real unused code;
      // the underscore convention marks intentional placeholders (_req, _next).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // A handful of deliberate any-casts exist at DB boundaries (Supabase
      // joined rows). Surface them without failing the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Permits the standard `declare global { namespace Express }` request
      // augmentation in server/src/middleware/auth.ts.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  {
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Admin failures used to go to console.error only: the owner tapped a
    // button, the server refused, and the screen looked as if it had worked.
    // Errors on these screens go to a banner and to Sentry (see
    // pages/admin/adminUi.tsx toFailure), never to the console.
    files: ['client/src/pages/admin/**/*.{ts,tsx}'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['server/**/*.ts', 'api/**/*.ts', '*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // One-off CommonJS tooling scripts. Puppeteer page.evaluate callbacks run
    // in the browser, hence the browser globals alongside node.
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Puppeteer browser checks (npm run test:admin-ui): node script whose
    // page.evaluate callbacks run in the browser.
    files: ['e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  }
);
