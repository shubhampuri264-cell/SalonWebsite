import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
// vi.mock calls below are hoisted above this import, so the handler loads
// against the mocks.
import handler from '../admin/appointments';

// Handler tests for /api/admin/appointments, against an in-memory stand-in for
// the appointments table. The stand-in applies eq/neq/gte/lte/lt filters for
// real, so "cancel only if not already cancelled" and "counts skip cancelled"
// are exercised rather than assumed.
//
// This file sits in _lib on purpose: any other .ts file under api/ is deployed
// as a Vercel function, and the project is at the 12-function limit.

const TODAY = '2026-11-22';

/** Token-shaped strings; getUser below stands in for Supabase validating them. */
const jwt = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const OWNER_TOKEN = jwt({ sub: 'owner', session_id: 's-owner-approved' });
const OWNER_PASSWORD_ONLY = jwt({ sub: 'owner', session_id: 's-owner-password' });
const CUSTOMER_TOKEN = jwt({ sub: 'customer', session_id: 's-customer' });
const SAME_EMAIL_TOKEN = jwt({ sub: 'imposter', session_id: 's-imposter' });
/** How Supabase recorded each session being verified (auth.sessions). */
const SESSIONS: Record<string, { user_id: string; aal: string; factor_id: string | null }> = {
  's-owner-approved': { user_id: 'owner', aal: 'aal2', factor_id: 'her-app' },
  's-owner-password': { user_id: 'owner', aal: 'aal1', factor_id: null },
};
const NOW_MINUTES = 12 * 60; // 12:00 at the salon

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  /** Next error to return, keyed by operation kind. */
  failNext: {} as Partial<Record<'select' | 'update' | 'count', DbError>>,
  log: [] as { table: string; ops: [string, unknown[]][] }[],
}));

const { sendCancellationEmail, captureError, getUser, rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendCancellationEmail: vi.fn(),
  captureError: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('./supabase', () => {
  class Query {
    ops: [string, unknown[]][] = [];
    constructor(public table: string) {
      db.log.push(this);
    }
    private add(op: string, args: unknown[]) {
      this.ops.push([op, args]);
      return this;
    }
    select(...a: unknown[]) { return this.add('select', a); }
    update(...a: unknown[]) { return this.add('update', a); }
    eq(...a: unknown[]) { return this.add('eq', a); }
    neq(...a: unknown[]) { return this.add('neq', a); }
    gte(...a: unknown[]) { return this.add('gte', a); }
    lte(...a: unknown[]) { return this.add('lte', a); }
    lt(...a: unknown[]) { return this.add('lt', a); }
    or(...a: unknown[]) { return this.add('or', a); }
    order(...a: unknown[]) { return this.add('order', a); }
    range(...a: unknown[]) { return this.add('range', a); }
    maybeSingle() { return this.add('maybeSingle', []); }
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve().then(() => this.execute()).then(resolve, reject);
    }
    private execute() {
      const has = (op: string) => this.ops.find(([o]) => o === op);
      const selectOpts = (has('select')?.[1][1] ?? {}) as { count?: string; head?: boolean };
      const kind = has('update') ? 'update' : selectOpts.head ? 'count' : 'select';
      const err = db.failNext[kind];
      if (err) {
        delete db.failNext[kind];
        return { data: null, count: null, error: err };
      }

      let matched = db.rows.filter((row) =>
        this.ops.every(([op, [col, val]]) => {
          const v = row[col as string] as string;
          switch (op) {
            case 'eq': return v === val;
            case 'neq': return v !== val;
            case 'gte': return v >= (val as string);
            case 'lte': return v <= (val as string);
            case 'lt': return v < (val as string);
            default: return true; // or(): search is covered by the pure tests
          }
        }),
      );

      const update = has('update');
      if (update) {
        for (const row of matched) Object.assign(row, update[1][0]);
      }
      const total = matched.length;
      const range = has('range');
      if (range) {
        const [from, to] = range[1] as [number, number];
        if (from > 0 && from >= total) {
          return { data: null, count: null, error: { code: 'PGRST103', message: 'range' } };
        }
        matched = matched.slice(from, to + 1);
      }
      const copies = matched.map((row) => ({ ...row }));
      if (selectOpts.head) return { data: null, count: total, error: null };
      if (has('maybeSingle')) return { data: copies[0] ?? null, error: null };
      return { data: copies, count: selectOpts.count ? total : null, error: null };
    }
  }
  return {
    supabaseAdmin: {
      from: (table: string) => new Query(table),
      auth: { getUser },
      rpc,
    },
  };
});

vi.mock('./ratelimit', () => ({ enforceRateLimit: vi.fn(async () => true) }));
vi.mock('./sentry', () => ({ captureError }));
vi.mock('./emails', () => ({ sendCancellationEmail }));
vi.mock('./dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dates')>()),
  salonToday: () => TODAY,
  salonNowMinutes: () => NOW_MINUTES,
}));

const ids = {
  future: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
  todayLater: '2c5ea4c0-4067-41fa-9f2a-0e1f6e2c1b9a',
  todayEarlier: '3d8f1e2a-5b6c-4d7e-8f90-a1b2c3d4e5f6',
  past: '4e9a2b3c-6d7e-4f80-9a1b-c2d3e4f5a6b7',
  cancelled: '5fab3c4d-7e8f-4091-8b2c-d3e4f5a6b7c8',
  missing: '6abc4d5e-8f90-41a2-9c3d-e4f5a6b7c8d9',
};

function booking(id: string, appointment_date: string, appointment_time: string, status = 'confirmed'): Row {
  return {
    id,
    stylist_id: '7bcd5e6f-9012-42b3-8d4e-f5a6b7c8d9e0',
    service_id: '8cde6f70-0123-43c4-9e5f-a6b7c8d9e0f1',
    client_name: 'Jane Doe',
    client_email: 'jane@example.com',
    client_phone: '(718) 555-0101',
    appointment_date,
    appointment_time,
    duration_min: 30,
    notes: null,
    status,
    cancellation_token: '9def7081-1234-44d5-af60-b7c8d9e0f1a2',
    services: { name: 'Haircut', category: 'hair' },
    stylists: { name: 'Sumita Karki' },
  };
}

interface MockRes {
  statusCode: number;
  body: unknown;
}

async function call(
  method: string,
  { query = {}, body, token = OWNER_TOKEN }: { query?: Record<string, unknown>; body?: unknown; token?: string | null } = {},
) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
  const req = {
    method,
    query,
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  // Response JSON is read loosely; each test asserts the fields it cares about.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res as MockRes & { body: Record<string, any> };
}

const cancel = (id: string) => call('PATCH', { query: { id }, body: { status: 'cancelled' } });
const rowStatus = (id: string) => db.rows.find((r) => r.id === id)?.status;

beforeEach(() => {
  db.rows = [
    booking(ids.future, '2026-11-28', '14:30'),
    booking(ids.todayLater, TODAY, '15:00'),
    booking(ids.todayEarlier, TODAY, '09:30'),
    booking(ids.past, '2026-11-20', '11:00', 'completed'),
    booking(ids.cancelled, '2026-11-25', '10:00', 'cancelled'),
  ];
  db.failNext = {};
  db.log = [];
  sendCancellationEmail.mockResolvedValue(true);
  rpc.mockImplementation(async (_fn: string, args: { p_session_id: string }) => {
    const row = SESSIONS[args.p_session_id];
    return { data: row ? [row] : [], error: null };
  });
  getUser.mockImplementation(async (token: string) => {
    const owner = { id: 'owner', email: 'owner@example.com', app_metadata: { role: 'owner', owner_factor_id: 'her-app' } };
    const user = {
      [OWNER_TOKEN]: owner,
      [OWNER_PASSWORD_ONLY]: owner,
      [CUSTOMER_TOKEN]: { id: 'customer', email: 'jane@example.com', app_metadata: {} },
      // Signed up with the owner's address: emails are not verified here.
      [SAME_EMAIL_TOKEN]: { id: 'imposter', email: 'owner@example.com', app_metadata: {} },
    }[token];
    return user
      ? { data: { user }, error: null }
      : { data: { user: null }, error: { message: 'invalid JWT' } };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('login', () => {
  it('refuses a request with no login', async () => {
    const res = await call('GET', { token: null });
    expect(res.statusCode).toBe(401);
    expect(db.log).toHaveLength(0);
  });

  it("refuses a customer's login", async () => {
    const res = await call('GET', { token: CUSTOMER_TOKEN });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('NOT_OWNER');
    expect(db.log).toHaveLength(0);
  });

  it("refuses an account that only shares the owner's email address", async () => {
    const res = await call('GET', { token: SAME_EMAIL_TOKEN });
    expect(res.statusCode).toBe(403);
    expect(db.log).toHaveLength(0);
  });

  it('refuses the owner signed in with a password only', async () => {
    const res = await call('GET', { token: OWNER_PASSWORD_ONLY });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('MFA_REQUIRED');
    expect(db.log).toHaveLength(0);
  });

  it('refuses a cancel from a customer, and sends nothing', async () => {
    const res = await call('PATCH', { query: { id: ids.future }, body: { status: 'cancelled' }, token: CUSTOMER_TOKEN });
    expect(res.statusCode).toBe(403);
    expect(rowStatus(ids.future)).toBe('confirmed');
    expect(sendCancellationEmail).not.toHaveBeenCalled();
  });

  it('accepts the owner', async () => {
    expect((await call('GET')).statusCode).toBe(200);
  });

  it('"am I the owner?" answers without touching bookings', async () => {
    const res = await call('GET', { query: { me: '1' } });
    expect(res.body).toEqual({ owner: true });
    expect(db.log).toHaveLength(0);
    expect((await call('GET', { query: { me: '1' }, token: OWNER_PASSWORD_ONLY })).body.code).toBe('MFA_REQUIRED');
  });
});

describe('cancelling', () => {
  it('sends exactly one email', async () => {
    const res = await cancel(ids.future);
    expect(res.statusCode).toBe(200);
    expect(res.body.email).toEqual({ status: 'sent' });
    expect(res.body.appointment.status).toBe('cancelled');
    expect(rowStatus(ids.future)).toBe('cancelled');
    expect(sendCancellationEmail).toHaveBeenCalledTimes(1);
    expect(sendCancellationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: ids.future, client_email: 'jane@example.com' }),
      'Haircut',
    );
  });

  it('a second cancel sends none', async () => {
    await cancel(ids.future);
    const again = await cancel(ids.future);
    expect(again.statusCode).toBe(200);
    expect(again.body.email).toEqual({ status: 'skipped', reason: 'already_cancelled' });
    expect(sendCancellationEmail).toHaveBeenCalledTimes(1);
  });

  it('two taps at once send one email', async () => {
    await Promise.all([cancel(ids.future), cancel(ids.future)]);
    expect(sendCancellationEmail).toHaveBeenCalledTimes(1);
  });

  it('a failed email still cancels, and says so', async () => {
    sendCancellationEmail.mockRejectedValue(new Error('Resend rejected send'));
    const res = await cancel(ids.future);
    expect(res.statusCode).toBe(200);
    expect(rowStatus(ids.future)).toBe('cancelled');
    expect(res.body.email).toEqual({ status: 'failed' });
    expect(captureError).toHaveBeenCalled();
  });

  it('email not configured counts as failed', async () => {
    sendCancellationEmail.mockResolvedValue(false);
    const res = await cancel(ids.future);
    expect(res.body.email).toEqual({ status: 'failed' });
  });

  it('a past booking sends no email', async () => {
    const res = await cancel(ids.past);
    expect(res.body.email).toEqual({ status: 'skipped', reason: 'past' });
    expect(rowStatus(ids.past)).toBe('cancelled');
    expect(sendCancellationEmail).not.toHaveBeenCalled();
  });

  it("today's booking that already started sends no email; a later one does", async () => {
    expect((await cancel(ids.todayEarlier)).body.email).toEqual({ status: 'skipped', reason: 'past' });
    expect((await cancel(ids.todayLater)).body.email).toEqual({ status: 'sent' });
    expect(sendCancellationEmail).toHaveBeenCalledTimes(1);
  });

  it('never returns the cancellation token', async () => {
    const res = await cancel(ids.future);
    expect(res.body.appointment).not.toHaveProperty('cancellation_token');
  });

  it('a booking that does not exist is "not found"', async () => {
    const res = await cancel(ids.missing);
    expect(res.statusCode).toBe(404);
    expect(sendCancellationEmail).not.toHaveBeenCalled();
  });

  it('a database failure reports a plain message, not the raw error', async () => {
    db.failNext.update = { code: 'XX000', message: 'relation "appointments" column secret_col' };
    const res = await cancel(ids.future);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret_col');
    expect(sendCancellationEmail).not.toHaveBeenCalled();
  });
});

describe('other status changes', () => {
  it.each(['confirmed', 'completed', 'no_show'])('marking %s sends no email', async (status) => {
    const res = await call('PATCH', { query: { id: ids.future }, body: { status } });
    expect(res.statusCode).toBe(200);
    expect(res.body.appointment.status).toBe(status);
    expect(res.body.email).toBeUndefined();
    expect(sendCancellationEmail).not.toHaveBeenCalled();
  });

  it('restoring a cancelled booking whose time was rebooked says someone else booked it', async () => {
    db.failNext.update = { code: '23P01', message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"' };
    const res = await call('PATCH', { query: { id: ids.cancelled }, body: { status: 'confirmed' } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'That time has since been booked by someone else.', code: 'SLOT_TAKEN' });
  });

  it('a booking that does not exist is "not found", not a server error', async () => {
    const res = await call('PATCH', { query: { id: ids.missing }, body: { status: 'completed' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('bad inputs are rejected before the database', () => {
  it.each([
    ['a non-uuid id', { id: 'abc' }, { status: 'cancelled' }],
    ['an unknown status', { id: ids.future }, { status: 'deleted' }],
    ['an unknown field', { id: ids.future }, { status: 'confirmed', client_email: 'x@y.z' }],
    ['an empty body', { id: ids.future }, {}],
    ['over-long notes', { id: ids.future }, { notes: 'x'.repeat(501) }],
  ])('PATCH with %s', async (_label, query, body) => {
    const res = await call('PATCH', { query, body });
    expect(res.statusCode).toBe(400);
    expect(db.log).toHaveLength(0);
  });

  it.each([
    ['a search with filter syntax', { q: 'a,status.eq.cancelled' }],
    ['a search with a wildcard', { q: '%' }],
    ['an impossible date', { from: '2026-02-30' }],
    ['an unknown view', { view: 'deleted' }],
  ])('GET with %s', async (_label, query) => {
    const res = await call('GET', { query });
    expect(res.statusCode).toBe(400);
    expect(db.log).toHaveLength(0);
  });

  it('DELETE is gone: booking history cannot be wiped', async () => {
    const res = await call('DELETE', { query: { id: ids.future } });
    expect(res.statusCode).toBe(405);
    expect(db.rows).toHaveLength(5);
  });
});

describe('listing', () => {
  it('defaults to upcoming, soonest first, without cancelled bookings', async () => {
    const res = await call('GET');
    expect(res.body.today).toBe(TODAY);
    expect(res.body.appointments.map((a: Row) => a.id).sort()).toEqual(
      [ids.future, ids.todayLater, ids.todayEarlier].sort(),
    );
    expect(res.body.total).toBe(3);
    const orders = db.log[0].ops.filter(([op]) => op === 'order').map(([, args]) => args);
    expect(orders).toEqual([
      ['appointment_date', { ascending: true }],
      ['appointment_time', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('past is before today, newest first', async () => {
    const res = await call('GET', { query: { view: 'past' } });
    expect(res.body.appointments.map((a: Row) => a.id)).toEqual([ids.past]);
    const orders = db.log[0].ops.filter(([op]) => op === 'order').map(([, args]) => args);
    expect(orders[0]).toEqual(['appointment_date', { ascending: false }]);
  });

  it('status=any includes cancelled', async () => {
    const res = await call('GET', { query: { view: 'all', status: 'any' } });
    expect(res.body.total).toBe(5);
  });

  it('passes the search to the database as one escaped or() filter', async () => {
    await call('GET', { query: { q: '718-555' } });
    const or = db.log[0].ops.find(([op]) => op === 'or');
    expect(or?.[1][0]).toContain('client_phone.match."7[^0-9]*1[^0-9]*8[^0-9]*5[^0-9]*5[^0-9]*5"');
  });

  it('pages 50 at a time with a total', async () => {
    db.rows = Array.from({ length: 120 }, (_, i) =>
      booking(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, '2026-12-01', '10:00'),
    );
    const first = await call('GET');
    expect(first.body.appointments).toHaveLength(50);
    expect(first.body.total).toBe(120);
    const last = await call('GET', { query: { offset: '100' } });
    expect(last.body.appointments).toHaveLength(20);
    const beyond = await call('GET', { query: { offset: '150' } });
    expect(beyond.statusCode).toBe(200);
    expect(beyond.body.appointments).toHaveLength(0);
  });

  it('export returns every match, not one page', async () => {
    db.rows = Array.from({ length: 1234 }, (_, i) =>
      booking(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, '2026-12-01', '10:00'),
    );
    const res = await call('GET', { query: { export: '1' } });
    expect(res.body.appointments).toHaveLength(1234);
    expect(res.body.total).toBe(1234);
    expect(res.body.truncated).toBe(false);
  });

  it('a database failure reports a plain message, not the raw error', async () => {
    db.failNext.select = { code: '42P01', message: 'relation "secret_table" does not exist' };
    const res = await call('GET');
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret_table');
  });
});

describe('dashboard counts', () => {
  beforeEach(() => {
    db.rows = [
      booking(ids.todayLater, TODAY, '15:00'), // today (Sunday)
      booking(ids.todayEarlier, TODAY, '09:30', 'cancelled'), // today, cancelled
      booking(ids.past, '2026-11-16', '11:00', 'completed'), // this week (Monday)
      booking(ids.cancelled, '2026-11-18', '10:00', 'cancelled'), // this week, cancelled
      booking(ids.future, '2026-11-28', '14:30'), // this month, upcoming
      booking(ids.missing, '2026-12-02', '10:00'), // next month, upcoming
      booking('aaaa1111-2222-4333-8444-555566667777', '2026-12-03', '10:00', 'cancelled'),
      booking('bbbb1111-2222-4333-8444-555566667777', '2026-10-31', '10:00'), // last month
    ];
  });

  it('counts today, this week (Mon-Sun), this month and upcoming, never cancelled', async () => {
    const res = await call('GET', { query: { summary: '1' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.week).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(res.body.counts).toEqual({ today: 1, week: 2, month: 3, upcoming: 3 });
  });

  it('every count query excludes cancelled and downloads no rows', async () => {
    await call('GET', { query: { summary: '1' } });
    expect(db.log).toHaveLength(4);
    for (const q of db.log) {
      expect(q.ops).toContainEqual(['neq', ['status', 'cancelled']]);
      expect(q.ops.find(([op]) => op === 'select')?.[1][1]).toEqual({ count: 'exact', head: true });
    }
  });

  it('a failed count is an error, never a zero', async () => {
    db.failNext.count = { code: 'XX000', message: 'boom' };
    const res = await call('GET', { query: { summary: '1' } });
    expect(res.statusCode).toBe(500);
    expect(res.body.counts).toBeUndefined();
  });
});
