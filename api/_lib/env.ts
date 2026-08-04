// Environment variable reader shared by every api/ module.
//
// Why not process.env directly: Vercel's env var UI stores the value verbatim,
// including quotes copy-pasted out of a .env file and any trailing newline.
// dotenv strips quotes when running locally, so a value that works on a laptop
// can be silently different in production.
//
// This existed as three separate private copies (emails.ts, sentry.ts,
// ratelimit.ts) and was missing entirely from auth.ts, which is the read that
// mattered most: auth.ts compares OWNER_EMAIL against the caller's JWT email,
// so a quoted value in the Vercel dashboard makes every admin request 401 with
// no hint that quoting was the cause. OWNER_EMAIL is also the one quoted key in
// the local .env, so it was the single most likely value to be pasted with its
// quotes attached.

/** Strips surrounding single/double quotes and trims whitespace. */
export function unquote(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.trim().replace(/^['"]|['"]$/g, '').trim();
}

/** Reads process.env[name] with quotes stripped and whitespace trimmed. */
export function envValue(name: string): string | undefined {
  return unquote(process.env[name]);
}
