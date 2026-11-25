import { onCleanup } from 'solid-js';
import type { VisualEffectRegistry } from '../runtime/visual-effect-registry';

let nextScope = 0;
/** Uses selectors over existing cell children. Never wraps/reparents editable
 * nodes, reads geometry, or touches annotation-owned classes/styles/SVGs. */
export function registerFocusFade(registry: VisualEffectRegistry) {
  return registry.registerRenderer({
    name: 'fade-outside-focus', target: 'text-presentation', focusKinds: ['block', 'text'],
    defaults: { opacity: .35, blur: 0, scope: 'viewport' },
    validate(params) {
      if (typeof params.opacity !== 'number' || !Number.isFinite(params.opacity) || params.opacity < 0 || params.opacity > 1) throw Error('Focus opacity must be between 0 and 1');
      if (params.blur !== 0 || params.scope !== 'viewport') throw Error('Focus fade currently supports viewport opacity only');
    },
    create({ document, params }) {
      const id = `focus-${++nextScope}`, style = document.createElement('style');
      style.dataset.caretEffect = id;
      document.head.append(style);
      const attached = new Set<HTMLElement>();
      let focused: HTMLElement | undefined;
      const base = `[data-caret-scope="${id}"]`;
      // Whole unfocused text flows can compose opacity once. Only the focused
      // sentence's surrounding cells need individual opacity. Controls/SVGs are
      // siblings of the flow and the native caret lives in the excluded flow.
      const unfocused = `${base}:not([data-caret-focus="${id}"])`;
      onCleanup(() => {
        focused?.removeAttribute('data-caret-focus');
        for (const flow of attached) flow.removeAttribute('data-caret-scope');
        attached.clear(); style.remove();
      });
      return {
        attach(flow) {
          attached.add(flow); flow.setAttribute('data-caret-scope', id);
          return () => { attached.delete(flow); if (flow.dataset.caretScope === id) flow.removeAttribute('data-caret-scope'); };
        },
        focus(flow, region) {
          if (focused !== flow) {
            focused?.removeAttribute('data-caret-focus'); focused = flow;
            focused?.setAttribute('data-caret-focus', id);
          }
          let css = '';
          if (region && region.kind !== 'geometry') {
            const outside = region.kind === 'text' ? `, ${base}[data-caret-focus="${id}"] > :is([data-inline-key],[data-provisional-cell],[data-inline-index]):not(:nth-child(n+${region.start + 1}):nth-child(-n+${region.end}))` : '';
            css = `${unfocused}${outside} { opacity: ${params.opacity}; }`;
          }
          if (style.textContent !== css) style.textContent = css;
        },
      };
    },
  });
}
