import {GlossPresentation} from '../features/gloss/presentation';
import { createEffect, onCleanup, untrack, type JSX } from "solid-js";
import { insert } from "solid-js/web";
import { ReactiveViewProvider, useReactiveView } from "../reactive-editor/context";
import { DocumentSessionWindowOwner, useManagedWindowOwner } from "./window-manager";
import type { RetainedDocumentSession } from "../application/document-sessions";
import { BlockOutlet } from "./block-outlet";
import { DocumentSessionContext } from "./document-session-context";

/** A slot mounts once. Its generation cannot dispose a session moved elsewhere. */
export function RetainedDocumentHost(props: {
  ownerKey: string; slotKey: string; placement: string; selected: boolean;
  sharedRoot?: string; render(session: RetainedDocumentSession): JSX.Element;
}) {
  const context = useReactiveView(), owner = useManagedWindowOwner(), store = context.editor.documentSessions!;
  const slot = document.createElement("div"); slot.style.display = "contents";
  const lease = store.transfers.register({ kind: props.sharedRoot ? "managed-document" : "flint-tab",
    ownerKey: props.ownerKey, slotKey: props.slotKey, windowId: owner?.windowId ?? props.ownerKey,
    container: slot, get scrollport() {
      // The retained content is Flint's scroller; its annotation bar is a fixed
      // sibling. Resolve lazily because a returning slot is initially empty.
      const content = slot.closest('.flint-compact') && slot.querySelector<HTMLElement>(
        ':scope > .retained-document-session > .reactive-document-occurrence > .reactive-document-occurrence__content');
      return content || slot.querySelector<HTMLElement>('[data-gloss-scrollport]') || slot.closest<HTMLElement>('[role="tabpanel"],.reactive-window__content') || slot;
    },
    coordinates: context.coordinates!, selected: () => props.selected });
  let session!: RetainedDocumentSession;
  try { session = store.mount({
    ownerKey: props.ownerKey, slotKey: props.slotKey, placement: props.placement,
    windowId: owner?.windowId ?? props.ownerKey, coordinates: context.coordinates!,
    ...(props.sharedRoot ? { shared: { projection: context.projection, rootKey: props.sharedRoot } } : {}),
  }, session => {
    createEffect(() => {
      const port = session.host.port;
      const window = owner?.manager.registry.windows[session.host.windowId];
      const selected = port ? port.selected() : props.selected;
      const activity = port?.activity?.();
      const visible = !session.host.suspended() && selected && (activity ? activity.visible : !owner || !!window?.visible);
      untrack(() => session.host.update(visible, visible && (activity ? activity.active : !owner || !!window?.active)));
    });
    insert(session.element, () => <DocumentSessionContext.Provider value={session}>
      <DocumentSessionWindowOwner session={session} manager={owner?.manager}>
      <ReactiveViewProvider editor={context.editor} projection={session.projection}
        coordinates={session.host.coordinates} windowGeometry={context.windowGeometry} activity={session.host.activity}>
        <GlossPresentation editor={context.editor} session={session}>{props.render(session)}</GlossPresentation>
      </ReactiveViewProvider>
      </DocumentSessionWindowOwner>
    </DocumentSessionContext.Provider>);
  });
  store.transfers.attachInitial(session, lease);
  } catch (error) { lease.release(); if (session) store.release(session); throw error; }
  onCleanup(() => lease.release());
  return slot;
}

/** First-mount shared-projection island; does not adopt existing live editors. */
export function RetainedInkDocument(props: { nodeKey: string; windowKey: string }) {
  const { projection } = useReactiveView();
  return <RetainedDocumentHost ownerKey={props.windowKey} slotKey={props.nodeKey}
    placement={projection.state.nodes[props.nodeKey].placementKey} sharedRoot={props.nodeKey} selected={true}
    render={() => <BlockOutlet nodeKey={props.nodeKey} />} />;
}
