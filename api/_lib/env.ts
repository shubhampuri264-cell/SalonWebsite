// Environment variable reader shared by every api/ module.
//
// Why not process.env directly: Vercel's env var UI stores the value verbatim,
// including quotes copy-pasted out of a .env file and any trailing newline.
// dotenv strips quotes when running locally, so a value that works on a laptop
// can be silently different in production.
//
// This existed as three separate private copies (emails.ts, sentry.ts,
// ratelimit.ts) and was once missing from auth.ts, where a quoted OWNER_EMAIL
// in the Vercel dashboard made every admin request 401 with no hint that
// quoting was the cause. (The admin check no longer reads OWNER_EMAIL; it uses
// the owner role on the account -- see auth.ts checkAdmin.)

/** Strips surrounding single/double quotes and trims whitespace. */
export function unquote(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.trim().replace(/^['"]|['"]$/g, '').trim();
}

/** Reads process.env[name] with quotes stripped and whitespace trimmed. */
export function envValue(name: string): string | undefined {
  return unquote(process.env[name]);
}
