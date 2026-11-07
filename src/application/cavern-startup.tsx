import { For, Show, createContext, createSignal, onCleanup, onMount, useContext, untrack, type JSX } from 'solid-js';
import './cavern-startup.css';
import { currentSettingsCapture } from './settings-snapshot';

export type CurrentCavern = { path: string; name: string; cavernGuid: string; session: string; mode?: 'phext' | 'native' };
type Target = { path: string; name: string; state: 'missing' | 'folder' | 'cavern'; mode?: 'phext' | 'native' | 'ambiguous' | 'none'; modeSource?: 'marker' | 'derived' | 'none' };
type Recovery = { path: string; error: string };
type CavernContext = {
  current: () => CurrentCavern | undefined;
  choose: (mode?: 'open' | 'create') => void;
  reconcile: (policy: { version: 1; opaqueTypes: readonly string[] }) => void;
  recent: () => Array<Omit<CurrentCavern, 'session'>>;
  open: (path: string) => void;
  reveal: () => void;
  upgrade: () => Promise<void>;
  status: () => string;
};
const Context = createContext<CavernContext>();
export const useCurrentCavern = () => useContext(Context);

// SSO identity (sso-design §4.2 M5). The server gate is env-gated:
// when it is off, /api/auth/session answers 404 and ssoIdentity
// stays undefined — no identity bar, no CSRF header, no 401
// redirect; this client behaves exactly as it did before SSO.
type SsoIdentity = { signed_in: boolean; who?: string; handle?: string; name?: string; editor?: boolean; csrf?: string };
let ssoIdentity: SsoIdentity | undefined;
// The identity load, shared: loadIdentity() starts it once and
// request() awaits it, so a gated request can never leave before
// the CSRF token is known. Before SSO this raced — onMount fired
// the session fetch and the startup POST unordered, and whenever
// the session fetch lost, startup went out tokenless and the gate
// 403'd ("Missing or invalid CSRF token.") at first paint.
let ssoIdentityLoad: Promise<void> | undefined;
const ssoLoginUrl = () => '/api/auth/login?return=' + encodeURIComponent(window.location.pathname);

async function request(action: string, body?: unknown) {
  // No gated request leaves before the identity load settles.
  // When the gate is unconfigured the session call 404s fast and
  // ssoIdentity stays undefined, so this costs one settled promise
  // and behaviour is unchanged.
  if (ssoIdentityLoad) await ssoIdentityLoad;
  const unavailable = 'Mutable cannot reach its local server. Start or restart Mutable, then try again.';
  const invalid = 'Mutable received an invalid response from its local server. Restart Mutable, then try again.';
  let response: Response;
  try {
    response = await fetch(`/api/cavern/${action}`, body === undefined ? undefined : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ssoIdentity?.csrf ? { 'x-csrf-token': ssoIdentity.csrf } : {}) },
      body: JSON.stringify(body),
    });
  } catch { throw new Error(unavailable); }
  // The SSO gate's 401: the Mutable session is gone (expired
  // mid-flight). Restart sign-in at the current page (§3.1); the
  // error below still surfaces if the navigation is somehow held.
  if (response.status === 401 && ssoIdentity) window.location.assign(ssoLoginUrl());
  let result: any;
  try { result = await response.json(); }
  // The development proxy returns an empty 500 when the local server is stopped.
  catch { throw new Error(response.status >= 500 ? unavailable : invalid); }
  if (!response.ok || result?.Success === false) throw new Error(
    typeof result?.Error === 'string' && result.Error ? result.Error : response.status >= 500 ? unavailable : 'Mutable could not open the Cavern.',
  );
  if (result?.Success !== true || !result.Data || typeof result.Data !== 'object') throw new Error(invalid);
  return result.Data;
}

/** The workspace is mounted only after an explicitly selected folder is established. */
export function CavernStartup(props: { children: (cavern: CurrentCavern) => JSX.Element }) {
  const [current, setCurrent] = createSignal<CurrentCavern>();
  const [recent, setRecent] = createSignal<Array<Omit<CurrentCavern, 'session'>>>([]);
  const [recovery, setRecovery] = createSignal<Recovery>();
  const [choosing, setChoosing] = createSignal(false), [mode, setMode] = createSignal<'open' | 'create'>('open');
  // Mode selection (design §2.1): new Caverns default to Phext
  // pre-selected. The choice is recorded by the server in the
  // Cavern's own state record at establish; nothing global exists.
  const [storageMode, setStorageMode] = createSignal<'phext' | 'native'>('phext');
  const [busy, setBusy] = createSignal(true), [error, setError] = createSignal('');
  const [folder, setFolder] = createSignal(''), [name, setName] = createSignal('');
  const [phextOpen, setPhextOpen] = createSignal(false), [phextTarget, setPhextTarget] = createSignal('');
  let phextFile: File | undefined;
  const [target, setTarget] = createSignal<Target>(), [index, setIndex] = createSignal<any>();
  // SSO identity for the chrome (M5): undefined until the session
  // call answers with a real payload — and forever when the
  // server's gate is unconfigured, which is the point.
  const [identity, setIdentity] = createSignal<SsoIdentity>();
  let alive = true, polling = false, generation: string | undefined;
  // Every managed request is bound to the active server context, fencing stale tabs.
  const originalFetch = window.fetch;
  const boundFetch: typeof window.fetch = (input, init) => {
    const address = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const gated = address.origin === window.location.origin && (address.pathname.startsWith('/api/') || address.pathname === '/upload');
    if (!gated) return originalFetch.call(window, input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    // The Cavern fence, unchanged: the session header rides on the
    // fenced /api surface and /upload, never on /api/cavern itself.
    if (!address.pathname.startsWith('/api/cavern/') && generation && !headers.has('X-Mutable-Cavern')) headers.set('X-Mutable-Cavern', generation);
    // The SSO gate's CSRF rule covers every non-GET API/upload
    // call once a Mutable session exists (design §2 decision 6).
    if (ssoIdentity?.csrf && method !== 'GET' && method !== 'HEAD' && !headers.has('x-csrf-token')) headers.set('x-csrf-token', ssoIdentity.csrf);
    const pending = originalFetch.call(window, input, { ...init, headers });
    // A 401 from the gate restarts sign-in at the current page.
    if (ssoIdentity) void pending.then(response => {
      if (response.status === 401 && alive) window.location.assign(ssoLoginUrl());
    }, () => {});
    return pending;
  };
  window.fetch = boundFetch;
  // Ask the server who is signed in (design §3.4). Any failure —
  // a 404 from an unconfigured gate, a stopped server, a non-JSON
  // proxy error — leaves the identity unset and the chrome bare.
  // The load is shared (ssoIdentityLoad): request() awaits the
  // same promise, which is what orders the first gated POSTs
  // after the CSRF token.
  const loadIdentity = () => {
    ssoIdentityLoad ??= (async () => {
      try {
        const response = await originalFetch('/api/auth/session');
        const data = await response.json().catch(() => undefined);
        if (!alive || !data || typeof data.signed_in !== 'boolean') return;
        ssoIdentity = data as SsoIdentity;
        setIdentity(ssoIdentity);
      } catch { /* SSO unconfigured or unreachable: no identity UI. */ }
    })();
    return ssoIdentityLoad;
  };
  // Mutable logout is local (design §3.5): it clears the Mutable
  // session and lands on the gate's signed-out page; the edit
  // session is ended at edit, not from here.
  const signOut = async () => {
    try {
      await originalFetch('/api/auth/logout', {
        method: 'POST', headers: ssoIdentity?.csrf ? { 'x-csrf-token': ssoIdentity.csrf } : {},
      });
    } catch { /* The navigation is the outcome either way. */ }
    window.location.assign('/');
  };
  const identityBar = () => <Show when={identity()}><div class="cavern-identity">
    <Show when={identity()!.signed_in} fallback={<span>Not signed in to Mutable OS</span>}>
      <span>Signed in as <strong>{identity()!.handle || identity()!.who}</strong></span>
      <Show when={identity()!.editor}><em class="cavern-mode-badge">editor</em></Show>
    </Show>
    <a href="https://edit.phext.io/">phext edit ↗</a>
    <Show when={identity()!.signed_in} fallback={<a href={ssoLoginUrl()}>Sign in</a>}>
      <button type="button" onClick={() => void signOut()}>Sign out</button>
    </Show>
  </div></Show>;
  const apply = (value: any) => {
    if (!alive) return;
    if (value.recentCaverns) setRecent(value.recentCaverns);
    setRecovery(value.recovery); setIndex(value.index);
    generation = value.current?.session; setCurrent(value.current);
  };
  const startup = async () => {
    setBusy(true); setError('');
    try { apply(await request('startup', {})); }
    catch (e) { if (alive) setError(String(e)); }
    finally { if (alive) setBusy(false); }
  };
  const choose = (next: 'open' | 'create' = 'open') => {
    if (busy()) return;
    setMode(next); setFolder(''); setName(''); setTarget(undefined); setError(''); setPhextOpen(false); setStorageMode('phext'); setChoosing(true);
  };
  // Phase 5: open a Cavern from a received .phext / .phext.xz. The
  // server verifies (and unlocks) the file, installs it into the
  // target folder, then hands off to the normal establish flow.
  const openFromPhext = async () => {
    if (!phextFile) { setError('Choose a .phext or .phext.xz file.'); return; }
    if (!safeToSwitch()) return;
    setBusy(true); setError('');
    try {
      // This POST bypasses request(), so it awaits the shared
      // identity load itself — the CSRF header below must never
      // be read before the session fetch has settled.
      await loadIdentity();
      const form = new FormData();
      form.append('phext', phextFile);
      form.append('target', phextTarget());
      const response = await originalFetch('/api/cavern/open-phext', {
        method: 'POST', body: form,
        headers: ssoIdentity?.csrf ? { 'x-csrf-token': ssoIdentity.csrf } : undefined,
      });
      const result = await response.json().catch(() => undefined);
      if (!response.ok || result?.Success === false || !result?.Data) {
        throw new Error(typeof result?.Error === 'string' && result.Error ? result.Error : 'Mutable could not open a Cavern from that phext.');
      }
      if (!alive) return;
      apply(result.Data); setChoosing(false); setPhextOpen(false); phextFile = undefined;
    } catch (e) { if (alive) setError(String(e)); }
    finally { if (alive) setBusy(false); }
  };
  const safeToSwitch = () => {
    if (!current()) return true;
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return !event.defaultPrevented || window.confirm('There is unsaved or pending work. Switch Caverns and close this workspace? Cancel to save or recover it first.');
  };
  const establish = async (resolved: Target, intent: 'open' | 'create', confirmed = false, modeChoice?: 'phext' | 'native') => {
    if (current()?.path === resolved.path) { setChoosing(false); setTarget(undefined); setError(''); return; }
    if (!safeToSwitch()) return;
    // Freeze the workspace during establishment; failed opens retain its live work.
    // A successful context replacement disposes the old workspace through keyed Show.
    setChoosing(true); setBusy(true); setError('');
    try {
      const value = await request('establish', { path: resolved.path, intent, confirmed, ...(modeChoice ? { mode: modeChoice } : {}) });
      if (!alive) return;
      if (value.confirmation) { setTarget(value.target); return; }
      apply(value); setChoosing(false); setTarget(undefined);
    } catch (e) { if (alive) setError(String(e)); }
    finally { if (alive) setBusy(false); }
  };
  // Mode selection §4.2/§5: upgrade the current native Cavern to
  // Phext. The composition is close → migrate → establish; the
  // migration is non-destructive (native files remain in place,
  // frozen) and records the mode inside the generated phext, so the
  // re-establish opens in phext mode from the record.
  const upgrade = async () => {
    const selected = current(); if (!selected || selected.mode !== 'native') return;
    if (!safeToSwitch()) return;
    setBusy(true); setError('');
    try {
      await request('close', {});
      await request('migrate', { path: selected.path });
      const value = await request('establish', { path: selected.path, intent: 'open', confirmed: true });
      if (!alive) return;
      apply(value);
    } catch (e) { if (alive) setError(String(e)); throw e; }
    finally { if (alive) setBusy(false); }
  };
  const inspect = async (path: string, intent: 'open' | 'create') => {
    if (current() && !choosing()) { setMode(intent); setFolder(path); setTarget(undefined); setChoosing(true); }
    setBusy(true); setError('');
    let resolved: Target | undefined;
    try {
      resolved = await request('inspect', { path });
      if (!alive) return;
      if (resolved!.state === 'missing' && intent === 'open') throw new Error('This folder could not be found. Locate the Cavern or choose another folder.');
      setMode(intent);
      if (resolved!.state === 'folder') { setTarget(resolved); setChoosing(true); return; }
      // A Cavern whose mode is only derivable from its layout is
      // shown as a fact once (the open records it); a Cavern holding
      // both layouts with no recorded mode asks which copy is
      // current. A recorded mode opens directly.
      if (resolved!.state === 'cavern' && (resolved!.mode === 'ambiguous' || resolved!.modeSource === 'derived')) { setTarget(resolved); setChoosing(true); return; }
    } catch (e) { if (alive) setError(String(e)); resolved = undefined; }
    finally { if (alive) setBusy(false); }
    if (resolved && alive) await establish(resolved, intent, false, intent === 'create' ? storageMode() : undefined);
  };
  const select = async () => {
    setBusy(true); setError('');
    let selected: string | undefined;
    try { selected = (await request('select-folder', {})).path; if (alive && selected) setFolder(selected); }
    catch (e) { if (alive) setError(String(e)); }
    finally { if (alive) setBusy(false); }
    if (alive && selected && mode() === 'open') await inspect(selected, 'open');
  };
  const createPath = () => `${folder().replace(/[\\/]$/, '')}/${name().trim()}`;
  const submit = () => {
    if (mode() === 'create' && (!name().trim() || name().trim() === '.' || name().trim() === '..' || /[\\/\0]/.test(name()))) { setError('Enter a Cavern name without path separators.'); return; }
    void inspect(mode() === 'create' ? createPath() : folder(), mode());
  };
  const context: CavernContext = {
    current, choose, recent, upgrade,
    open: path => { if (!busy()) void inspect(path, 'open'); },
    reveal: () => { void request('reveal', {}).catch(e => { if (alive) { setError(String(e)); setChoosing(true); } }); },
    status: () => index()?.pending ? 'Indexing Cavern…' : index()?.coverage?.state === 'incomplete' || index()?.coverage?.state === 'unknown' ? 'Cavern index needs attention' : '',
    reconcile: policy => {
      const selected = current(); if (!selected) return;
      void request('index', { session: selected.session, policy }).then(value => {
        if (alive && current()?.session === selected.session) setIndex(value);
      }).catch(e => { if (alive && current()?.session === selected.session) setIndex({ coverage: { state: 'unknown', diagnostics: [String(e)] } }); });
    },
  };
  onMount(() => {
    // Order is load-bearing, not incidental: loadIdentity() starts
    // the shared identity promise and startup()'s first request()
    // awaits it, so the startup POST always carries the CSRF
    // token when a session exists.
    void loadIdentity();
    void startup();
    const timer = setInterval(() => {
      const selected = untrack(current); if (!selected || polling || untrack(busy)) return;
      polling = true;
      void request('status').then(value => {
        if (!alive || current()?.session !== selected.session) return;
        if (value.current?.session !== selected.session) { generation = undefined; setCurrent(undefined); setRecovery({ path: selected.path, error: 'The current Cavern changed in another Mutable window. Reopen it to continue.' }); }
        else { setIndex(value.index); if (value.recentCaverns) setRecent(value.recentCaverns); }
      }).catch(e => { if (alive) setIndex({ coverage: { state: 'unknown', diagnostics: [String(e)] } }); }).finally(() => { polling = false; });
    }, 3000);
    onCleanup(() => clearInterval(timer));
  });
  onCleanup(() => { alive = false; if (window.fetch === boundFetch) window.fetch = originalFetch; });
  const recents = () => <Show when={recent().length}><div class="cavern-recents"><h2>Recent Caverns</h2><For each={recent()}>{c =>
    <button type="button" disabled={busy()} onClick={() => void inspect(c.path, 'open')}><strong>{c.name}</strong><small>{c.path}</small><Show when={c.mode}><em class="cavern-mode-badge">{c.mode === 'phext' ? 'Phext' : 'Native'}</em></Show></button>
  }</For></div></Show>;
  // The storage-mode choice, shared by the create form and the
  // folder setup screen. Phext is pre-selected (design §2.1).
  const modeChoice = () => <fieldset class="cavern-mode-choice" disabled={busy()}><legend>Storage mode</legend>
    <label><input type="radio" name="cavern-storage-mode" checked={storageMode() === 'phext'} onChange={() => setStorageMode('phext')} /> Phext — everything in one <code>cavern.phext</code> file</label>
    <label><input type="radio" name="cavern-storage-mode" checked={storageMode() === 'native'} onChange={() => setStorageMode('native')} /> Native — ordinary files in the folder</label>
  </fieldset>;
  const chooser = () => <section class="cavern-card" role={current() ? 'dialog' : undefined} aria-modal={current() ? true : undefined} aria-label="Cavern setup" aria-busy={busy()}>
    <Show when={!choosing()} fallback={<>
      <h1>{phextOpen() ? 'Open Cavern from a Phext' : target() ? target()!.mode === 'ambiguous' ? 'Which copy should Mutable use?' : target()!.state === 'cavern' ? 'Open this Cavern?' : 'Set up this folder as a Cavern?' : mode() === 'create' ? 'Create New Cavern' : 'Open Cavern'}</h1>
      <Show when={phextOpen()} fallback={<Show when={target()} keyed fallback={<form onSubmit={e => { e.preventDefault(); submit(); }}>
        <Show when={mode() === 'create'}><label>Cavern Name<input autofocus value={name()} disabled={busy()} onInput={e => setName(e.currentTarget.value)} placeholder="Leonardo Research" /></label></Show>
        <label>{mode() === 'create' ? 'Location (parent folder)' : 'Folder location'}<div class="cavern-location"><input autofocus={mode() === 'open'} value={folder()} disabled={busy()} onInput={e => setFolder(e.currentTarget.value)} placeholder="Choose a folder or enter its path" /><button type="button" disabled={busy()} onClick={() => void select()}>Browse…</button></div></label>
        <Show when={mode() === 'create' && folder() && name().trim()}><p>Resulting location: <code>{createPath()}</code></p></Show>
        <Show when={mode() === 'create'}>{modeChoice()}</Show>
        <div class="cavern-actions"><button type="submit" class="cavern-primary" disabled={busy() || !folder().trim() || (mode() === 'create' && !name().trim())}>{mode() === 'create' ? 'Create Cavern' : 'Open Cavern'}</button><button type="button" disabled={busy()} onClick={() => { setChoosing(false); setError(''); }}>Cancel</button></div>
      </form>}>{resolved => <Show when={resolved.mode === 'ambiguous'} fallback={<Show when={resolved.state === 'cavern'} fallback={<>
        <p>{mode() === 'create' ? 'This folder already exists. Mutable can set it up as a Cavern.' : 'Mutable will add the infrastructure it needs to this folder.'} Existing files will remain in place.</p><code>{resolved.path}</code>
        {modeChoice()}
        <div class="cavern-actions"><button class="cavern-primary" disabled={busy()} onClick={() => void establish(resolved, mode(), true, storageMode())}>Set Up as Cavern</button><button disabled={busy()} onClick={() => { setTarget(undefined); setError(''); }}>{mode() === 'create' ? 'Choose Another Location' : 'Cancel'}</button></div>
      </>}>
        <p>{resolved.mode === 'phext' ? 'This is a Phext Cavern — everything lives in one cavern.phext file.' : 'This is a Native Cavern — its content is ordinary files in the folder.'}</p><code>{resolved.path}</code>
        <div class="cavern-actions"><button class="cavern-primary" disabled={busy()} onClick={() => void establish(resolved, mode(), true)}>Open Cavern</button><button disabled={busy()} onClick={() => { setTarget(undefined); setError(''); }}>Cancel</button></div>
      </Show>}>
        <p>This folder holds both a phext store (<code>cavern.phext</code>) and a disk knowledge home (<code>.mutable/mutable.db</code>), and no recorded mode says which copy is current. Your answer is recorded in the Cavern and used from then on.</p><code>{resolved.path}</code>
        <div class="cavern-actions"><button class="cavern-primary" disabled={busy()} onClick={() => void establish(resolved, mode(), true, 'phext')}>Use the Phext Copy</button><button class="cavern-primary" disabled={busy()} onClick={() => void establish(resolved, mode(), true, 'native')}>Use the Native (Files) Copy</button><button disabled={busy()} onClick={() => { setTarget(undefined); setError(''); }}>Cancel</button></div>
      </Show>}</Show>}>
      <form onSubmit={e => { e.preventDefault(); void openFromPhext(); }}>
        <p>A Cavern shared as one file: the raw <code>.phext</code>, or the sealed <code>.phext.xz</code> (its integrity is verified before anything is written). It is installed into a new, empty folder and opened.</p>
        <label>Cavern phext file<input type="file" accept=".phext,.xz" disabled={busy()} onChange={e => { phextFile = e.currentTarget.files?.[0]; }} /></label>
        <label>New folder for this Cavern<input autofocus value={phextTarget()} disabled={busy()} onInput={e => setPhextTarget(e.currentTarget.value)} placeholder="Enter the path of an empty folder" /></label>
        <div class="cavern-actions"><button type="submit" class="cavern-primary" disabled={busy() || !phextTarget().trim()}>Open Cavern from Phext</button><button type="button" disabled={busy()} onClick={() => { setPhextOpen(false); setChoosing(false); setError(''); }}>Cancel</button></div>
      </form>
      </Show>
    </>}>
      <Show when={recovery()} keyed fallback={<><small>MUTABLE OS</small><h1>Welcome to Mutable OS</h1><p>Mutable stores your documents, objects and knowledge in a Cavern: an ordinary folder on your computer.</p></>}>{r => <><h1>Cavern unavailable</h1><p>Mutable could not open the previously selected Cavern:</p><code>{r.path}</code><p>{r.error}</p><button disabled={busy()} onClick={() => { choose('open'); void select(); }}>Locate Cavern…</button></>}</Show>
      <div class="cavern-options"><div><h2>Create a New Cavern</h2><p>Create a new folder and set it up for Mutable OS.</p><button class="cavern-primary" disabled={busy()} onClick={() => choose('create')}>Create</button></div><div><h2>Open a Folder as a Cavern</h2><p>Use an existing folder as a Mutable Cavern.</p><button class="cavern-primary" disabled={busy()} onClick={() => { choose('open'); void select(); }}>Open</button></div><div><h2>Open a Cavern from a Phext</h2><p>Unlock a Cavern shared as a single .phext or sealed .phext.xz file.</p><button class="cavern-primary" disabled={busy()} onClick={() => { setMode('open'); setTarget(undefined); setError(''); setPhextOpen(true); setChoosing(true); }}>Open from Phext…</button></div></div>
      {recents()}
      <Show when={current()}><button disabled={busy()} onClick={() => { setChoosing(false); setError(''); }}>Return to Mutable OS</button></Show>
    </Show>
    <Show when={busy()}><p role="status">Opening Cavern…</p></Show>
    <Show when={error()}><p class="cavern-error" role="alert">{error()}</p><Show when={!current() && !choosing()}><button disabled={busy()} onClick={() => void startup()}>Retry startup</button></Show></Show>
  </section>;
  return <Context.Provider value={context}>
    {identityBar()}
    <Show when={current()} keyed fallback={<main class="cavern-startup">{chooser()}</main>}>{selected => <>
      <div inert={choosing()}>{props.children(selected)}</div>
      <Show when={choosing()}><div class="cavern-overlay" ref={el => queueMicrotask(() => el.querySelector<HTMLInputElement>('input')?.focus())} onKeyDown={e => {
        if (e.key === 'Escape' && !busy()) { setChoosing(false); setTarget(undefined); setError(''); }
        if (e.key === 'Tab') {
          const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')];
          const first = controls[0], last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>{chooser()}</div></Show>
    </>}</Show>
  </Context.Provider>;
}

export function CavernControl() {
  const cavern = useCurrentCavern();
  const [open, setOpen] = createSignal(false);
  const [dlError, setDlError] = createSignal('');
  const [settingsNote, setSettingsNote] = createSignal('');
  const [confirmUpgrade, setConfirmUpgrade] = createSignal(false);
  const [upgrading, setUpgrading] = createSignal(false);
  // Mode selection §4.2/§5: upgrade this Cavern from Native to
  // Phext. The terms are stated before anything runs; the action
  // itself lives in CavernStartup (it owns the switch discipline).
  const runUpgrade = async () => {
    setUpgrading(true); setDlError('');
    try { await cavern!.upgrade(); setConfirmUpgrade(false); setOpen(false); }
    catch (e) { setDlError(String(e)); }
    finally { setUpgrading(false); }
  };
  const nativeGateTitle = 'This Cavern is in Native mode; upgrade it to Phext to use this.';
  // Settings bundle: ship a COPY of the current settings into this
  // Cavern's phext (explicit action; opening a Cavern never imports
  // settings back). The server validates all five domains before
  // writing the L7 settings tree.
  const updateShippedSettings = async () => {
    setDlError(''); setSettingsNote('');
    try {
      const data = await request('settings/capture', { settings: currentSettingsCapture() });
      setSettingsNote(`Settings copy updated in this Cavern (${data.settings.fields} fields, ${new Date(data.settings.updatedUtc).toLocaleString()}).`);
    } catch (e) { setDlError(String(e)); }
  };
  // Phase 5: Download Cavern — the raw phext, or the xz-sealed form
  // (sealed at export time from the current uncompressed state).
  const download = async (format: 'phext' | 'xz') => {
    setDlError('');
    try {
      const response = await fetch(`/api/cavern/download?format=${format}`);
      if (!response.ok) {
        const result = await response.json().catch(() => undefined);
        throw new Error(typeof result?.Error === 'string' && result.Error ? result.Error : 'The Cavern download failed.');
      }
      const blob = await response.blob();
      const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1]
        || `${cavern!.current()!.name}.phext${format === 'xz' ? '.xz' : ''}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setOpen(false);
    } catch (e) { setDlError(String(e)); }
  };
  let root!: HTMLDivElement;
  onMount(() => {
    if (!cavern) return;
    const outside = (event: PointerEvent) => { if (root && !root.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    onCleanup(() => document.removeEventListener('pointerdown', outside));
  });
  const act = (action: () => void) => { setOpen(false); action(); };
  return <Show when={cavern?.current()}><div ref={root} class="cavern-control" onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); root.querySelector('button')?.focus(); } }}>
    <button class="codex-system-bar__trigger" aria-label="Current Cavern" aria-expanded={open()} onClick={() => setOpen(!open())}>{cavern!.current()!.name} ▾</button>
    <span role="status" title={cavern!.status()}>{cavern!.status()}</span>
    <Show when={open()}><section class="cavern-menu" aria-label="Current Cavern settings"><strong>{cavern!.current()!.name}</strong><code>{cavern!.current()!.path}</code>
      <span class="cavern-mode-line">{cavern!.current()!.mode === 'phext' ? 'Phext mode — everything in one cavern.phext file' : 'Native mode — ordinary files in the folder'}</span>
      <button onClick={() => act(() => cavern!.choose('open'))}>Open Another Cavern…</button><button onClick={() => act(() => cavern!.choose('create'))}>Create New Cavern…</button>
      <button onClick={() => act(() => cavern!.reveal())}>Reveal Cavern in {navigator.platform.includes('Mac') ? 'Finder' : 'File Manager'}</button>
      <button disabled={cavern!.current()!.mode !== 'phext'} title={cavern!.current()!.mode !== 'phext' ? nativeGateTitle : undefined} onClick={() => void download('phext')}>Download Cavern (.phext)</button><button disabled={cavern!.current()!.mode !== 'phext'} title={cavern!.current()!.mode !== 'phext' ? nativeGateTitle : undefined} onClick={() => void download('xz')}>Download Sealed Cavern (.phext.xz)</button>
      <button disabled={cavern!.current()!.mode !== 'phext'} title={cavern!.current()!.mode !== 'phext' ? nativeGateTitle : undefined} onClick={() => void updateShippedSettings()}>Update Shipped Settings</button>
      <Show when={cavern!.current()!.mode === 'native'}><p>Downloads and shipped settings are Phext-mode features.</p>
        <Show when={!confirmUpgrade()} fallback={<>
          <p>Mutable will generate <code>cavern.phext</code> from this Cavern and verify it. Your existing files stay exactly where they are, unchanged, as a snapshot Mutable will no longer update. The Cavern reopens in Phext mode.</p>
          <button disabled={upgrading()} onClick={() => void runUpgrade()}>{upgrading() ? 'Upgrading…' : 'Confirm Upgrade to Phext'}</button>
          <button disabled={upgrading()} onClick={() => setConfirmUpgrade(false)}>Cancel</button>
        </>}><button onClick={() => setConfirmUpgrade(true)}>Upgrade to Phext…</button></Show>
      </Show>
      <Show when={settingsNote()}><p role="status">{settingsNote()}</p></Show>
      <Show when={dlError()}><p class="cavern-error" role="alert">{dlError()}</p></Show>
      <Show when={cavern!.recent().length > 1}><h3>Recent Caverns</h3><For each={cavern!.recent()}>{c => <button disabled={c.cavernGuid === cavern!.current()!.cavernGuid} onClick={() => act(() => cavern!.open(c.path))}><strong>{c.name}</strong><small>{c.path}</small><Show when={c.mode}><em class="cavern-mode-badge">{c.mode === 'phext' ? 'Phext' : 'Native'}</em></Show></button>}</For></Show>
    </section></Show>
  </div></Show>;
}
