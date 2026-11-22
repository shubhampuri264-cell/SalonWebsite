import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkAdmin, requireAdmin } from './auth';

// Who may use the admin API. Supabase is mocked: getUser stands in for its
// token validation (keyed by token string), and the admin_session_assurance
// RPC for its record of how each session was verified (keyed by session id).

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabaseAdmin: { auth: { getUser }, rpc } }));

const OWNER_ID = 'owner-id';
const HER_APP = 'factor-hers';
const OTHER_APP = 'factor-someone-else';

/** A token-shaped string whose payload carries the given claims. */
const token = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const bearer = (sessionId: string, extra: Record<string, unknown> = {}) =>
  `Bearer ${token({ sub: OWNER_ID, session_id: sessionId, ...extra })}`;

const owner = (appMetadata: Record<string, unknown> = { role: 'owner', owner_factor_id: HER_APP }) => ({
  id: OWNER_ID,
  email: 'owner@gmail.com',
  app_metadata: appMetadata,
  user_metadata: {},
});

function givenUser(user: Record<string, unknown> | null) {
  getUser.mockResolvedValue(
    user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } },
  );
}

/** How Supabase recorded each session id being verified. */
let sessions: Record<string, { user_id: string; aal: string; factor_id: string | null }>;

beforeEach(() => {
  sessions = {
    'password-only': { user_id: OWNER_ID, aal: 'aal1', factor_id: null },
    'her-app': { user_id: OWNER_ID, aal: 'aal2', factor_id: HER_APP },
    'other-app': { user_id: OWNER_ID, aal: 'aal2', factor_id: OTHER_APP },
    'someone-elses-session': { user_id: 'another-user', aal: 'aal2', factor_id: HER_APP },
  };
  rpc.mockImplementation(async (_fn: string, args: { p_session_id: string }) => {
    const row = sessions[args.p_session_id];
    return { data: row ? [row] : [], error: null };
  });
});

afterEach(() => vi.clearAllMocks());

describe('checkAdmin', () => {
  it('refuses a request with no login, without asking Supabase', async () => {
    expect(await checkAdmin(undefined)).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await checkAdmin('Basic abc')).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses a token Supabase does not accept (expired, forged, signed out)', async () => {
    givenUser(null);
    expect(await checkAdmin(bearer('her-app'))).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a customer's login", async () => {
    givenUser({ id: 'c1', email: 'jane@example.com', app_metadata: {}, user_metadata: {} });
    expect(await checkAdmin(bearer('her-app'))).toEqual({ ok: false, code: 'NOT_OWNER' });
  });

  it("refuses an account that merely has the owner's email address", async () => {
    // Emails are not verified at sign-up. The old check trusted the address;
    // this is the account that would have been let in.
    givenUser({ id: 'imposter', email: 'owner@gmail.com', app_metadata: { provider: 'email' }, user_metadata: {} });
    expect(await checkAdmin(bearer('her-app'))).toEqual({ ok: false, code: 'NOT_OWNER' });
  });

  it('ignores a role the user set on themselves (user_metadata is user-writable)', async () => {
    givenUser({ id: 'c2', email: 'x@example.com', app_metadata: {}, user_metadata: { role: 'owner' } });
    expect(await checkAdmin(bearer('her-app'))).toEqual({ ok: false, code: 'NOT_OWNER' });
  });

  it('refuses the owner signed in with a password only', async () => {
    givenUser(owner());
    expect(await checkAdmin(bearer('password-only'))).toEqual({ ok: false, code: 'MFA_REQUIRED' });
  });

  it('trusts the database over a token that claims aal2', async () => {
    givenUser(owner());
    expect(await checkAdmin(bearer('password-only', { aal: 'aal2' }))).toEqual({ ok: false, code: 'MFA_REQUIRED' });
  });

  it('refuses an authenticator someone else added with her password', async () => {
    givenUser(owner());
    expect(await checkAdmin(bearer('other-app'))).toEqual({ ok: false, code: 'FACTOR_NOT_APPROVED' });
  });

  it('refuses every authenticator until one is approved', async () => {
    givenUser(owner({ role: 'owner' }));
    expect(await checkAdmin(bearer('her-app'))).toEqual({ ok: false, code: 'FACTOR_NOT_APPROVED' });
  });

  it('refuses a token without a session, or whose session is gone or not hers', async () => {
    givenUser(owner());
    expect(await checkAdmin(`Bearer ${token({ sub: OWNER_ID })}`)).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await checkAdmin('Bearer not.a-json-payload.sig')).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await checkAdmin(bearer('signed-out'))).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(await checkAdmin(bearer('someone-elses-session'))).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it('fails closed, and says so, when the session lookup errors', async () => {
    givenUser(owner());
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    expect(await checkAdmin(bearer('her-app'))).toEqual({ ok: false, code: 'UNAVAILABLE' });
  });

  it('accepts the owner verified with her approved authenticator', async () => {
    givenUser(owner());
    expect(await checkAdmin(bearer('her-app'))).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('admin_session_assurance', { p_session_id: 'her-app' });
  });
});

describe('requireAdmin responses', () => {
  async function respond(authorization?: string) {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { this.body = payload; return this; },
    };
    const ok = await requireAdmin(
      { headers: authorization ? { authorization } : {} } as VercelRequest,
      res as unknown as VercelResponse,
    );
    return { ok, status: res.statusCode, body: res.body };
  }

  it('401 when not signed in', async () => {
    expect(await respond()).toEqual({ ok: false, status: 401, body: { error: 'Unauthorized', code: 'UNAUTHENTICATED' } });
  });

  it.each([
    ['NOT_OWNER', () => givenUser({ id: 'c1', email: 'jane@example.com', app_metadata: {} }), 'her-app'],
    ['MFA_REQUIRED', () => givenUser(owner()), 'password-only'],
    ['FACTOR_NOT_APPROVED', () => givenUser(owner()), 'other-app'],
  ])('403 %s', async (code, setup, session) => {
    setup();
    expect(await respond(bearer(session))).toMatchObject({ ok: false, status: 403, body: { code } });
  });

  it('503 UNAVAILABLE when the check itself fails', async () => {
    givenUser(owner());
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    expect(await respond(bearer('her-app'))).toMatchObject({ ok: false, status: 503, body: { code: 'UNAVAILABLE' } });
  });

  it('lets the verified owner through without writing a response', async () => {
    givenUser(owner());
    expect(await respond(bearer('her-app'))).toEqual({ ok: true, status: 200, body: undefined });
  });
});
