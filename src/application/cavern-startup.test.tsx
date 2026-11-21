// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { onCleanup } from 'solid-js';
import { CavernStartup, useCurrentCavern } from './cavern-startup';

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const button = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
async function setup(picker: () => Promise<Response>) {
  const fetch = vi.fn(async (address: string, init?: RequestInit) => {
    if (address.endsWith('/startup')) return json({ Success: true, Data: { recentCaverns: [] } });
    if (address.endsWith('/select-folder')) return picker();
    if (address.endsWith('/inspect')) return json({ Success: true, Data: {
      path: JSON.parse(init!.body as string).path, name: 'Selected folder', state: 'folder',
    } });
    throw new Error(`Unexpected request: ${address}`);
  });
  vi.stubGlobal('fetch', fetch);
  disposers.push(render(() => <CavernStartup>{() => <div>Workspace</div>}</CavernStartup>, document.body));
  await vi.waitFor(() => expect(button('Open').disabled).toBe(false));
  return fetch;
}

it.each([
  ['an empty proxy error', () => Promise.resolve(new Response('', { status: 500 })), 'cannot reach its local server'],
  ['a rejected connection', () => Promise.reject(new TypeError('Failed to fetch')), 'cannot reach its local server'],
  ['an HTML response', () => Promise.resolve(new Response('<html>Unavailable</html>')), 'invalid response'],
  ['an invalid JSON envelope', () => Promise.resolve(json(null)), 'invalid response'],
] as const)('recovers Browse after %s without a JSON parser error', async (_name, failure, message) => {
  let pick: () => Promise<Response> = failure;
  const fetch = await setup(() => pick());
  button('Open').click();
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain(message));
  expect(document.body.textContent).not.toMatch(/SyntaxError|Unexpected end of JSON/);
  expect(button('Browse…').disabled).toBe(false);

  pick = async () => json({ Success: true, Data: { path: '/selected/cavern' } });
  button('Browse…').click();
  await vi.waitFor(() => expect(button('Set Up as Cavern').disabled).toBe(false));
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(fetch.mock.calls.filter(([address]) => address.endsWith('/inspect'))).toHaveLength(1);
  expect(fetch.mock.calls.some(([address]) => address.endsWith('/establish'))).toBe(false);
});

it('treats picker cancellation as a normal outcome and retains a typed path', async () => {
  const fetch = await setup(async () => json({ Success: true, Data: { cancelled: true } }));
  button('Open').click();
  await vi.waitFor(() => expect(button('Browse…').disabled).toBe(false));
  const input = document.querySelector<HTMLInputElement>('.cavern-location input')!;
  input.value = '/keep/this/path';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  button('Browse…').click();
  await vi.waitFor(() => expect(button('Browse…').disabled).toBe(false));
  expect(input.value).toBe('/keep/this/path');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(fetch.mock.calls.some(([address]) => address.endsWith('/inspect'))).toBe(false);
});

it('retains the server explanation when the system picker cannot open', async () => {
  const message = 'The system folder picker could not open. Enter the folder path below.';
  await setup(async () => json({ Success: false, Error: message }, 409));
  button('Open').click();
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain(message));
  expect(button('Browse…').disabled).toBe(false);
});

it.each(['missing', 'new-session', 'other-cavern'] as const)('retains the exact workspace when status reports %s and reconnects only to the same Cavern', async kind => {
  vi.useFakeTimers();
  const selected = { path: '/original', name: 'Original', cavernGuid: 'original-guid', session: 'old-session' };
  const next = { ...selected, session: 'new-session' };
  let server: typeof selected | undefined = selected;
  let startupError = false, mounted = 0, disposed = 0;
  let context: ReturnType<typeof useCurrentCavern>;
  const fetch = vi.fn(async (address: string, _init?: RequestInit) => {
    if (address.endsWith('/startup') && startupError) throw new TypeError('Failed to fetch');
    return json({ Success: true, Data: { current: server, recentCaverns: [] } });
  });
  vi.stubGlobal('fetch', fetch);
  const Workspace = () => {
    context = useCurrentCavern(); mounted++;
    onCleanup(() => disposed++);
    return <textarea aria-label="Unsaved document" />;
  };
  disposers.push(render(() => <CavernStartup>{() => <Workspace />}</CavernStartup>, document.body));
  await vi.advanceTimersByTimeAsync(0);
  const textarea = document.querySelector('textarea')!;
  textarea.value = 'Unsaved test6 edits';
  // Ordinary status polling performs only its one status request: no Save,
  // serialization, admission or workspace rebuild is triggered.
  fetch.mockClear();
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/cavern/status']);
  server = kind === 'missing' ? undefined : kind === 'new-session' ? next : { ...next, path: '/other', cavernGuid: 'other-guid' };
  await vi.advanceTimersByTimeAsync(3000);
  expect(document.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Unsaved test6 edits');
  expect(mounted).toBe(1); expect(disposed).toBe(0);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('unsaved edits are still open');
  fetch.mockClear();
  await expect(window.fetch('/api/native/save', { method: 'POST' })).rejects.toThrow('Retry connection');
  await vi.advanceTimersByTimeAsync(9000);
  expect(fetch).not.toHaveBeenCalled();

  startupError = true;
  button('Retry connection').click(); await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('cannot reach');
  startupError = false;
  for (const different of [{ ...next, cavernGuid: 'replacement-guid' }, { ...next, path: '/other-path' }]) {
    server = different; button('Retry connection').click(); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('not using this Cavern');
    expect(context!.current()!.session).toBe('old-session');
  }
  server = next; button('Retry connection').click(); await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(context!.current()).toEqual(next);
  expect(document.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Unsaved test6 edits');
  expect(mounted).toBe(1); expect(disposed).toBe(0);
  // Reconnection changes request fencing, but never replays an authored Save.
  expect(fetch.mock.calls.every(([url]) => url === '/api/cavern/startup')).toBe(true);
  await window.fetch('/api/native/list');
  expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).get('X-Mutable-Cavern')).toBe('new-session');
});
