import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { useManagedWindowOwner } from './window-manager';

export type AnnotationBarPolicy = 'auto' | 'expanded' | 'compact' | 'hidden';
export type AnnotationBarState = Exclude<AnnotationBarPolicy, 'auto'>;
export const ANNOTATION_BAR_KEY = 'mutable.ink.annotation-bar.v1';
const changed = 'mutable:annotation-bar-policy';
export const annotationBarPolicies: AnnotationBarPolicy[] = ['auto', 'expanded', 'compact', 'hidden'];
export function validAnnotationBarPolicy(value: unknown): value is AnnotationBarPolicy {
  return annotationBarPolicies.includes(value as AnnotationBarPolicy);
}
function readPolicy(): AnnotationBarPolicy | undefined {
  try { const value = localStorage.getItem(ANNOTATION_BAR_KEY); return validAnnotationBarPolicy(value) ? value : undefined; }
  catch { return undefined; }
}
/** The live policy value (persisted choice, else the product
 *  default). The settings-bundle capture reads through this. */
export function readAnnotationBarPolicy(): AnnotationBarPolicy {
  return readPolicy() ?? 'auto';
}
/** Same local UI-preference convention as Flint's compact layout. No Document data. */
export function createAnnotationBarPreference(defaultPolicy: () => AnnotationBarPolicy = () => 'auto') {
  const [savedPolicy, update] = createSignal(readPolicy());
  const policy = createMemo(() => savedPolicy() ?? defaultPolicy());
  const receive = (event: Event) => {
    if (event instanceof StorageEvent) { if (event.key === ANNOTATION_BAR_KEY || event.key === null) update(readPolicy()); }
    else { const value = (event as CustomEvent).detail; if (validAnnotationBarPolicy(value)) update(value); }
  };
  window.addEventListener(changed, receive); window.addEventListener('storage', receive);
  onCleanup(() => { window.removeEventListener(changed, receive); window.removeEventListener('storage', receive); });
  return { policy, set(value: AnnotationBarPolicy) {
    if (!validAnnotationBarPolicy(value)) return;
    update(value);
    try { localStorage.setItem(ANNOTATION_BAR_KEY, value); } catch { /* Keep the session preference usable. */ }
    window.dispatchEvent(new CustomEvent(changed, { detail: value }));
  } };
}
// Full controls wrap into practical rows at 960 CSS px. Keep 80px of hysteresis.
export function annotationBarSpacious(width: number, previous: boolean): boolean {
  return width >= (previous ? 880 : 960);
}
export function resolveAnnotationBar(policy: AnnotationBarPolicy, context: { fullscreen: boolean; maximized: boolean; spacious: boolean }): AnnotationBarState {
  if (policy !== 'auto') return policy;
  return context.fullscreen || context.maximized && context.spacious ? 'expanded' : 'compact';
}

/** Observe only the bar's container and presentation ancestors, never editor cells. */
export function createAnnotationBarPresentation(root: () => HTMLElement) {
  const [context, setContext] = createSignal({ fullscreen: false, maximized: false, spacious: false, flint: false });
  // An absent preference follows the host; an explicit Auto/manual choice remains shared.
  const preference = createAnnotationBarPreference(() => context().flint && !context().fullscreen ? 'compact' : 'auto'), owner = useManagedWindowOwner();
  let refresh = () => {};
  createEffect(() => { if (owner) { owner.windowId; } untrack(refresh); });
  onMount(() => {
    const bar = root(); let width = bar.clientWidth, spacious = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let chrome: HTMLElement | null = null;
    let chromeHeight = 0;
    const chromeSize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(entries => {
      chromeHeight = entries[0]?.borderBoxSize?.[0]?.blockSize ?? chrome?.offsetHeight ?? 0;
      bar.style.setProperty("--annotation-bar-top", `${chromeHeight}px`);
    });
    const ancestors = new MutationObserver(() => update());
    let lineage: Element[] = [];
    const update = () => {
      const next: Element[] = []; for (let el = bar.parentElement; el; el = el.parentElement) next.push(el);
      if (next.length !== lineage.length || next.some((el, i) => el !== lineage[i])) {
        ancestors.disconnect(); lineage = next;
        for (const el of lineage) ancestors.observe(el, { attributes: true, attributeFilter: ['class'] });
      }
      const scrollport = bar.closest('.reactive-window__content');
      const body = scrollport && [...scrollport.children].find(el => el.classList.contains('reactive-window__document-body'));
      const nextChrome = (body && [...body.children].find(el => el.classList.contains('detached-document-toolbar')) as HTMLElement) || null;
      if (nextChrome !== chrome) {
        chromeSize?.disconnect(); chrome = nextChrome;
        chromeHeight = chrome?.offsetHeight ?? 0;
        if (chrome) chromeSize?.observe(chrome);
        bar.style.setProperty('--annotation-bar-top', `${chromeHeight}px`);
      }
      const frame = bar.closest('.reactive-window, .workspace-demo__window');
      // A maximised Flint shell still contains ordinary Document tabs.
      const flint = !!bar.closest('.flint-application');
      const maximized = !flint && !!frame?.matches('.reactive-window--maximized, .workspace-demo__window--maximized');
      const fullscreen = !!document.fullscreenElement?.contains(bar);
      setContext({ fullscreen, maximized, spacious, flint });
    };
    refresh = update;
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(entries => {
      const entry = entries.at(-1);
      const nextWidth = entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? width;
      // Ignore height-only notifications and zero widths of retained hidden tabs.
      if (nextWidth <= 0 || nextWidth === width) return;
      width = nextWidth;
      clearTimeout(timer);
      timer = setTimeout(() => { spacious = annotationBarSpacious(width, spacious); update(); }, 120);
    });
    resize?.observe(bar); spacious = annotationBarSpacious(width, false); update();
    document.addEventListener('fullscreenchange', update);
    onCleanup(() => { refresh = () => {}; resize?.disconnect(); chromeSize?.disconnect(); ancestors.disconnect(); clearTimeout(timer); document.removeEventListener('fullscreenchange', update); });
  });
  return { ...preference,
    state: createMemo(() => resolveAnnotationBar(preference.policy(), context())),
    reveal() { preference.set('compact'); },
  };
}
