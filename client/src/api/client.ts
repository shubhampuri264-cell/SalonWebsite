// In production the client and API are served from the same Vercel project,
// so empty BASE_URL = relative paths = always same-origin (no CORS). This is
// intentional: a hardcoded prod URL (e.g. https://iconht.studio) bakes into the
// bundle at build time and breaks any time the page is served from a different
// domain (preview deploys, alternate vanity domains, etc.).
// VITE_API_BASE_URL is honored only in dev, for pointing the Vite dev server at
// a separately-running backend.
//
// It MUST be an absolute origin (http://host:port). A relative value such as
// "/api" would be prefixed onto paths that already begin with /api, producing
// "/api/api/services" — a 404 that looks like a broken endpoint rather than a
// broken config. Anything non-absolute is therefore ignored rather than
// silently concatenated. The normal dev setup needs no value at all: Vite
// proxies /api to `vercel dev` (see vite.config.ts), so relative paths work
// exactly as they do in production.
const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const configuredBaseUrl =
  rawBaseUrl && /^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl.replace(/\/+$/, '') : '';

if (import.meta.env.DEV && rawBaseUrl && !configuredBaseUrl) {
  console.warn(
    `[api] Ignoring VITE_API_BASE_URL="${rawBaseUrl}" — it must be an absolute ` +
      'origin like http://localhost:3000. Using same-origin requests instead.'
  );
}

const BASE_URL = import.meta.env.DEV ? configuredBaseUrl : '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, ...init } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    const message =
      (data as Record<string, string>)?.error ?? `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
