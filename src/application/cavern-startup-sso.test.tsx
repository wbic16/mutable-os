// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { CavernStartup } from './cavern-startup';

/**
 * Regression test for the SSO startup race (2026-11-06): onMount
 * fires the /api/auth/session fetch and the startup POST without
 * ordering, so whenever the session fetch lost, startup went out
 * without the CSRF token and the gate 403'd at first paint, with
 * the user left on a Retry button. request() now awaits the
 * shared identity load. This file is separate from
 * cavern-startup.test.tsx because the identity promise is module
 * state: it needs a module registry no earlier mount has settled.
 */
const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const button = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};

it('holds the startup POST until a slow identity load settles, then sends its CSRF token', async () => {
  let releaseSession!: () => void;
  const sessionGate = new Promise<void>(resolve => { releaseSession = resolve; });
  let startupInit: RequestInit | undefined;
  const fetch = vi.fn(async (address: string, init?: RequestInit) => {
    if (address.endsWith('/api/auth/session')) {
      await sessionGate;
      return json({ signed_in: true, who: 'github:12345', handle: 'wbic16', csrf: 'token-abc' });
    }
    if (address.endsWith('/startup')) {
      startupInit = init;
      return json({ Success: true, Data: { recentCaverns: [] } });
    }
    throw new Error(`Unexpected request: ${address}`);
  });
  vi.stubGlobal('fetch', fetch);
  disposers.push(render(() => <CavernStartup>{() => <div>Workspace</div>}</CavernStartup>, document.body));
  await vi.waitFor(() => expect(fetch.mock.calls.some(([address]) => address.endsWith('/api/auth/session'))).toBe(true));
  // The session fetch is still in flight: the gated startup
  // request must not have left yet (it left tokenless before the
  // fix, and the gate 403'd it).
  await new Promise(resolve => setTimeout(resolve, 25));
  expect(fetch.mock.calls.some(([address]) => address.endsWith('/startup'))).toBe(false);
  releaseSession();
  await vi.waitFor(() => expect(button('Open').disabled).toBe(false));
  expect(new Headers(startupInit?.headers).get('x-csrf-token')).toBe('token-abc');
  expect(document.body.textContent).toContain('wbic16');
});
