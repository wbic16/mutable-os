import { passiveLimitation } from '../runtime/passive-presentation';
import { Dynamic } from "solid-js/web";
import { For, Show, onCleanup, onMount, getOwner, createMemo, mapArray } from "solid-js";
import { eligibleTextFlow, plainTextItem, VirtualTextFlow } from './virtual-text-flow';
import type { NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { UnknownBlockView } from "./unknown-block-view";
import { BlockSelectionHandle } from "./block-selection";
import { marginSide, useDocumentMargins } from "./document-margins";

export function BlockOutlet(props: { nodeKey: NodeKey }) {
  const { retainedBlocks } = useReactiveView();
  if (!retainedBlocks) return <BlockContents nodeKey={props.nodeKey} />;
  const key = props.nodeKey, owner = getOwner();
  let slot!: HTMLDivElement;
  onMount(() => {
    const release = retainedBlocks.attach(key, slot, owner, () => <BlockContents nodeKey={key} />);
    onCleanup(release);
  });
  return <div ref={slot} style={{ display: 'contents' }} data-block-slot={key} />;
}

function BlockContents(props: { nodeKey: NodeKey }) {
  const { editor, projection, coordinates, passive, openSource } = useReactiveView();
  const registration = () => {
    const type = projection.state.nodes[props.nodeKey]?.viewType ?? "unknown-block";
    return editor.registry.resolve(type);
  };
  const limitation=()=>{
    const node=projection.state.nodes[props.nodeKey];if(!passive||!node)return;
    if(node.viewType==='surface-block'&&!editor.features.reversibleBlocks)return 'Legacy flip authoring is unavailable here. Open source.';
    if(node.viewType==='resource-information-block'&&!editor.surfaces.nearest(props.nodeKey))return 'Detached resource information must be opened at source.';
    return passiveLimitation(node)??(!registration()?.capabilities.includes('native-passive')?'This native view has not opted into passive presentation.':undefined);
  };
  const render = () => <Show when={!limitation()} fallback={<aside class="native-passive-unavailable" role="status"><strong>{projection.state.nodes[props.nodeKey]?.viewType}</strong><p>{limitation()}</p><button onClick={openSource}>Open source</button></aside>}><><Dynamic component={registration()?.view ?? UnknownBlockView} nodeKey={props.nodeKey} /><Show when={!passive}><BlockSelectionHandle editor={editor} nodeKey={props.nodeKey} /></Show></></Show>;
  return <Show when={passive || !editor.viewVisibility.isClosed(projection.state.nodes[props.nodeKey]?.placementKey ?? props.nodeKey)}><Show when={!passive && editor.blockPresentation.current()} fallback={render()}>{contribution =>
    <Dynamic component={contribution().view} nodeKey={props.nodeKey} scale={() => coordinates?.scale() ?? 1} render={render} />
  }</Show></Show>;
}

export function ChildBlocks(props: { parentKey: NodeKey }) {
  const context = useReactiveView(), { projection } = context;
  const children = () => projection.state.nodes[props.parentKey]?.children ?? [];
  const structural = createMemo(() => eligibleTextFlow(props.parentKey, children(), context));
  const textItems = mapArray(() => structural() ? children() : [], key => createMemo(() => plainTextItem(key, context)));
  const virtual = createMemo(() => structural() && textItems().every(eligible => eligible()));
  return <Show when={virtual()} fallback={<For each={children()}>{(key) => <BlockOutlet nodeKey={key} />}</For>}>
    <VirtualTextFlow parentKey={props.parentKey} keys={children()} />
  </Show>;
}

export function RelationBlocks(props: { parentKey: NodeKey }) {
  const { projection } = useReactiveView();
  const relations = () =>
    Object.entries(projection.state.nodes[props.parentKey]?.ownedRelations ?? {})
      .filter(([name]) => !name.startsWith("superposition:") && !name.startsWith("inline-reading:"));
  return (
    <For each={relations()}>
      {([name, key]) => <RelationBlock ownerKey={props.parentKey} name={name} nodeKey={key} />}
    </For>
  );
}

function RelationBlock(props: { ownerKey: NodeKey; name: string; nodeKey: NodeKey }) {
  const margins = useDocumentMargins();
  const side = marginSide(props.name);
  let unregister: (() => void) | undefined;
  onMount(() => {
    if (margins && side) unregister = margins.register({ ownerKey: props.ownerKey, relationKey: props.nodeKey, side, name: props.name });
  });
  onCleanup(() => unregister?.());
  const movedToDrawer = () => Boolean(side && margins?.collapsed() && margins.drawerOpen());
  return <Show when={!movedToDrawer()}>
    <aside class={`reactive-relation reactive-relation--${props.name}`} data-relation-name={props.name}>
      <BlockOutlet nodeKey={props.nodeKey} />
    </aside>
  </Show>;
}
