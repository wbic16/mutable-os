// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import express from 'express';
import { createHmac } from 'node:crypto';
import { createSsoAuth } from './sso-auth';

/**
 * SSO gate tests (sso-design §6, Mutable side). The fixture mounts
 * the module exactly as server/index.ts does — router, then the
 * gate middleware, then the application surface behind it — with
 * fixed test secrets; assertions are minted locally in edit's seal
 * format. No production secrets anywhere.
 */
const TEST_ENV = {
  MUTABLE_SSO_SECRET: 'test-sso-secret-32-chars-minimum',
  MUTABLE_SESSION_SECRET: 'test-session-secret-32-chars-minimum',
  MUTABLE_SSO_EDIT_URL: 'https://edit.phext.io',
  MUTABLE_PUBLIC_URL: 'https://mutable.phext.io',
};

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

async function fixture(env: Record<string, string>) {
  const sso = createSsoAuth({ env });
  const app = express();
  app.use('/api/auth', sso.router);
  app.use(sso.middleware);
  app.get('/', (_req, res) => { res.type('html').send('<h1>Mutable OS</h1>'); });
  app.get('/superposition', (_req, res) => { res.type('html').send('<h1>Superposition</h1>'); });
  app.get('/api/cavern/status', (_req, res) => { res.json({ Success: true, Data: { reached: 'cavern' } }); });
  app.post('/api/cavern/status', (_req, res) => { res.json({ Success: true, Data: { reached: 'cavern' } }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  const call = (requestPath: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}${requestPath}`, { redirect: 'manual', ...init });
  return { sso, call };
}

const now = () => Math.floor(Date.now() / 1000);
let jtiSerial = 0;
/** Mint an assertion exactly as edit would (design §3.2). */
const mint = (overrides: Record<string, unknown> = {}, secret = TEST_ENV.MUTABLE_SSO_SECRET) => {
  const payload = Buffer.from(JSON.stringify({
    aud: 'mutable', who: 'github:12345', handle: 'wbic16', name: 'Will Bickford',
    email: '', editor: true, ret: '/', iat: now(), exp: now() + 120,
    jti: `test-jti-${++jtiSerial}`, ...overrides,
  })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
};

const setCookies = (response: Response) => response.headers.getSetCookie();
const cookiePair = (setCookie: string) => setCookie.split(';')[0];

async function signIn(call: (path: string, init?: RequestInit) => Promise<Response>) {
  const callback = await call(`/api/auth/callback?assertion=${mint()}`);
  const session = setCookies(callback).find(c => c.startsWith('mutable_session='));
  expect(session, 'callback sets the session cookie').toBeDefined();
  const cookie = cookiePair(session!);
  const me = await (await call('/api/auth/session', { headers: { Cookie: cookie } })).json();
  return { cookie, csrf: me.csrf as string };
}

it('callback verifies the assertion, seals a session with the §3.4 attributes, and lands on ret', async () => {
  const { call } = await fixture(TEST_ENV);
  const callback = await call(`/api/auth/callback?assertion=${mint({ ret: '/superposition' })}`);
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toBe('https://mutable.phext.io/superposition');
  const session = setCookies(callback).find(c => c.startsWith('mutable_session='));
  expect(session).toBeDefined();
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=1209600']) {
    expect(session).toContain(attribute);
  }
  const me = await (await call('/api/auth/session', { headers: { Cookie: cookiePair(session!) } })).json();
  expect(me.signed_in).toBe(true);
  expect(me.who).toBe('github:12345');
  expect(me.handle).toBe('wbic16');
  expect(me.name).toBe('Will Bickford');
  expect(me.editor).toBe(true);
  expect(typeof me.csrf).toBe('string');
  expect(me.csrf.length).toBeGreaterThan(0);
});

it('callback refuses expired, mis-signed, wrong-audience, and replayed assertions', async () => {
  const { call } = await fixture(TEST_ENV);
  const refused = [
    mint({ exp: now() - 1 }),
    mint({}, 'some-other-secret-that-is-long-enough'),
    mint({ aud: 'edit' }),
  ];
  for (const token of refused) {
    const response = await call(`/api/auth/callback?assertion=${token}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/api/auth/login?return=%2F');
    expect(setCookies(response).some(c => c.startsWith('mutable_session='))).toBe(false);
  }
  const good = mint({ ret: '/superposition' });
  const first = await call(`/api/auth/callback?assertion=${good}`);
  expect(first.headers.get('location')).toBe('https://mutable.phext.io/superposition');
  const replay = await call(`/api/auth/callback?assertion=${good}`);
  expect(replay.status).toBe(302);
  expect(replay.headers.get('location')).toBe('/api/auth/login?return=%2Fsuperposition');
  expect(setCookies(replay).some(c => c.startsWith('mutable_session='))).toBe(false);
});

it('callback clamps a hostile ret to / on landing — re-validated, never followed (§3.3)', async () => {
  const { call } = await fixture(TEST_ENV);
  // Edit clamps ret with safe_next before sealing, so a hostile
  // value can only arrive inside an authentic assertion if edit
  // itself was misconfigured; Mutable's re-validation turns it
  // into / rather than following it, and the (authentic, fresh,
  // single-use) assertion still seals its session.
  const response = await call(`/api/auth/callback?assertion=${mint({ ret: 'https://evil.example/x' })}`);
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('https://mutable.phext.io/');
  expect(setCookies(response).some(c => c.startsWith('mutable_session='))).toBe(true);
});

it('gate bounces document requests to edit and answers 401 JSON for API requests', async () => {
  const { call } = await fixture(TEST_ENV);
  const root = await call('/');
  expect(root.status).toBe(302);
  expect(root.headers.get('location')).toBe('https://edit.phext.io/api/auth/sso/mutable?return=%2F');
  const deep = await call('/superposition?x=1');
  expect(deep.status).toBe(302);
  expect(deep.headers.get('location'))
    .toBe(`https://edit.phext.io/api/auth/sso/mutable?return=${encodeURIComponent('/superposition?x=1')}`);
  const api = await call('/api/cavern/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  expect(api.status).toBe(401);
  expect((await api.json()).Success).toBe(false);
});

it('gate passes a valid session and enforces the CSRF token on non-GET API calls', async () => {
  const { call } = await fixture(TEST_ENV);
  const { cookie, csrf } = await signIn(call);
  expect((await call('/', { headers: { Cookie: cookie } })).status).toBe(200);
  expect((await call('/api/cavern/status', { headers: { Cookie: cookie } })).status).toBe(200);
  const post = (headers: Record<string, string>) => call('/api/cavern/status', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body: '{}',
  });
  expect((await post({})).status).toBe(403);
  expect((await post({ 'x-csrf-token': 'not-the-token' })).status).toBe(403);
  const admitted = await post({ 'x-csrf-token': csrf });
  expect(admitted.status).toBe(200);
  expect((await admitted.json()).Data.reached).toBe('cavern');
});

it('login clears the suppression cookie and clamps hostile returns; logout sets the suppression', async () => {
  const { call } = await fixture(TEST_ENV);
  const login = await call('/api/auth/login?return=/superposition', { headers: { Cookie: 'mutable_logged_out=1' } });
  expect(login.status).toBe(302);
  expect(login.headers.get('location')).toBe('https://edit.phext.io/api/auth/sso/mutable?return=%2Fsuperposition');
  expect(setCookies(login).some(c => c.startsWith('mutable_logged_out=') && c.includes('Max-Age=0'))).toBe(true);
  const hostile = await call(`/api/auth/login?return=${encodeURIComponent('https://evil.example/x')}`);
  expect(hostile.headers.get('location')).toBe('https://edit.phext.io/api/auth/sso/mutable?return=%2F');

  const { cookie, csrf } = await signIn(call);
  expect((await call('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status).toBe(403);
  const logout = await call('/api/auth/logout', {
    method: 'POST', headers: { Cookie: cookie, 'x-csrf-token': csrf },
  });
  expect(logout.status).toBe(200);
  const cleared = setCookies(logout);
  expect(cleared.some(c => c.startsWith('mutable_session=') && c.includes('Max-Age=0'))).toBe(true);
  expect(cleared.some(c => c.startsWith('mutable_logged_out=1') && c.includes('Max-Age=300'))).toBe(true);

  const page = await call('/', { headers: { Cookie: 'mutable_logged_out=1' } });
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('signed out of Mutable OS');
});

it('with no secrets configured the gate is off and every request passes through', async () => {
  const { sso, call } = await fixture({});
  expect(sso.enabled).toBe(false);
  expect((await call('/')).status).toBe(200);
  const api = await call('/api/cavern/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  expect(api.status).toBe(200);
  expect((await call('/api/auth/session')).status).toBe(404);
  expect((await call('/api/auth/login')).status).toBe(404);
});
