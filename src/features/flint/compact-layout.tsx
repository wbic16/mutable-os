import { onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';

export const FLINT_LAYOUT_KEY = 'mutable.flint.compact-layout.v1';
export type FlintLayout = { library: boolean; context: boolean; explorerWidth: number; inspectorWidth: number; density: 'compact' | 'reading' };
const defaults: FlintLayout = { library: true, context: false, explorerWidth: 238, inspectorWidth: 255, density: 'compact' };
export const paneBounds = { library: { min: 150, max: 450 }, context: { min: 190, max: 450 } };
export function clampPane(value: number, pane: keyof typeof paneBounds) { return Math.round(Math.max(paneBounds[pane].min, Math.min(paneBounds[pane].max, value))); }

/** The persisted compact layout (the same parse createFlintLayout
 *  starts from). The settings-bundle capture reads through this so
 *  the shipped copy is exactly what a restart would restore. */
export function readPersistedFlintLayout(): FlintLayout {
  const initial = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(FLINT_LAYOUT_KEY) ?? '{}');
    for (const key of ['library', 'context'] as const) if (typeof saved?.[key] === 'boolean') initial[key] = saved[key];
    for (const [key, pane] of [['explorerWidth', 'library'], ['inspectorWidth', 'context']] as const) {
      if (typeof saved?.[key] === 'number' && Number.isFinite(saved[key])) initial[key] = clampPane(saved[key], pane);
    }
    if (saved?.density === 'reading') initial.density = 'reading';
  } catch { /* Storage restrictions do not prevent local presentation changes. */ }
  return initial;
}

/** Local presentation preferences only; never a document edit or history entry. */
export function createFlintLayout(persistent: boolean) {
  const initial = persistent ? readPersistedFlintLayout() : { ...defaults, context: true };
  const [layout, setLayout] = createStore(initial);
  const persist = () => { if (persistent) try { localStorage.setItem(FLINT_LAYOUT_KEY, JSON.stringify(layout)); } catch { /* Session-local preferences still work. */ } };
  function set<K extends keyof FlintLayout>(key: K, value: FlintLayout[K], save = true) {
    setLayout({ [key]: value } as Partial<FlintLayout>);
    if (save) persist();
  }
  return { layout, set, persist };
}

export function FlintPaneSplitter(props: {
  pane: 'library' | 'context'; controls: string; width: () => number;
  root: () => HTMLElement; resize: (width: number, save: boolean) => void;
}) {
  const bounds = paneBounds[props.pane], direction = props.pane === 'library' ? 1 : -1;
  let handle!: HTMLDivElement;
  let drag: { id: number; x: number; width: number; preference: number; scale: number } | undefined;
  const finish = (cancel: boolean) => {
    const active = drag; if (!active) return; drag = undefined;
    props.resize(cancel ? active.preference : props.width(), !cancel);
    if (handle.hasPointerCapture?.(active.id)) handle.releasePointerCapture(active.id);
  };
  onCleanup(() => finish(true));
  return <div ref={handle} class={`flint-pane-splitter flint-pane-splitter--${props.pane}`} role="separator" tabIndex={0} data-cross-text-controls
    aria-label={props.pane === 'library' ? 'Resize explorer' : 'Resize inspector'} aria-orientation="vertical" aria-controls={props.controls}
    aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={props.width()} aria-valuetext={`${props.width()} pixels`}
    title="Drag to resize. Arrow keys adjust; Home and End set limits."
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const root = props.root(), rect = root.getBoundingClientRect();
      const scale = rect.width > 0 ? root.clientWidth / rect.width : 1;
      const panel = root.ownerDocument.getElementById(props.controls);
      drag = { id: event.pointerId, x: event.clientX, width: (panel?.getBoundingClientRect().width ?? 0) * scale || props.width(), preference: props.width(), scale };
      handle.setPointerCapture?.(event.pointerId);
    }}
    onPointerMove={event => { if (drag?.id === event.pointerId) { event.stopPropagation(); props.resize(clampPane(drag.width + direction * (event.clientX - drag.x) * drag.scale, props.pane), false); } }}
    onPointerUp={event => { if (drag?.id === event.pointerId) { event.stopPropagation(); finish(false); } }}
    onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
    onKeyDown={event => {
      if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
      const step = event.shiftKey ? 40 : 10;
      const next = event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max
        : event.key === 'ArrowLeft' ? props.width() - direction * step : event.key === 'ArrowRight' ? props.width() + direction * step : undefined;
      if (next === undefined) return;
      event.preventDefault(); event.stopPropagation(); props.resize(clampPane(next, props.pane), true);
    }} />;
}
