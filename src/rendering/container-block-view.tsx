import { Show, createMemo, onCleanup, onMount } from "solid-js";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { ChildBlocks, RelationBlocks } from "./block-outlet";
import { blockAppearance } from "./appearance";

export function ContainerBlockView(props: BlockViewProps & { class?: string; contentClass?: string }) {
  const { editor, projection, passive } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLDivElement;
  let disposeMount: (() => void) | undefined;

  onMount(() => {
    disposeMount = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: root,
      inputPolicy: passive ? "opaque-widget" : "container",
      focus: () => root.focus({ preventScroll: true }),
    });
  });
  onCleanup(() => disposeMount?.());

  return (
    <section
      ref={root}
      class={`abstract-block reactive-container-block ${appearance().classes.join(" ")} ${props.class ?? ""}`}
      style={appearance().style}
      tabIndex={-1}
      data-block-id={(node()?.payload.id as string | undefined) ?? ""}
      data-client-id={props.nodeKey}
      data-runtime-key={props.nodeKey}
      data-block-type={(node()?.payload.type as string | undefined) ?? node()?.viewType}
    >
      <RelationBlocks parentKey={props.nodeKey} />
      <Show when={props.contentClass} fallback={<ChildBlocks parentKey={props.nodeKey} />}><div class={props.contentClass}><ChildBlocks parentKey={props.nodeKey} /></div></Show>
    </section>
  );
}
