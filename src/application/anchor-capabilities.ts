import { unwrap } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { FeatureScope } from "../runtime/features";
import type { AnchorCapabilities, AnchorFrame } from "../feature-api/anchors";
import { pageLayout } from "../rendering/page-layout";
import { PositionedBlockSurface } from "../rendering/positioned-block";

export function anchorCapabilities(editor: ReactiveEditor, scope: FeatureScope): AnchorCapabilities {
  return {
    node: key => editor.node(key), path: key => editor.blockQueries.ancestorPath(key),
    eligible: key => editor.blockSelection.eligible(key), revision: () => editor.repository.state.revision,
    register: contribution => { scope.own(editor.blockPresentation.register(contribution)); },
    surface: PositionedBlockSurface,
    commit(key, targetKey, offset) {
      if (!scope.active()) return;
      const source = editor.node(key), target = targetKey ? editor.node(targetKey) : undefined;
      if (!source || (targetKey && !target)) throw new Error("The Block no longer exists.");
      if (editor.blockQueries.ancestorPath(editor.focus.state.focusedKey ?? "").some(node => node.key === key) &&
          editor.mounts.get(editor.focus.state.focusedKey ?? "")?.composing) throw new Error("Finish composing before changing placement.");
      const focused = editor.focus.state.focusedKey;
      const handle = focused ? editor.mounts.get(focused) : undefined;
      const restore = focused && editor.blockQueries.contains(key, focused) && handle?.focusElement.contains(document.activeElement);
      const inline = restore ? handle?.captureInlineSelection?.() : undefined;
      const native = restore ? handle?.captureSelection?.() : undefined;
      editor.commands.transaction(target ? "Position Block relative to anchor" : "Detach Block from anchor", () => {
        const metadata = { ...unwrap((source.payload.metadata ?? {}) as Record<string, unknown>) };
        if (target) {
          const id = typeof target.payload.id === "string" && target.payload.id ? target.payload.id : crypto.randomUUID();
          if (target.payload.id !== id) editor.commands.setPayloadField(target.key, "id", id);
          metadata.anchor = { version: 1, blockId: id, offset: { ...offset } };
        } else delete metadata.anchor;
        editor.commands.setPayloadField(key, "metadata", metadata);
      });
      if (restore && focused) queueMicrotask(() => {
        if (!scope.active() || !editor.node(focused)) return;
        editor.focus.request(focused, { reason: "block-placement", reveal: false });
        const next = editor.mounts.get(focused);
        if (inline) next?.restoreInlineSelection?.(inline);
        if (native) next?.restoreSelection?.(native);
      });
    },
    watch(key, targetKey, documentKey, scale, apply) {
      let layout: ReturnType<typeof pageLayout> | undefined;
      let release: (() => void) | undefined;
      let disposed = false;
      let latest: AnchorFrame | undefined;
      const empty = (): AnchorFrame => ({ valid: false, visible: false, x: 0, y: 0, scale: scale(), width: 0, zIndex: 1, font: "", color: "" });
      const read = (fresh = false) => {
        const page = editor.mounts.get(documentKey)?.root;
        const target = editor.mounts.get(targetKey)?.root;
        if (!(page instanceof HTMLElement) || !(target instanceof HTMLElement) || !page.isConnected || !target.isConnected) { latest = empty(); return () => apply(latest!); }
        const rect = (element: Element) => {
          const measure = () => element === target ? editor.measurements.blockRect(targetKey)! : element.getBoundingClientRect();
          return fresh ? measure() : layout!.rect(element, measure);
        };
        const documentAnchor = targetKey === documentKey;
        const frame = page.closest<HTMLElement>(".reactive-window__content") ?? page.closest<HTMLElement>(".workspace-demo__document--flow") ?? page;
        const origin = rect(documentAnchor ? frame : target);
        let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
        let hidden = false, zIndex = 1;
        for (let parent: HTMLElement | null = documentAnchor ? frame : target; parent; parent = parent.parentElement) {
          const css = getComputedStyle(parent);
          hidden ||= !!parent.hidden || parent.getAttribute("aria-hidden") === "true" || css.display === "none" || css.visibility === "hidden";
          zIndex = Math.max(zIndex, Number.parseInt(css.zIndex) || 0);
          if (parent === frame || (parent !== target && /(auto|scroll|hidden|clip)/.test(css.overflow + css.overflowY + css.overflowX))) {
            const box = rect(parent);
            left = Math.max(left, box.left); top = Math.max(top, box.top);
            right = Math.min(right, box.right); bottom = Math.min(bottom, box.bottom);
          }
        }
        const parentKey = editor.blockQueries.ancestorPath(key).at(-2)?.key;
        const owner = parentKey && editor.mounts.get(parentKey)?.root;
        const widthRoot = owner instanceof HTMLElement ? owner.querySelector<HTMLElement>(":scope > .reactive-page__main") ?? owner : page;
        const style = getComputedStyle(widthRoot);
        const width = Math.max(1, widthRoot.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0));
        const value: AnchorFrame = {
          valid: !hidden && origin.width > 0 && origin.height > 0,
          visible: !hidden && right > left && bottom > top && origin.right > left && origin.left < right && origin.bottom > top && origin.top < bottom,
          x: origin.left, y: origin.top, scale: scale(), width, zIndex, font: style.font, color: style.color,
        };
        latest = value;
        return () => apply(value);
      };
      const connect = () => {
        if (disposed) return;
        const page = editor.mounts.get(documentKey)?.root;
        if (!layout && page instanceof HTMLElement) { const target = editor.mounts.get(targetKey)?.root;
          const layoutPage = target?.closest<HTMLElement>(".reactive-page") ?? page.querySelector<HTMLElement>(".reactive-page") ?? page;
          layout = pageLayout(layoutPage); release = layout.subscribe(read); read(true)(); }
        layout?.schedule();
      };
      const mounts = editor.mounts.subscribe(connect);
      const changes = editor.repository.subscribeChanges(connect);
      connect();
      queueMicrotask(connect);
      const dispose = scope.own(() => { disposed = true; mounts(); changes(); release?.(); });
      return { refresh: connect, current: () => { if (disposed) return; read(true)(); return latest; }, dispose };
    },
  };
}
