// Browser checks for the owner's admin screens, against FAKE data.
//
//   npm run build -w client && npm run test:admin-ui
//
// Serves client/dist with `vite preview`, injects a fake owner session, and
// answers every /api/* and Supabase request from memory -- nothing reaches a
// real server and no real booking is touched. Runs at phone (390x844),
// tablet (768x1024) and desktop (1280x800) sizes and saves screenshots to
// SHOTS_DIR (default: <os tmp>/admin-ui-shots).
//
// Chrome: puppeteer's bundled build, else CHROME_PATH, else a system Chrome.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4319);
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS_DIR ?? path.join(os.tmpdir(), 'admin-ui-shots');
fs.mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

const salonToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function periodBounds(period, today) {
  if (period === 'today') return { from: today, to: today };
  if (period === 'tomorrow') return { from: addDays(today, 1), to: addDays(today, 1) };
  const [y, m, d] = today.split('-').map(Number);
  if (period === 'week') {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const monday = addDays(today, -((dow + 6) % 7));
    return { from: monday, to: addDays(monday, 6) };
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STYLISTS = [
  { id: uuid(9001), name: 'Sumita Karki', title: 'Hair Stylist', bio: '', specialties: [], image_url: null, is_active: true },
  { id: uuid(9002), name: 'Anita Rai', title: 'Beautician', bio: '', specialties: [], image_url: null, is_active: true },
];
const SERVICES = [
  { id: uuid(8001), category: 'hair', name: 'Haircut', description: null, price_min: 40, price_max: null, duration_min: 30, is_active: true },
  { id: uuid(8002), category: 'threading', name: 'Eyebrow Threading', description: null, price_min: 12, price_max: null, duration_min: 15, is_active: true },
  { id: uuid(8003), category: 'facial', name: 'Gold Facial', description: null, price_min: 70, price_max: null, duration_min: 60, is_active: false },
];
const NAMES = ['Jane Doe', 'Maria Lopez', 'Priya Shah', "Ana O'Brien", 'Grace Kim', 'Fatima Begum', 'Lucy Chen'];
const TIMES = ['10:00', '12:30', '15:00'];

let rows = [];
const SPECIAL = {
  fail: uuid(7001), // PATCH -> 500
  emailFail: uuid(7002), // cancel -> email failed
  taken: uuid(7003), // restore -> 409 SLOT_TAKEN
  longName: uuid(7004),
  cancelTarget: uuid(7005), // the happy-path cancel
  dropped: uuid(7006), // PATCH commits, then the connection drops
};

function seed() {
  rows = [];
  let n = 1;
  for (let offset = -10; offset <= 20; offset++) {
    const date = addDays(salonToday, offset);
    TIMES.forEach((time, i) => {
      const k = n++;
      const name = NAMES[k % NAMES.length];
      rows.push({
        id: uuid(k),
        stylist_id: STYLISTS[i % 2].id,
        service_id: SERVICES[k % 3].id,
        client_name: name,
        client_email: `${name.split(' ')[0].toLowerCase().replace("'", '')}${k}@example.com`,
        client_phone: `(718) 555-${String(1000 + k).slice(-4)}`,
        appointment_date: date,
        appointment_time: time,
        duration_min: 30,
        notes: k % 5 === 0 ? 'Prefers a quiet chair, sensitive skin.' : null,
        status: offset < 0 ? (k % 7 === 0 ? 'no_show' : 'completed') : k % 11 === 0 ? 'cancelled' : 'confirmed',
        created_at: '2026-11-01T12:00:00Z',
      });
    });
  }
  const tomorrow = addDays(salonToday, 1);
  rows.push(
    { ...rows[0], id: SPECIAL.fail, client_name: 'Fail Case', client_email: 'fail@example.com', appointment_date: tomorrow, appointment_time: '09:30', status: 'confirmed' },
    { ...rows[0], id: SPECIAL.emailFail, client_name: 'Email Bounce', client_email: 'bounce@example.com', client_phone: '(718) 555-0199', appointment_date: tomorrow, appointment_time: '18:00', status: 'confirmed' },
    { ...rows[0], id: SPECIAL.cancelTarget, client_name: 'Jane Smith', client_email: 'jane.smith@example.com', appointment_date: tomorrow, appointment_time: '11:00', status: 'confirmed' },
    { ...rows[0], id: SPECIAL.dropped, client_name: 'Dropped Line', client_email: 'dropped@example.com', appointment_date: tomorrow, appointment_time: '13:00', status: 'confirmed' },
    { ...rows[0], id: SPECIAL.taken, client_name: 'Rebooked Slot', client_email: 'taken@example.com', appointment_date: tomorrow, appointment_time: '17:00', status: 'cancelled' },
    {
      ...rows[0], id: SPECIAL.longName,
      client_name: 'Alexandria Konstantinopoulou-Vanderbilt',
      client_email: 'alexandria.konstantinopoulou.vanderbilt.longaddress@example-domain-name.com',
      appointment_date: salonToday, appointment_time: '18:30', status: 'confirmed',
    },
  );
}

const joined = (r) => ({
  ...r,
  services: (() => { const s = SERVICES.find((x) => x.id === r.service_id); return s ? { name: s.name, category: s.category } : null; })(),
  stylists: (() => { const s = STYLISTS.find((x) => x.id === r.stylist_id); return s ? { name: s.name } : null; })(),
});

function filterRows(q) {
  const view = q.get('view') ?? 'upcoming';
  const range = q.get('range');
  let gte = view === 'upcoming' ? salonToday : undefined;
  let lte;
  const lt = view === 'past' ? salonToday : undefined;
  const from = range ? periodBounds(range, salonToday).from : q.get('from');
  const to = range ? periodBounds(range, salonToday).to : q.get('to');
  if (from && (!gte || from > gte)) gte = from;
  if (to) lte = to;
  const status = q.get('status');
  const term = (q.get('q') ?? '').toLowerCase();
  const digits = term.replace(/[^0-9]/g, '');
  const phoneLike = /^[\d\s()+.-]+$/.test(term) && digits.length >= 3;

  const out = rows.filter((r) => {
    if (gte && r.appointment_date < gte) return false;
    if (lte && r.appointment_date > lte) return false;
    if (lt && r.appointment_date >= lt) return false;
    if (!status && r.status === 'cancelled') return false;
    if (status && status !== 'any' && r.status !== status) return false;
    if (q.get('stylist_id') && r.stylist_id !== q.get('stylist_id')) return false;
    if (q.get('service_id') && r.service_id !== q.get('service_id')) return false;
    if (term) {
      const text = term.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
      const hit =
        (text && (r.client_name.toLowerCase().includes(text) || r.client_email.toLowerCase().includes(text))) ||
        (phoneLike && r.client_phone.replace(/[^0-9]/g, '').includes(digits));
      if (!hit) return false;
    }
    return true;
  });
  const asc = view === 'upcoming';
  const key = (r) => `${r.appointment_date} ${r.appointment_time}`;
  out.sort((a, b) => (asc ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))) || a.id.localeCompare(b.id));
  return out;
}

const SEARCH_ALLOWED = /^[\p{L}\p{M}\p{N} @.'+_()-]+$/u;
const apiLog = [];
let failSummary = false;

function handleApi(req) {
  const url = new URL(req.url());
  const method = req.method();
  apiLog.push(`${method} ${url.pathname}${url.search}`);
  const json = (status, body) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });

  if (url.pathname.startsWith('/api/admin/')) {
    const denied = adminGate(req);
    if (denied) return json(denied.status, denied.body);
    if (url.searchParams.get('me') === '1') return json(200, { owner: true });
  }
  if (url.pathname === '/api/stylists') return json(200, STYLISTS);
  if (url.pathname === '/api/admin/services') {
    if (url.searchParams.get('resource') === 'promotions') {
      return json(200, [{
        id: uuid(6001), title: 'Winter glow', description: 'Facial offer for December',
        offer_text: '20% off any facial, Mon-Thu', starts_on: salonToday, ends_on: addDays(salonToday, 30),
        is_active: true, created_at: '2026-11-01T12:00:00Z',
      }]);
    }
    return json(200, SERVICES);
  }
  if (url.pathname === '/api/admin/blocked-slots') {
    return json(200, [{ id: uuid(5001), stylist_id: STYLISTS[0].id, blocked_date: addDays(salonToday, 3), start_time: '09:30', end_time: '19:00', reason: 'Day off', created_at: '2026-11-01T12:00:00Z', stylists: { name: STYLISTS[0].name } }]);
  }
  if (url.pathname !== '/api/admin/appointments') return json(200, []);

  const q = url.searchParams;
  if (method === 'GET') {
    const term = q.get('q');
    // Same rule as the server: the UI must never send a query it would reject.
    if (term !== null && !SEARCH_ALLOWED.test(term)) return json(400, { error: 'Invalid query params' });
    if (q.get('summary') === '1') {
      if (failSummary) return json(500, { error: 'server error' });
      const live = rows.filter((r) => r.status !== 'cancelled');
      const within = (b) => live.filter((r) => r.appointment_date >= b.from && r.appointment_date <= b.to).length;
      const week = periodBounds('week', salonToday);
      const month = periodBounds('month', salonToday);
      return json(200, {
        today: salonToday, week, month,
        counts: {
          today: within({ from: salonToday, to: salonToday }),
          week: within(week), month: within(month),
          upcoming: live.filter((r) => r.appointment_date >= salonToday).length,
        },
      });
    }
    const all = filterRows(q);
    if (q.get('export') === '1') return json(200, { appointments: all.map(joined), total: all.length, truncated: false, today: salonToday });
    const offset = Number(q.get('offset') ?? 0);
    return json(200, { appointments: all.slice(offset, offset + 50).map(joined), total: all.length, offset, limit: 50, today: salonToday });
  }

  if (method === 'PATCH') {
    const id = q.get('id');
    const { status } = JSON.parse(req.postData() ?? '{}');
    const row = rows.find((r) => r.id === id);
    if (!row) return json(404, { error: 'Booking not found', code: 'NOT_FOUND' });
    if (id === SPECIAL.fail) return json(500, { error: 'server error' });
    if (id === SPECIAL.dropped) {
      row.status = status; // the database commits...
      return req.abort('connectionreset'); // ...and the reply never arrives
    }
    if (id === SPECIAL.taken && status !== 'cancelled') {
      return json(409, { error: 'That time has since been booked by someone else.', code: 'SLOT_TAKEN' });
    }
    if (status === 'cancelled') {
      if (row.status === 'cancelled') return json(200, { appointment: joined(row), email: { status: 'skipped', reason: 'already_cancelled' } });
      row.status = 'cancelled';
      const past = row.appointment_date < salonToday;
      const email = past ? { status: 'skipped', reason: 'past' } : id === SPECIAL.emailFail ? { status: 'failed' } : { status: 'sent' };
      return json(200, { appointment: joined(row), email });
    }
    row.status = status;
    return json(200, { appointment: joined(row) });
  }
  return json(405, { error: 'Method not allowed' });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
    }),
  );
}
const env = readEnv();
const supabaseHost = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).hostname : 'placeholder.supabase.co';
const ownerEmail = 'owner@example.com';
const customerEmail = 'jane@example.com';

// ---------------------------------------------------------------------------
// Fake Supabase Auth + the server's admin gate
// ---------------------------------------------------------------------------

// What the real server (api/_lib/auth.ts checkAdmin) would conclude for each
// token: owner role or not, the session's assurance level, and which
// authenticator verified it (compared with the approved one).
const APPROVED_FACTOR = uuid(4100);
const TOKENS = {
  'fake-owner-token': { email: ownerEmail, owner: true, aal: 'aal2', factor: APPROVED_FACTOR },
  'tok-owner-aal1': { email: ownerEmail, owner: true, aal: 'aal1', factor: null },
  'tok-owner-other-app': { email: ownerEmail, owner: true, aal: 'aal2', factor: uuid(4999) },
  'tok-customer': { email: customerEmail, owner: false, aal: 'aal1', factor: null },
};
const ACCOUNTS = {
  [ownerEmail]: { password: 'correct-horse-battery', token: 'tok-owner-aal1' },
  [customerEmail]: { password: 'customer-pass-123', token: 'tok-customer' },
};
const VALID_CODE = '123456';
const auth = { ownerFactors: [], approvedFactor: APPROVED_FACTOR, log: [] };

function userJson(email) {
  const factors = email === ownerEmail ? auth.ownerFactors : [];
  return {
    id: email === ownerEmail ? uuid(1) : uuid(2), aud: 'authenticated', role: 'authenticated', email,
    app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    factors: factors.map((f) => ({
      id: f.id, factor_type: 'totp', status: f.status, friendly_name: 'Icon Studio admin',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    })),
  };
}

function fakeSession(token = 'fake-owner-token') {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: token, refresh_token: `refresh-${token}`, token_type: 'bearer',
    expires_in: 86400, expires_at: now + 86400, user: userJson(TOKENS[token].email),
  };
}

function handleAuth(req) {
  const url = new URL(req.url());
  const route = url.pathname.replace(/^\/auth\/v1/, '');
  const method = req.method();
  const body = JSON.parse(req.postData() || '{}');
  const token = (req.headers().authorization ?? '').replace(/^Bearer /, '');
  // Supabase is another origin, so the browser needs CORS on every answer.
  const cors = {
    'Access-Control-Allow-Origin': BASE,
    'Access-Control-Allow-Headers': req.headers()['access-control-request-headers'] ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
  if (method === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
  auth.log.push(`${method} ${route}`);
  const json = (status, payload) =>
    req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(payload) });

  if (route === '/token' && url.searchParams.get('grant_type') === 'password') {
    if (process.env.ADMIN_UI_DEBUG) console.log(`       [fake auth] password grant for ${body.email} (body ${req.postData() ? 'present' : 'MISSING'})`);
    const account = ACCOUNTS[String(body.email).toLowerCase()];
    if (!account || account.password !== body.password) {
      return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    return json(200, fakeSession(account.token));
  }
  if (route === '/user') return TOKENS[token] ? json(200, userJson(TOKENS[token].email)) : json(401, { msg: 'invalid JWT' });
  if (route === '/factors' && method === 'POST') {
    const factor = { id: uuid(4000 + auth.ownerFactors.length + 1), status: 'unverified' };
    auth.ownerFactors.push(factor);
    return json(200, {
      id: factor.id, type: 'totp', friendly_name: body.friendly_name,
      totp: {
        qr_code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
        secret: 'JBSWY3DPEHPK3PXP',
        uri: 'otpauth://totp/Icon%20Studio:owner?secret=JBSWY3DPEHPK3PXP&issuer=Icon%20Studio',
      },
    });
  }
  let m = route.match(/^\/factors\/([^/]+)$/);
  if (m && method === 'DELETE') {
    auth.ownerFactors = auth.ownerFactors.filter((f) => f.id !== m[1]);
    return json(200, { id: m[1] });
  }
  m = route.match(/^\/factors\/([^/]+)\/challenge$/);
  if (m) return json(200, { id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
  m = route.match(/^\/factors\/([^/]+)\/verify$/);
  if (m) {
    if (body.code !== VALID_CODE) return json(422, { code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
    const factor = auth.ownerFactors.find((f) => f.id === m[1]);
    if (factor) factor.status = 'verified';
    TOKENS['tok-owner-aal2'] = { email: ownerEmail, owner: true, aal: 'aal2', factor: m[1] };
    return json(200, fakeSession('tok-owner-aal2'));
  }
  if (route === '/logout') return req.respond({ status: 204, headers: cors, body: '' });
  return json(200, {});
}

/** The decision api/_lib/auth.ts makes, for every /api/admin/* request. */
function adminGate(req) {
  const who = TOKENS[(req.headers().authorization ?? '').replace(/^Bearer /, '')];
  if (!who) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHENTICATED' } };
  if (!who.owner) return { status: 403, body: { error: 'This account is not the owner account', code: 'NOT_OWNER' } };
  if (who.aal !== 'aal2') return { status: 403, body: { error: 'Two-step verification required', code: 'MFA_REQUIRED' } };
  if (who.factor !== auth.approvedFactor) {
    return { status: 403, body: { error: 'This authenticator has not been approved yet', code: 'FACTOR_NOT_APPROVED' } };
  }
  return null;
}

async function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const bundled = await Promise.resolve(puppeteer.executablePath());
  if (bundled && fs.existsSync(bundled)) return bundled;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH or run `npx puppeteer browsers install chrome`.');
  return found;
}

function startPreview() {
  if (!fs.existsSync(path.join(ROOT, 'client/dist/index.html'))) {
    throw new Error('client/dist missing. Run `npm run build -w client` first.');
  }
  const child = spawn(`npx vite preview --port ${PORT} --strictPort`, {
    cwd: path.join(ROOT, 'client'), shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite preview did not start')), 30000);
    child.stdout.on('data', (d) => {
      if (String(d).includes(`${PORT}`)) { clearTimeout(timer); resolve(child); }
    });
    child.on('exit', (code) => reject(new Error(`vite preview exited ${code}`)));
  });
}

const results = [];
let currentPage = null;
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    if (process.env.ADMIN_UI_DEBUG) console.log(`       auth calls: ${auth.log.slice(-12).join(' | ')}`);
    const file = `FAIL-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}`;
    await currentPage?.screenshot({ path: path.join(SHOTS, `${file}.png`) }).catch(() => {});
    console.log(`  FAIL ${name}\n       ${String(err?.message ?? err).split('\n').join('\n       ')}`);
  }
}

const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

async function newPage(browser, viewport, { signedIn = true, token = 'fake-owner-token' } = {}) {
  // Own context per page: separate localStorage, so a session saved by one
  // check can never leak into the next.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  if (process.env.ADMIN_UI_DEBUG) page.on('console', (m) => console.log(`       [browser ${m.type()}] ${m.text()}`));
  await page.setViewport(viewport);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e));
  page.pageErrors = pageErrors;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin === BASE && url.pathname.startsWith('/api/')) return handleApi(req);
    if (url.origin === BASE || url.protocol === 'data:' || url.protocol === 'blob:') return req.continue();
    if (url.hostname === supabaseHost) {
      if (url.pathname.startsWith('/auth/v1/')) return handleAuth(req);
      return req.respond({ status: 200, contentType: 'application/json', body: '{}' });
    }
    // Fonts, analytics, anything external: never leave the machine.
    return req.respond({ status: 204, body: '' });
  });
  currentPage = page;
  if (signedIn) {
    const ref = supabaseHost.split('.')[0];
    const session = fakeSession(token);
    await page.evaluateOnNewDocument((ref, session) => {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
      localStorage.setItem('icon-admin-auth', JSON.stringify({ state: { session }, version: 0 }));
    }, ref, session);
  }
  return page;
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
// textContent, not innerText: innerText applies CSS text-transform, so a
// label styled `uppercase` would read "UPCOMING".
const bodyText = (page) => page.evaluate(() => document.body.textContent);
const waitText = (page, text, timeout = 8000) =>
  page.waitForFunction((t) => document.body.textContent.includes(t), { timeout }, text);
/** The open sheet shows all of its content without scrolling. */
async function sheetFits(page) {
  await page.waitForSelector('dialog[open]');
  await new Promise((r) => setTimeout(r, 300)); // slide-up animation
  const fit = await page.evaluate(() => {
    const d = document.querySelector('dialog[open]');
    const r = d.getBoundingClientRect();
    return { scrollH: d.scrollHeight, clientH: d.clientHeight, top: r.top, bottom: r.bottom, vh: window.innerHeight, maxH: getComputedStyle(d).maxHeight, h: getComputedStyle(d).height };
  });
  assert.ok(fit.scrollH <= fit.clientH + 1 && fit.top >= 0 && fit.bottom <= fit.vh + 1, `sheet clipped: ${JSON.stringify(fit)}`);
}
const noSidewaysScroll = async (page) => {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  assert.ok(scroll <= width + 1, `page scrolls sideways: scrollWidth ${scroll} > ${width}`);
};
/** Click the first visible, enabled element matching `selector` (and containing `text`). */
async function clickText(page, selector, text = '') {
  // The list is dimmed and re-rendered while it reloads; act on the settled list.
  await page.waitForFunction(() => !document.querySelector('[aria-busy=true]'), { timeout: 8000 });
  const handle = await page.waitForFunction(
    (sel, t) => [...document.querySelectorAll(sel)].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.disabled && el.textContent.includes(t);
    }),
    { timeout: 8000 }, selector, text,
  );
  // Centre it first: puppeteer's own scroll counts an element tucked under the
  // sticky phone header as visible, and the click lands on the header instead.
  // Elements in a modal <dialog> are already on screen (fixed, top layer), but
  // may still be sliding up: clicking a moving target makes puppeteer scroll
  // the emulated viewport and miss.
  await handle.evaluate(async (el) => {
    const dialog = el.closest('dialog');
    if (dialog) await Promise.all(dialog.getAnimations({ subtree: true }).map((a) => a.finished));
    else el.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  await handle.asElement().click();
}
const clickVisible = (page, selector) => clickText(page, selector, '');
const visibleCards = (page) =>
  page.$$eval('li', (lis) => lis.filter((li) => li.offsetParent !== null && li.querySelector('a[href^="tel:"], a[href^="mailto:"]')).map((li) => li.innerText));

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function phoneChecks(browser) {
  console.log('\nPhone 390x844');
  seed();
  const page = await newPage(browser, VIEWPORTS.phone);

  await check('login link lands on Appointments', async () => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/admin/appointments', { timeout: 8000 });
  });

  await check('upcoming list: cards grouped by day, soonest first, count in header', async () => {
    await waitText(page, 'upcoming bookings');
    const text = await bodyText(page);
    assert.match(text, /\d+ upcoming bookings/);
    assert.ok(text.includes('TODAY · ') || text.includes('Today · '), 'missing "Today · ..." heading');
    assert.ok(/tomorrow · /i.test(text), 'missing "Tomorrow · ..." heading');
    const headings = await page.$$eval('section[aria-label] h2', (hs) => hs.filter((h) => h.offsetParent).map((h) => h.textContent));
    assert.ok(headings[0].startsWith('Today'), `first group is ${headings[0]}`);
    const cards = await visibleCards(page);
    assert.ok(cards.length >= 10, `only ${cards.length} cards`);
    assert.ok(/Call/.test(cards[0]) && /Email/.test(cards[0]), 'card lacks Call / Email');
    await noSidewaysScroll(page);
    await shot(page, 'phone-01-appointments-upcoming');
  });

  await check('cancelled bookings hidden by default', async () => {
    const lastList = apiLog.filter((l) => l.startsWith('GET /api/admin/appointments')).at(-1);
    assert.ok(!/status=/.test(lastList), `default request sent a status: ${lastList}`);
    const cards = await visibleCards(page);
    assert.ok(!cards.some((c) => c.includes('Cancelled')), 'a cancelled card is showing');
  });

  await check('load more appends the next 50', async () => {
    const before = (await visibleCards(page)).length;
    await clickText(page, 'button', 'Load more');
    await page.waitForFunction((n) => document.querySelectorAll('li a[href^="tel:"]').length > n, { timeout: 8000 }, before);
    assert.ok(apiLog.some((l) => l.includes('offset=50')), 'no offset=50 request');
  });

  await check('Past tab: newest first, kept in URL across refresh and Back', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await clickText(page, '[role=tab]', 'Past');
    await page.waitForFunction(() => location.search.includes('view=past'));
    await waitText(page, 'past bookings');
    const headings = await page.$$eval('section[aria-label] h2', (hs) => hs.filter((h) => h.offsetParent).map((h) => h.textContent));
    assert.ok(/^Yesterday/.test(headings[0]), `past list should start with yesterday, got ${headings[0]}`);
    await shot(page, 'phone-02-appointments-past');
    await page.reload({ waitUntil: 'networkidle0' });
    await waitText(page, 'past bookings');
    const selected = await page.$eval('[role=tab][aria-selected=true]', (el) => el.textContent);
    assert.equal(selected, 'Past');
    await clickText(page, 'header a', 'Services');
    await page.waitForFunction(() => location.pathname === '/admin/services');
    await page.goBack({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.search.includes('view=past'), { timeout: 8000 });
  });

  await check('search by phone ignores dashes and searches the server', async () => {
    await clickText(page, '[role=tab]', 'Upcoming');
    await page.waitForFunction(() => !location.search.includes('view='));
    const target = rows.find((r) => r.appointment_date > salonToday && r.status === 'confirmed' && r.id.startsWith('00000000-0000-4000-8000-0000000000'));
    const digits = target.client_phone.replace(/[^0-9]/g, '');
    const typed = `${digits.slice(3, 6)}-${digits.slice(6)}`; // e.g. 555-1040
    await page.type('input[type=search]', typed);
    await page.waitForFunction(() => location.search.includes('q='), { timeout: 8000 });
    await waitText(page, target.client_name);
    const cards = await visibleCards(page);
    const hits = rows.filter((r) => r.appointment_date >= salonToday && r.status !== 'cancelled' && r.client_phone.replace(/[^0-9]/g, '').includes(digits.slice(3)));
    assert.equal(cards.length, hits.length, `expected ${hits.length} card(s), got ${cards.length}`);
    assert.ok(cards.every((c) => c.includes(target.client_name)), 'a non-matching booking is showing');
    assert.ok(apiLog.at(-1).includes(`q=${encodeURIComponent(typed)}`) || apiLog.some((l) => l.includes('q=555')), 'search not sent to server');
    await shot(page, 'phone-03-search');
  });

  await check('tapping the Appointments tab clears the search and it stays cleared', async () => {
    await clickText(page, 'header a', 'Appointments');
    await page.waitForFunction(() => !location.search.includes('q='), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 700)); // past the 300ms search debounce
    assert.ok(!(await page.evaluate(() => location.search)).includes('q='), 'old search was written back to the URL');
    assert.equal(await page.$eval('input[type=search]', (i) => i.value), '');
  });

  await check('a search with disallowed characters is explained, not sent', async () => {
    const sentBefore = apiLog.length;
    await page.type('input[type=search]', ',%');
    await waitText(page, 'Search can use letters');
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(!apiLog.slice(sentBefore).some((l) => /q=[^&]*(%2C|%25)/.test(l)), 'invalid search was sent');
    await page.click('button[aria-label="Clear search"]');
    await page.waitForFunction(() => !location.search.includes('q='), { timeout: 8000 });
  });

  await check('filters sheet: shortcuts, count, Clear all', async () => {
    await page.click('button[aria-controls=booking-filters]');
    await page.waitForSelector('#booking-filters');
    await shot(page, 'phone-04-filters-sheet');
    await clickText(page, '#booking-filters button', 'This week');
    await page.waitForFunction(() => location.search.includes('range=week'));
    const stylist = STYLISTS[0];
    await page.select('#booking-filters select', stylist.id);
    await page.waitForFunction(() => location.search.includes('stylist='));
    await waitText(page, '2 active');
    const badge = await page.$eval('button[aria-controls=booking-filters]', (b) => b.textContent);
    assert.match(badge, /Filters\s*2/);
    const last = apiLog.filter((l) => l.startsWith('GET /api/admin/appointments?')).at(-1);
    assert.ok(last.includes('range=week') && last.includes(`stylist_id=${stylist.id}`), last);
    await shot(page, 'phone-05-filters-active');
    await clickText(page, '#booking-filters button', 'Clear all');
    await page.waitForFunction(() => !location.search.includes('range=') && !location.search.includes('stylist='));
    await clickText(page, '#booking-filters button', 'Show bookings');
    await page.waitForFunction(() => !document.querySelector('#booking-filters'));
  });

  await check('cancel: confirm step, then "Jane was emailed"', async () => {
    const target = rows.find((r) => r.id === SPECIAL.cancelTarget);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clickVisible(page, `button[aria-label="Actions for ${target.client_name}"]`);
    await sheetFits(page);
    await shot(page, 'phone-06a-actions-sheet');
    await clickText(page, 'dialog button', 'Cancel booking');
    await sheetFits(page);
    await page.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent.startsWith('Cancel '));
    const dialog = await page.$eval('dialog[open]', (d) => d.innerText);
    const first = target.client_name.split(' ')[0];
    assert.ok(dialog.includes(`Cancel ${target.client_name} – `), dialog);
    assert.ok(dialog.includes(`${first} will get a cancellation email.`), dialog);
    assert.ok(dialog.includes('Keep booking') && dialog.includes('Cancel booking'), dialog);
    const focused = await page.evaluate(() => document.activeElement?.textContent);
    assert.equal(focused, 'Keep booking', 'safe button should have focus');
    await shot(page, 'phone-06-cancel-confirm');
    await clickText(page, 'dialog[open] button', 'Cancel booking');
    await waitText(page, `Cancelled – ${first} was emailed.`);
    assert.equal(rows.find((r) => r.id === target.id).status, 'cancelled');
    const patches = apiLog.filter((l) => l.startsWith('PATCH') && l.includes(target.id));
    assert.equal(patches.length, 1, 'expected exactly one PATCH');
    await shot(page, 'phone-07-cancel-success');
  });

  await check('a refused change shows the red banner and changes nothing', async () => {
    await clickVisible(page, 'button[aria-label="Dismiss"]').catch(() => {});
    await clickVisible(page, 'button[aria-label="Actions for Fail Case"]');
    await sheetFits(page);
    await clickText(page, 'dialog button', 'Mark completed');
    await clickText(page, 'dialog[open] button', 'Mark completed');
    await waitText(page, "Couldn't mark Fail Case's booking completed – nothing was changed (server error).");
    const alert = await page.$eval('[role=alert]', (el) => el.innerText);
    assert.ok(alert.includes('nothing was changed'), alert);
    const card = (await visibleCards(page)).find((c) => c.includes('Fail Case'));
    assert.ok(card.includes('Confirmed'), 'row changed despite failure');
    await shot(page, 'phone-08-failure-banner');
    await clickVisible(page, 'button[aria-label="Dismiss"]');
  });

  await check('email failure says to call the client', async () => {
    await clickVisible(page, 'button[aria-label="Actions for Email Bounce"]');
    await sheetFits(page);
    await clickText(page, 'dialog button', 'Cancel booking');
    await clickText(page, 'dialog[open] button', 'Cancel booking');
    await waitText(page, 'Cancelled, but the email failed – please call Email at (718) 555-0199');
    await shot(page, 'phone-09-email-failed');
    await clickVisible(page, 'button[aria-label="Dismiss"]');
  });

  await check('no reply from the server: says it may have gone through, then reloads', async () => {
    const before = apiLog.length;
    await clickVisible(page, 'button[aria-label="Actions for Dropped Line"]');
    await clickText(page, 'dialog button', 'Cancel booking');
    await clickText(page, 'dialog[open] button', 'Cancel booking');
    await waitText(page, "Couldn't cancel Dropped Line's booking – no reply from the server");
    const text = await bodyText(page);
    assert.ok(!text.includes("Dropped Line's booking – nothing was changed"), 'claimed nothing changed');
    // The list is fetched again, so the row shows what the database now says.
    const reloaded = () => {
      const after = apiLog.slice(before);
      const patchAt = after.findIndex((l) => l.startsWith('PATCH'));
      // The default list has no query string at all, so match the path alone.
      return patchAt >= 0 && after.slice(patchAt + 1).some((l) => l.startsWith('GET /api/admin/appointments') && !l.includes('summary'));
    };
    for (let i = 0; i < 50 && !reloaded(); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(reloaded(), 'list not reloaded');
    // The cancel did commit, so after the reload the booking has left the
    // default list (cancelled ones are hidden) rather than showing a stale
    // "Confirmed".
    await page.waitForFunction(
      () => ![...document.querySelectorAll('li')].some((li) => li.offsetParent && li.textContent.includes('Dropped Line')),
      { timeout: 8000 },
    );
    await shot(page, 'phone-09b-no-reply');
    await clickVisible(page, 'button[aria-label="Dismiss"]');
  });

  await check('restoring a rebooked time: "booked by someone else"', async () => {
    await page.goto(`${BASE}/admin/appointments?range=tomorrow&status=any`, { waitUntil: 'networkidle0' });
    await clickVisible(page, 'button[aria-label="Actions for Rebooked Slot"]');
    await sheetFits(page);
    await clickText(page, 'dialog button', 'Restore booking');
    await clickText(page, 'dialog[open] button', 'Restore booking');
    await waitText(page, 'that time has since been booked by someone else');
    await shot(page, 'phone-10-restore-taken');
  });

  await check('long names and emails do not push the page sideways', async () => {
    await page.goto(`${BASE}/admin/appointments?range=today`, { waitUntil: 'networkidle0' });
    await waitText(page, 'Alexandria');
    await noSidewaysScroll(page);
  });

  await check('dashboard: 2x2 tiles from server counts, today as cards', async () => {
    await clickText(page, 'header a', 'Dashboard');
    await waitText(page, 'Upcoming');
    const text = await bodyText(page);
    assert.ok(!text.includes('Pending Action'), '"Pending Action" tile still present');
    const tiles = await page.$$eval('a[href*="/admin/appointments"] p:last-child', (ps) => ps.slice(0, 4).map((p) => p.getBoundingClientRect().top));
    assert.equal(new Set(tiles.map(Math.round)).size, 2, 'tiles are not in two rows');
    assert.ok(apiLog.some((l) => l.includes('summary=1')), 'summary endpoint not used');
    await noSidewaysScroll(page);
    await shot(page, 'phone-11-dashboard');
  });

  await check('dashboard load failure: red banner with Retry, not zeros', async () => {
    failSummary = true;
    await page.reload({ waitUntil: 'networkidle0' });
    await waitText(page, "Couldn't load bookings");
    const text = await bodyText(page);
    assert.ok(text.includes('Retry'));
    assert.ok(!/Today\s*0/.test(text), 'zeros shown on failure');
    await shot(page, 'phone-12-dashboard-error');
    failSummary = false;
    await clickText(page, 'button', 'Retry');
    await waitText(page, 'This week');
  });

  for (const [tab, name] of [['Services', 'services'], ['Promotions', 'promotions'], ['Block Slots', 'blocked-slots']]) {
    await check(`${tab}: new menu, table scrolls inside its box`, async () => {
      await clickText(page, 'header a', tab);
      await page.waitForFunction((n) => location.pathname === `/admin/${n}`, {}, name);
      await page.waitForSelector('table');
      await noSidewaysScroll(page);
      const scrolls = await page.$eval('table', (t) => t.parentElement.scrollWidth > t.parentElement.clientWidth);
      assert.ok(scrolls, 'table does not scroll sideways inside its box');
      await shot(page, `phone-13-${name}`);
    });
  }

  await check('phone shows the top bar with Sign Out, not the sidebar', async () => {
    const asideVisible = await page.$eval('aside', (a) => a.offsetParent !== null);
    assert.equal(asideVisible, false);
    await page.waitForFunction(() => [...document.querySelectorAll('header button')].some((b) => b.textContent.includes('Sign Out') && b.offsetParent));
  });

  await check('no uncaught errors in the page', async () => {
    assert.deepEqual(page.pageErrors.map(String), []);
  });
  await page.close();
}

async function tabletChecks(browser) {
  console.log('\nTablet 768x1024');
  seed();
  const page = await newPage(browser, VIEWPORTS.tablet);
  await check('appointments at 768: table, sidebar, no sideways scroll', async () => {
    await page.goto(`${BASE}/admin/appointments`, { waitUntil: 'networkidle0' });
    await waitText(page, 'upcoming bookings');
    const tableVisible = await page.$eval('table', (t) => t.offsetParent !== null);
    assert.ok(tableVisible);
    await noSidewaysScroll(page);
    await shot(page, 'tablet-01-appointments');
  });
  await page.close();
}

async function desktopChecks(browser) {
  console.log('\nDesktop 1280x800');
  seed();
  const page = await newPage(browser, VIEWPORTS.desktop);

  await check('appointments: table, upcoming soonest first', async () => {
    await page.goto(`${BASE}/admin/appointments`, { waitUntil: 'networkidle0' });
    await waitText(page, 'upcoming bookings');
    const firstCell = await page.$eval('tbody tr td', (td) => td.innerText);
    assert.ok(firstCell.startsWith('Today'), firstCell);
    await noSidewaysScroll(page);
    const fits = await page.$eval('table', (t) => t.parentElement.scrollWidth <= t.parentElement.clientWidth);
    assert.ok(fits, 'table needs sideways scrolling at 1280');
    await shot(page, 'desktop-01-appointments');
  });

  await check('Sign Out sits at the bottom of the sidebar, even scrolled down', async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const pos = await page.evaluate(() => {
      const b = [...document.querySelectorAll('aside button')].find((x) => x.textContent.includes('Sign Out'));
      const r = b.getBoundingClientRect();
      return { bottom: r.bottom, vh: window.innerHeight };
    });
    assert.ok(pos.bottom <= pos.vh && pos.bottom >= pos.vh - 80, JSON.stringify(pos));
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  await check('filters sit inline on desktop', async () => {
    await page.click('button[aria-controls=booking-filters]');
    const position = await page.$eval('#booking-filters', (el) => getComputedStyle(el).position);
    assert.equal(position, 'static');
    await clickText(page, '#booking-filters button', 'This month');
    await page.waitForFunction(() => location.search.includes('range=month'));
    await shot(page, 'desktop-02-filters-inline');
    await clickText(page, '#booking-filters button', 'Clear all');
  });

  await check('cancel from the table: confirm, then success', async () => {
    const target = rows.find((r) => r.id === SPECIAL.cancelTarget);
    await clickVisible(page, `button[aria-label="Actions for ${target.client_name}"]`);
    await sheetFits(page);
    await clickText(page, 'dialog button', 'Cancel booking');
    await page.waitForFunction(() => document.querySelector('dialog[open] h2')?.textContent.startsWith('Cancel '));
    await shot(page, 'desktop-03-cancel-confirm');
    await clickText(page, 'dialog[open] button', 'Cancel booking');
    await waitText(page, 'was emailed.');
  });

  await check('after a cancel, Load more skips nothing and the count drops by one', async () => {
    // The cancelled row stays on screen but has left the server's list, so the
    // next page must start one earlier.
    const totalAfter = filterRows(new URLSearchParams()).length;
    await waitText(page, `${totalAfter} upcoming bookings`);
    await clickText(page, 'button', 'Load more');
    await page.waitForFunction((n) => document.querySelectorAll('tbody tr').length === n, { timeout: 8000 }, totalAfter + 1);
    assert.ok(apiLog.some((l) => l.includes('offset=49')), 'next page did not start at 49');
    assert.ok(!(await bodyText(page)).includes('Load more'), 'Load more still offered after the last page');
  });

  await check('CSV export requests every match, not one page', async () => {
    await clickText(page, 'button', 'Export CSV');
    await page.waitForFunction(() => true);
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(apiLog.some((l) => l.includes('export=1')), 'export=1 not requested');
  });

  await check('dashboard: one row of tiles, today as a table', async () => {
    await clickText(page, 'aside a', 'Dashboard');
    await waitText(page, 'Upcoming');
    const tops = await page.$$eval('a[href*="/admin/appointments"] p:last-child', (ps) => ps.slice(0, 4).map((p) => Math.round(p.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1);
    await shot(page, 'desktop-04-dashboard');
  });

  await check('no uncaught errors in the page', async () => {
    assert.deepEqual(page.pageErrors.map(String), []);
  });
  await page.close();
}

async function signInChecks(browser) {
  console.log('\nSign-in security (phone)');
  const signIn = async (page, email, password) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
    await page.type('#email', email);
    await page.type('#password', password);
    await clickText(page, 'button[type=submit]', 'Sign In');
  };
  const enterCode = async (page, code) => {
    await page.waitForSelector('#otp');
    await page.$eval('#otp', (el) => { el.value = ''; });
    await page.type('#otp', code);
    await clickText(page, 'button[type=submit]', 'Verify');
  };
  const onAppointments = (page) =>
    page.waitForFunction(() => location.pathname === '/admin/appointments' && document.body.textContent.includes('upcoming booking'), { timeout: 10000 });

  await check('the login page has no username option and no owner details', async () => {
    const page = await newPage(browser, VIEWPORTS.phone, { signedIn: false });
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
    const text = await bodyText(page);
    assert.ok(!/username/i.test(text), 'username wording still on the page');
    assert.equal(await page.$eval('#email', (el) => el.type), 'email');
    await shot(page, 'signin-01-login');
    await page.close();
  });

  await check('wrong password: one message for any wrong email or password', async () => {
    const page = await newPage(browser, VIEWPORTS.phone, { signedIn: false });
    await signIn(page, ownerEmail, 'not-the-password');
    await waitText(page, 'Email or password is incorrect.');
    await signIn(page, 'nobody@example.com', 'whatever-123');
    await waitText(page, 'Email or password is incorrect.');
    assert.ok(!(await bodyText(page)).includes('Invalid login credentials'));
    await page.close();
  });

  await check('first owner sign-in: setup, then waits for approval, then the bookings', async () => {
    auth.ownerFactors = [];
    auth.approvedFactor = null;
    const page = await newPage(browser, VIEWPORTS.phone, { signedIn: false });
    await signIn(page, ownerEmail, ACCOUNTS[ownerEmail].password);
    await waitText(page, 'Set up two-step sign-in');
    const linkEl = await page.waitForSelector('a[href^="otpauth://"]');
    const link = await linkEl.evaluate((a) => a.getAttribute('href'));
    assert.ok(link.includes('secret='), link);
    await page.waitForSelector('img[alt^="QR code"]');
    await waitText(page, 'JBSWY3DPEHPK3PXP');
    await noSidewaysScroll(page);
    await shot(page, 'signin-02-setup');
    // The admin API still refuses this login: password only.
    assert.ok(!(await page.evaluate(() => location.pathname)).includes('appointments'));
    await enterCode(page, '000000');
    await waitText(page, "That code didn't work.");
    await shot(page, 'signin-03-wrong-code');
    await enterCode(page, VALID_CODE);
    // Two-step done, but not yet approved: still no admin.
    await waitText(page, 'Almost done');
    await shot(page, 'signin-03b-awaiting-approval');
    assert.ok(!(await bodyText(page)).includes('upcoming booking'));
    const verified = auth.ownerFactors.filter((f) => f.status === 'verified');
    assert.equal(verified.length, 1);
    auth.approvedFactor = verified[0].id; // supabase/admin/approve-owner-authenticator.sql
    await clickText(page, 'button', "It's approved");
    await onAppointments(page);
    auth.approvedFactor = APPROVED_FACTOR;
    await page.close();
  });

  await check('an authenticator added by someone else with her password is refused', async () => {
    auth.ownerFactors = [{ id: APPROVED_FACTOR, status: 'verified' }];
    const page = await newPage(browser, VIEWPORTS.phone, { token: 'tok-owner-other-app' });
    await page.goto(`${BASE}/admin/appointments`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/admin/login', { timeout: 8000 });
    await waitText(page, 'Almost done');
    assert.ok(!(await bodyText(page)).includes('upcoming booking'), 'bookings shown to an unapproved authenticator');
    await page.close();
  });

  await check('later owner sign-ins: password, then the code', async () => {
    auth.ownerFactors = [{ id: APPROVED_FACTOR, status: 'verified' }];
    const page = await newPage(browser, VIEWPORTS.phone, { signedIn: false });
    const enrollsBefore = auth.log.filter((l) => l === 'POST /factors').length;
    await signIn(page, ownerEmail, ACCOUNTS[ownerEmail].password);
    await waitText(page, 'Enter your code');
    await shot(page, 'signin-04-code');
    await enterCode(page, VALID_CODE);
    await onAppointments(page);
    assert.equal(auth.log.filter((l) => l === 'POST /factors').length, enrollsBefore, 'set up a second authenticator');
    await page.close();
  });

  await check('a password-only owner session cannot open admin pages', async () => {
    auth.ownerFactors = [{ id: APPROVED_FACTOR, status: 'verified' }];
    const page = await newPage(browser, VIEWPORTS.phone, { token: 'tok-owner-aal1' });
    await page.goto(`${BASE}/admin/appointments`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/admin/login', { timeout: 8000 });
    await waitText(page, 'Enter your code');
    assert.ok(!(await bodyText(page)).includes('upcoming booking'), 'bookings rendered without the code');
    await enterCode(page, VALID_CODE);
    await onAppointments(page);
    await page.close();
  });

  await check("a customer's login is told it is not the owner and never sees admin", async () => {
    const page = await newPage(browser, VIEWPORTS.phone, { signedIn: false });
    await signIn(page, customerEmail, ACCOUNTS[customerEmail].password);
    await waitText(page, 'which is not the owner account');
    await shot(page, 'signin-05-not-owner');
    await page.goto(`${BASE}/admin/appointments`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/admin/login', { timeout: 8000 });
    const text = await bodyText(page);
    assert.ok(!text.includes('upcoming booking') && !text.includes('Sign Out'), 'admin shell rendered for a customer');
    assert.ok(!(await page.$('#otp')), 'customer was offered two-step setup');
    await clickText(page, 'button', 'Sign out and use a different account');
    await page.waitForSelector('#email');
    await page.close();
  });

  await check('a signed-out visitor to an admin page lands on the login form', async () => {
    const page = await newPage(browser, VIEWPORTS.phone, { signedIn: false });
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => location.pathname === '/admin/login', { timeout: 8000 });
    await page.waitForSelector('#email');
    await page.close();
  });
}

async function publicSiteChecks(browser) {
  console.log('\nPublic site');
  const page = await newPage(browser, VIEWPORTS.desktop, { signedIn: false });
  await check('footer has no link to admin', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const adminLinks = await page.$$eval('a[href*="/admin"]', (as) => as.map((a) => a.href));
    assert.deepEqual(adminLinks, []);
    assert.ok(!(await bodyText(page)).includes('Owner Login'));
  });
  await check('admin pages carry noindex', async () => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
    const robots = await page.$$eval('meta[name=robots]', (ms) => ms.map((m) => m.content));
    assert.ok(robots.some((c) => c.includes('noindex')), JSON.stringify(robots));
  });
  await page.close();
}

const preview = await startPreview();
const browser = await puppeteer.launch({ executablePath: await resolveChrome(), headless: true });
try {
  // ADMIN_UI_ONLY=phone,desktop runs a subset.
  const only = (process.env.ADMIN_UI_ONLY ?? 'phone,tablet,desktop,signin,public').split(',');
  if (only.includes('signin')) await signInChecks(browser);
  if (only.includes('phone')) await phoneChecks(browser);
  if (only.includes('tablet')) await tabletChecks(browser);
  if (only.includes('desktop')) await desktopChecks(browser);
  if (only.includes('public')) await publicSiteChecks(browser);
} finally {
  await browser.close();
  // shell:true puts vite under a shell; kill the whole tree or the port stays taken.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
  else preview.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
