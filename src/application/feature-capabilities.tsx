import { Show, createComponent, getOwner, onCleanup, runWithOwner } from "solid-js";
import { useReactiveView } from "../reactive-editor/context";
import { openBlockContextMenu } from "../runtime/open-block-context-menu";
import type { BlockMenuItem } from "../runtime/block-menu-types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { BlockFeatureCapabilities, BlockRuntime, FeatureScope } from "../feature-api";

// Traverse the requested field through Solid proxies so nested payload updates
// remain reactive. Never return the mutable canonical object to a feature.
function detached(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(detached);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, detached(item)]));
  return value;
}

/** Transitional application adapter. Features never receive the captured editor. */
export function blockFeatureCapabilities(editor: ReactiveEditor, scope: FeatureScope): BlockFeatureCapabilities {
  const requireActive = () => { if (!scope.active()) throw new Error(`Feature ${scope.owner} is disposed`); };
  const requireOwned = (key: string) => {
    requireActive();
    const node = editor.node(key);
    if (!node || editor.registry.owner(node.viewType) !== scope.owner) throw new Error(`Feature ${scope.owner} cannot mutate an unowned Block`);
  };
  // Called inside each mounted view's Solid owner, never at type registration.
  const instanceRuntime = (key: string): BlockRuntime => {
    const owner = getOwner();
    const { coordinates } = useReactiveView();
    let widget: HTMLElement | undefined;
    if (!owner) throw new Error("Block applications require a mounted Solid owner");
    let mounted = true;
    onCleanup(() => { mounted = false; });
    const requireInstance = () => {
      if (!mounted) throw new Error(`Block instance ${key} is disposed`);
      requireOwned(key);
    };
    const runtime: BlockRuntime = {
      nodeKey: key,
      authoredStateProtected: () => !editor.canEditText(key),
      scale: () => coordinates?.scale() ?? 1,
      contextMenuOpen: () => mounted && editor.overlays.overlays.some(item => item.ownerKey === key && item.viewType === "context-menu"),
      openContextMenu(point) {
        requireInstance();
        const handle = editor.mounts.get(key);
        if (!widget || handle?.root !== widget || !handle.contextActions) return;
        openBlockContextMenu(editor.overlays, key, widget, point);
      },
      field(name) { return detached(editor.node(key)?.payload[name]); },
      setField(name, value, label) { requireInstance(); editor.commands.setPayloadField(key, name, value, label); },
      removeAndFocusFallback() {
        requireInstance();
        const fallback = editor.focusFallback(key);
        editor.focus.clearRemoved(key); editor.commands.remove(key);
        if (fallback) scope.defer(() => editor.focus.request(fallback, { reason: "feature-remove", caret: "start" }));
      },
      own(dispose) {
        requireInstance();
        let live = true;
        const release = () => { if (!live) return; live = false; dispose(); };
        runWithOwner(owner, () => onCleanup(release));
        return release;
      },
      mountWidget(element, options) {
        requireInstance(); widget = element;
        let live = true;
        const valid = () => { requireInstance(); if (!live || editor.mounts.get(key)?.root !== element) throw new Error("Widget mount is disposed"); };
        const guard = (items: BlockMenuItem[]): BlockMenuItem[] => items.map(item => ({ ...item,
          ...(item.run ? { run: () => { valid(); return item.run!(); } } : {}),
          ...(item.input ? { input: { ...item.input, submit(value: string) { valid(); item.input!.submit(value); } } } : {}),
          ...(item.children ? { children: guard(item.children) } : {}),
        }));
        const release = editor.mounts.register(key, { root: element, focusElement: element, inputPolicy: "opaque-widget", focus: () => element.focus({ preventScroll: true }),
          ...(options ? { contextActions: () => { valid(); return guard(options.contextActions()); } } : {}),
        });
        return runtime.own(() => {
          live = false;
          for (const overlay of [...editor.overlays.overlays]) if (overlay.ownerKey === key && overlay.viewType === "context-menu") editor.overlays.close(overlay.key, false);
          release(); if (widget === element) widget = undefined;
        });
      },
    };
    return runtime;
  };
  return {
    register: {
      block(definition) {
        requireActive();
        const Instance = (props: { nodeKey: string }) => createComponent(definition.view, { runtime: instanceRuntime(props.nodeKey) });
        scope.own(editor.registry.register({ ...definition, view: props => <Show when={scope.active()}><Instance nodeKey={props.nodeKey} /></Show> }, scope.owner));
      },
      command(definition) { requireActive(); scope.own(editor.commandRegistry.register(definition, scope.owner)); },
      binding(definition) { requireActive(); scope.own(editor.bindings.register(definition, scope.owner)); },
      action(definition) { requireActive(); scope.own(editor.featureActions.register(definition, scope.owner)); },
    },
    blocks: {
      get(key) {
        const node = editor.node(key);
        return node && { key: node.key, viewId: node.viewId, type: node.viewType, children: [...node.children], isRoot: editor.projections.get(node.viewId)?.state.rootKey === key };
      },
      insert(dto, destination) {
        requireActive();
        if (!dto.type || editor.registry.owner(dto.type) !== scope.owner) throw new Error(`Feature ${scope.owner} cannot insert an unowned Block type`);
        return editor.commands.insert(dto, destination);
      },
      focusPlacement(placement, view) { scope.defer(() => { const node = editor.nodeForPlacementInView(placement, view); if (node) editor.focus.request(node.key, { reason: "feature-create" }); }); },
      bounds(key) { const rect = editor.mounts.get(key)?.root.getBoundingClientRect(); return rect && { left: rect.left, top: rect.top }; },
    },
  };
}
