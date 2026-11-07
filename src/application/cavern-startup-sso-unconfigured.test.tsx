// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { CavernStartup } from './cavern-startup';

/**
 * Companion to cavern-startup-sso.test.tsx (the startup race):
 * with the gate unconfigured, /api/auth/session answers 404 and
 * startup must proceed exactly as it did before SSO — no token,
 * no identity bar, no delay. A separate file because the identity
 * promise is module state: each scenario needs a module registry
 * no other mount has settled.
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

it('proceeds without a token when the gate is unconfigured (session 404), as before SSO', async () => {
  let startupInit: RequestInit | undefined;
  const fetch = vi.fn(async (address: string, init?: RequestInit) => {
    if (address.endsWith('/api/auth/session')) return json({ Success: false, Error: 'SSO is not configured on this Mutable server.' }, 404);
    if (address.endsWith('/startup')) {
      startupInit = init;
      return json({ Success: true, Data: { recentCaverns: [] } });
    }
    throw new Error(`Unexpected request: ${address}`);
  });
  vi.stubGlobal('fetch', fetch);
  disposers.push(render(() => <CavernStartup>{() => <div>Workspace</div>}</CavernStartup>, document.body));
  await vi.waitFor(() => expect(button('Open').disabled).toBe(false));
  expect(new Headers(startupInit?.headers).get('x-csrf-token')).toBeNull();
  expect(document.querySelector('.cavern-identity')).toBeNull();
});
