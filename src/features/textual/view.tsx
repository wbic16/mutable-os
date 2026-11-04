import { Dynamic, Portal } from 'solid-js/web';
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { cellStyle, loadPreferences, measuredGrid, normalisePreferences, savePreferences, type CellRect, type TextualGrid } from './grid';
import './textual.css';

/** Dedicated presentation; no editor/repository dependencies or global input bindings. */
export function TextualWorkspace(props: { returnDesktop(): void; notice?: string; application?: import("solid-js").Component<{grid:TextualGrid}>; beforeZoom?():void; ownSurface?(element:HTMLElement):()=>void }) {
  let root!: HTMLDivElement, probe!: HTMLSpanElement;
  const [preferences, setPreferences] = createSignal(loadPreferences());
  const [grid, setGrid] = createSignal<TextualGrid>();
  const [menu, setMenu] = createSignal(false);
  const [error, setError] = createSignal('');
  let frame = 0, alive = true, metrics: { width: number; height: number } | undefined;
  const schedule = (fontChanged = false) => {
    if (fontChanged) metrics = undefined;
    if (!frame && alive) frame = requestAnimationFrame(() => {
      frame = 0;
      if (!alive) return;
      const box = root.getBoundingClientRect();
      if (!metrics) { const ink = probe.getBoundingClientRect(); metrics = { width: ink.width / 256, height: ink.height }; }
      try {
        const next = measuredGrid(box.width, box.height, metrics.width, metrics.height);
        setGrid(old => old && Object.keys(next).every(key => next[key as keyof TextualGrid] === old[key as keyof TextualGrid]) ? old : next);
        setError('');
      } catch { setError('The text grid could not be measured.'); }
    });
  };
  const preference = (patch: Partial<ReturnType<typeof preferences>>) => {
    if(patch.zoom!==undefined)props.beforeZoom?.();
    const next = normalisePreferences({ ...preferences(), ...patch }); setPreferences(next); savePreferences(next);
  };
  const zoom = (delta: number) => preference({ zoom: preferences().zoom + delta });
  const rect = (r: CellRect) => grid() ? cellStyle(grid()!, r) : {};
  const columns = () => grid()?.columns ?? 0;
  const rows = () => grid()?.rows ?? 0;
  createEffect(() => { preferences().zoom; schedule(true); });
  onMount(() => {
    if(props.ownSurface)onCleanup(props.ownSurface(root));
    root.focus({ preventScroll: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : undefined;
    observer?.observe(root);
    const resize = () => schedule(true), fonts = root.ownerDocument.fonts;
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    fonts?.addEventListener('loadingdone', resize);
    void fonts?.ready.then(() => { if (alive) schedule(true); });
    schedule(true);
    onCleanup(() => { observer?.disconnect(); window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); fonts?.removeEventListener('loadingdone', resize); });
  });
  onCleanup(() => { alive = false; cancelAnimationFrame(frame); });
  const closeMenu = () => { setMenu(false); root.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus(); };
  const keys = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && menu()) { event.preventDefault(); event.stopPropagation(); closeMenu(); }
    if (event.key === 'Tab' && !(event.target instanceof Element && event.target.closest('[data-document-session],input,textarea,select,[role=dialog]'))) {
      const targets = [...root.querySelectorAll<HTMLElement>('button:not(:disabled)')].filter(el => el.getClientRects().length);
      const i = targets.indexOf(root.ownerDocument.activeElement as HTMLElement);
      if (targets.length && (event.shiftKey ? i <= 0 : i < 0 || i === targets.length - 1)) {
        event.preventDefault(); (event.shiftKey ? targets.at(-1)! : targets[0]).focus();
      }
    }
  };
  const actions = () => [
    { label: 'Return to Desktop', run: props.returnDesktop },
    { label: 'Zoom in', run: () => zoom(.1) },
    { label: 'Zoom out', run: () => zoom(-.1) },
    { label: 'Reset zoom', run: () => preference({ zoom: 1 }) },
    { label: `Palette: ${preferences().palette === 'paper' ? 'Paper' : 'Borland'}`, run: () => preference({ palette: preferences().palette === 'paper' ? 'borland' : 'paper' }) },
  ];
  return <Portal><div ref={root} class="textual-workspace" data-textual-palette={preferences().palette} data-columns={columns()} data-rows={rows()}
    role="region" aria-label="Textual Workspace" tabIndex={-1} onKeyDown={keys}
    style={{ '--tw-font-size': `${16 * preferences().zoom}px`, '--tw-line-height': `${20 * preferences().zoom}px`, '--tw-cell-width': `${grid()?.cellWidthPx ?? 0}px` }}>
    {/* Match the per-Cell inline fragments: Chrome rounds their advances differently from one long Text node. */}
    <span ref={probe} class="tw-font-probe" aria-hidden="true">{Array.from({length:256},()=> <span>M</span>)}</span>
    <Show when={grid() && columns() >= 20 && rows() >= 8} fallback={<div class="tw-small"><p>{error() || 'Enlarge the window or reduce font zoom to show the grid.'}</p><button onClick={() => zoom(-.1)}>Zoom out</button><button onClick={props.returnDesktop}>Return to Desktop</button></div>}>
      <nav class="tw-cell tw-menu-bar" aria-label="Workspace menu" style={rect({col:0,row:0,widthCells:columns(),heightCells:1})}>
        <button style={{width: `${11*(grid()?.cellWidthPx??0)}px`}} aria-haspopup="true" aria-expanded={menu()} onClick={() => setMenu(!menu())}>Workspace</button>
      </nav>
      <Show when={props.application} fallback={<>
      <div class="tw-cell tw-title" style={rect({col:1,row:2,widthCells:columns()-2,heightCells:1})}>Textual Desktop</div>
      <div class="tw-cell tw-content" style={rect({col:1,row:4,widthCells:columns()-2,heightCells:Math.max(1,rows()-6)})}>
        <p>No application selected.</p><button style={{width: `${19*(grid()?.cellWidthPx??0)}px`}} onClick={props.returnDesktop}>Return to Desktop</button>
      </div>
      </>}>{view=><Dynamic component={view()} grid={grid()!}/>}</Show>
      <footer class="tw-cell tw-status" style={rect({col:0,row:rows()-1,widthCells:columns(),heightCells:1})}>
        <button aria-label="Zoom out" onClick={() => zoom(-.1)}>−</button><span>{Math.round(preferences().zoom*100)}%</span><button aria-label="Zoom in" onClick={() => zoom(.1)}>+</button><span>{columns()} × {rows()}</span><span role="status">{props.notice}</span>
      </footer>
      <Show when={menu()}><div class="tw-cell tw-popup" aria-label="Workspace actions" style={rect({col:0,row:1,widthCells:Math.min(28,columns()),heightCells:Math.min(5,rows()-2)})}>
        <For each={actions()}>{action => <button onClick={() => { action.run(); closeMenu(); }}>{action.label}</button>}</For>
      </div></Show>
    </Show>
  </div></Portal>;
}
