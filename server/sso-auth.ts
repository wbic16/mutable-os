/**
 * SSO against edit.phext.io (sso-design.md, task 27.6.8/7.5.9/6.5.8).
 *
 * Mutable has no accounts of its own: edit.phext.io is the identity
 * provider. A logged-out hit on a gated route bounces to edit's SSO
 * endpoint; edit (signed-in there, possibly after a provider login)
 * redirects back to /api/auth/callback with a short-lived signed
 * assertion; the callback verifies it and seals Mutable's own
 * session cookie. The whole gate is env-gated: with the secrets
 * absent, the middleware passes everything through and the auth
 * routes answer 404, so local and test instances behave exactly as
 * before this module existed.
 *
 * The user session here (the `mutable_session` cookie) is a
 * different concept from the Cavern session (`X-Mutable-Cavern`
 * header): the cookie says WHO is at the keyboard, the header says
 * WHICH Cavern is open. The gate runs before the Cavern fence; a
 * request must be an authenticated user before Cavern state is
 * consulted.
 */
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type SsoIdentity = {
  who: string;
  handle: string;
  name: string;
  email: string;
  editor: boolean;
};

type MutableSession = SsoIdentity & { csrf: string; exp: number };

const SESSION_COOKIE = 'mutable_session';
const LOGGED_OUT_COOKIE = 'mutable_logged_out';
/** 14 days, matching edit's phext_session lifetime (design §3.4). */
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;
/** How long the post-logout suppression lasts (design §3.5). */
const LOGGED_OUT_MAX_AGE = 300;
const AUDIENCE = 'mutable';

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * A secret counts only when it is a real secret: at least 32 chars
 * (mirroring phext-lattice's `real_session_secret`) and not an
 * obvious placeholder left in a unit file.
 */
const PLACEHOLDER_SECRETS = new Set(['changeme', 'change-me', 'placeholder', 'secret', 'password', 'mutable-sso-secret', 'mutable-session-secret']);
const usableSecret = (value: string | undefined): string => {
  const trimmed = (value ?? '').trim();
  return trimmed.length >= 32 && !PLACEHOLDER_SECRETS.has(trimmed.toLowerCase()) ? trimmed : '';
};

/**
 * SSO admission (design §2 decision 2, §7): any signed-in edit
 * account may use Mutable; the assertion's `editor` flag is carried
 * in the session for display and future gating. This predicate is
 * the only admission check — making Mutable editor-only is
 * `return identity.editor;` here and nothing else.
 */
const admitsUser = (_identity: SsoIdentity): boolean => true;

// ---- Sealed tokens, edit's format: base64url(JSON) + "." +
// base64url(HMAC-SHA256(secret, base64url(JSON))). One format for
// the assertion (edit's key) and the session cookie (Mutable's own
// key, never shared with edit).

const seal = (secret: string, body: unknown): string => {
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
};

const open = (secret: string, token: unknown): Record<string, unknown> | undefined => {
  if (typeof token !== 'string') return undefined;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return undefined;
  const payload = token.slice(0, dot);
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return body && typeof body === 'object' ? body as Record<string, unknown> : undefined;
  } catch { return undefined; }
};

// ---- Paths: return targets are paths, never URLs (design §2
// decision 4). Same rules as edit's `safe_next`: a same-site path
// only — leading `/`, no `//`, no `\`, no `:`, no spaces or control
// characters, at most 200 chars; anything else becomes `/`.
const safePath = (value: unknown): string => {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes(':')
    || value.length > 200 || /[\s\u0000-\u001f\u007f]/.test(value)) return '/';
  return value;
};

const parseCookies = (req: Request): Record<string, string> => {
  const cookies: Record<string, string> = {};
  const header = req.header('cookie');
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return cookies;
};

const sessionCookie = (value: string) =>
  `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
const clearCookie = (name: string) =>
  `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
const suppressionCookie = () =>
  `${LOGGED_OUT_COOKIE}=1; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${LOGGED_OUT_MAX_AGE}`;

const SIGNED_OUT_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signed out — Mutable OS</title></head>
<body style="font:15px/1.5 Arial,sans-serif;color:#273b38;background:#fafdfb;padding:40px">
<h1 style="font-size:22px">You are signed out of Mutable OS</h1>
<p>Mutable OS uses your edit.phext.io sign-in. Your sign-in there is untouched by signing out here.</p>
<p><a href="/api/auth/login">Sign in via edit.phext.io</a> · <a href="https://edit.phext.io/">edit.phext.io</a></p>
</body></html>`;

export function createSsoAuth(options: { env?: NodeJS.ProcessEnv } = {}) {
  const env = options.env ?? process.env;
  const ssoSecret = usableSecret(env.MUTABLE_SSO_SECRET);
  const sessionSecret = usableSecret(env.MUTABLE_SESSION_SECRET);
  const editUrl = (env.MUTABLE_SSO_EDIT_URL || 'https://edit.phext.io').replace(/\/+$/, '');
  const publicUrl = (env.MUTABLE_PUBLIC_URL || 'https://mutable.phext.io').replace(/\/+$/, '');
  const enabled = Boolean(ssoSecret && sessionSecret);

  // Single-use assertion ids (design §3.2): jti → exp, swept on
  // each verify so the map stays bounded by live assertions.
  const consumedJti = new Map<string, number>();

  const readSession = (req: Request): MutableSession | undefined => {
    if (!enabled) return undefined;
    const body = open(sessionSecret, parseCookies(req)[SESSION_COOKIE]);
    if (!body || typeof body.exp !== 'number' || body.exp <= nowSeconds()) return undefined;
    if (typeof body.who !== 'string' || !body.who || typeof body.csrf !== 'string' || !body.csrf) return undefined;
    return {
      who: body.who,
      handle: typeof body.handle === 'string' ? body.handle : '',
      name: typeof body.name === 'string' ? body.name : '',
      email: typeof body.email === 'string' ? body.email : '',
      editor: body.editor === true,
      csrf: body.csrf,
      exp: body.exp,
    };
  };

  /**
   * Verify an assertion from edit. Returns the identity on success;
   * either way it returns the `ret` path when the body could be
   * opened at all (so the failure redirect can still aim at the
   * page the user wanted — the path is re-validated, never trusted
   * raw). The jti is consumed only by a fully successful verify.
   */
  const verifyAssertion = (token: unknown): { identity?: SsoIdentity; ret: string } => {
    const body = open(ssoSecret, token);
    if (!body) return { ret: '/' };
    const ret = safePath(body.ret);
    const now = nowSeconds();
    for (const [jti, exp] of consumedJti) if (exp <= now) consumedJti.delete(jti);
    if (body.aud !== AUDIENCE) return { ret };
    if (typeof body.exp !== 'number' || body.exp <= now) return { ret };
    if (typeof body.jti !== 'string' || !body.jti || consumedJti.has(body.jti)) return { ret };
    if (typeof body.who !== 'string' || !body.who) return { ret };
    const identity: SsoIdentity = {
      who: body.who,
      handle: typeof body.handle === 'string' ? body.handle : '',
      name: typeof body.name === 'string' ? body.name : '',
      email: typeof body.email === 'string' ? body.email : '',
      editor: body.editor === true,
    };
    if (!admitsUser(identity)) return { ret };
    consumedJti.set(body.jti, body.exp);
    return { identity, ret };
  };

  const router = Router();
  const notConfigured = (res: Response) =>
    res.status(404).json({ Success: false, Error: 'SSO is not configured on this Mutable server.' });

  // The login redirector (design §3.1): clears the logout
  // suppression, then hands the browser to edit's SSO endpoint.
  router.get('/login', (req, res) => {
    if (!enabled) { notConfigured(res); return; }
    const ret = safePath(req.query.return);
    res.set('Set-Cookie', clearCookie(LOGGED_OUT_COOKIE));
    res.redirect(302, `${editUrl}/api/auth/sso/mutable?return=${encodeURIComponent(ret)}`);
  });

  // The callback (design §3.3): verify the assertion, seal
  // Mutable's own session, land on the return path. Any failure
  // restarts the login leg — a bad assertion was not minted by
  // edit, so the loop terminates at edit's sign-in screen.
  router.get('/callback', (req, res) => {
    if (!enabled) { notConfigured(res); return; }
    const { identity, ret } = verifyAssertion(req.query.assertion);
    if (!identity) { res.redirect(302, `/api/auth/login?return=${encodeURIComponent(ret)}`); return; }
    const session: MutableSession = {
      ...identity,
      csrf: randomBytes(16).toString('base64url'),
      exp: nowSeconds() + SESSION_MAX_AGE,
    };
    res.set('Set-Cookie', sessionCookie(seal(sessionSecret, session)));
    res.redirect(302, `${publicUrl}${ret}`);
  });

  // Who-am-I for the client (design §3.4) and the deploy health
  // check. Never gated: it is how the client learns the gate's
  // state, and it answers signed_in:false rather than erroring.
  router.get('/session', (req, res) => {
    if (!enabled) { notConfigured(res); return; }
    const session = readSession(req);
    if (!session) { res.json({ signed_in: false }); return; }
    res.json({
      signed_in: true,
      who: session.who,
      handle: session.handle,
      name: session.name,
      editor: session.editor,
      csrf: session.csrf,
    });
  });

  // Local logout only (design §3.5): the edit session is not
  // Mutable's to end. The suppression cookie stops the gate from
  // bouncing the browser straight back through edit's still-live
  // session; /api/auth/login clears it.
  router.post('/logout', (req, res) => {
    if (!enabled) { notConfigured(res); return; }
    const session = readSession(req);
    if (!session) { res.status(401).json({ Success: false, Error: 'Sign in via edit.phext.io.' }); return; }
    if (req.header('x-csrf-token') !== session.csrf) {
      res.status(403).json({ Success: false, Error: 'Missing or invalid CSRF token.' });
      return;
    }
    res.set('Set-Cookie', [clearCookie(SESSION_COOKIE), suppressionCookie()]);
    res.json({ Success: true, Data: { signed_in: false } });
  });

  /**
   * The gate (design §3.1, §4.2 M3). Mounted ahead of everything
   * else in server/index.ts: statics, the Cavern router, the
   * Cavern-fenced /api, and uploads all sit behind it.
   */
  const middleware: RequestHandler = (req, res, next) => {
    if (!enabled) { next(); return; }
    const pathname = req.path;
    if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) { next(); return; }
    const apiClass = pathname.startsWith('/api/') || pathname === '/upload';
    const session = readSession(req);
    if (session) {
      // CSRF parity with edit's Gate::admit (design §2 decision 6):
      // a session's non-GET API/upload calls carry its csrf token.
      if (apiClass && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS'
        && req.header('x-csrf-token') !== session.csrf) {
        res.status(403).json({ Success: false, Error: 'Missing or invalid CSRF token.' });
        return;
      }
      next();
      return;
    }
    // No valid session. Document navigations bounce to edit (or,
    // just after a logout, land on the signed-out page); API and
    // upload calls get a 401 the client turns into the same bounce.
    if (!apiClass && (req.method === 'GET' || req.method === 'HEAD')) {
      if (parseCookies(req)[LOGGED_OUT_COOKIE]) {
        res.status(200).type('html').send(SIGNED_OUT_PAGE);
        return;
      }
      res.redirect(302, `${editUrl}/api/auth/sso/mutable?return=${encodeURIComponent(req.originalUrl || '/')}`);
      return;
    }
    res.status(401).json({ Success: false, Error: 'Sign in via edit.phext.io.' });
  };

  return { enabled, router, middleware };
}
