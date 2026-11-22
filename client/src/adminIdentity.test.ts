import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guard for audit finding H1 (.claude/audit-2026-11-22-admin-access.md).
//
// Every import.meta.env.VITE_* value is compiled into the public JavaScript.
// The owner's login email used to be one (VITE_OWNER_EMAIL, read by an
// isOwner() helper), which published the admin login address to every
// visitor. Who the owner is is decided by the server alone
// (api/_lib/auth.ts); client code must not try to know.

const SRC = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('admin identity stays out of the public bundle', () => {
  const files = sourceFiles(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

  it('scans the client source', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each([
    ['an owner env variable', /VITE_OWNER_/],
    ['an email-based owner check', /\bisOwner\s*\(/],
    ['a Gmail address', /[a-z0-9._%+-]+@gmail\.com/i],
  ])('no client file contains %s', (_label, pattern) => {
    const offenders = files.filter(({ text }) => pattern.test(text)).map(({ file }) => file.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
});

// The repository is public, so the same rule covers every tracked file:
// migrations, docs and scripts too. The owner's login address once sat in
// several SQL files and a doc. Test fixtures may use made-up Gmail addresses
// (e.g. an "imposter" account), so *.test.* files are skipped.
describe('no personal Gmail address in the public repository', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file && !/\.test\.[cm]?[jt]sx?$/.test(file) && !/(^|\/)(package-lock\.json|deno\.lock)$/.test(file))
    .filter((file) => /\.(ts|tsx|js|mjs|cjs|sql|md|json|html|ya?ml|toml|txt)$|^\.env\.example$/.test(file));

  it('scans the tracked files', () => {
    expect(tracked.length).toBeGreaterThan(100);
  });

  it('no tracked file contains a Gmail address', () => {
    const offenders = tracked.filter((file) => /[a-z0-9._%+-]+@gmail\.com/i.test(readFileSync(join(root, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
