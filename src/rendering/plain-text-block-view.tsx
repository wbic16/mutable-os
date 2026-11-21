import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { ChildBlocks } from "./block-outlet";
import { blockAppearance } from "./appearance";

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, length));
}

export function PlainTextBlockView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const text = () => (node()?.payload.text as string | undefined) ?? "";
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLDivElement;
  let textarea!: HTMLTextAreaElement;
  let disposeMount: (() => void) | undefined;

  onMount(() => {
    disposeMount = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: textarea,
      inputPolicy: "native-text",
      focus: () => textarea.focus({ preventScroll: true }),
      captureSelection: () => ({
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
        direction: textarea.selectionDirection,
      }),
      restoreSelection: (selection) => {
        const length = textarea.value.length;
        textarea.setSelectionRange(
          clamp(selection.start, length),
          clamp(selection.end, length),
          selection.direction,
        );
      },
    });
  });
  onCleanup(() => disposeMount?.());

  createEffect(() => {
    const nextText = text();
    if (!textarea || textarea.value === nextText) return;
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection,
    };
    textarea.value = nextText;
    textarea.setSelectionRange(
      clamp(selection.start, nextText.length),
      clamp(selection.end, nextText.length),
      selection.direction,
    );
  });

  return (
    <div
      ref={root}
      class={`abstract-block reactive-plain-text-block ${appearance().classes.join(" ")}`}
      style={appearance().style}
      classList={{ "reactive-block--focused": editor.focus.state.focusedKey === props.nodeKey }}
      data-block-id={(node()?.payload.id as string | undefined) ?? ""}
      data-client-id={props.nodeKey}
      data-runtime-key={props.nodeKey}
      data-block-type="plain-text-block"
    >
      <textarea
        ref={textarea}
        data-input-part="plain-text"
        readOnly={!editor.canEditText(props.nodeKey)}
        value={text()}
        aria-label={(node()?.payload.metadata as Record<string, unknown> | undefined)?.label as string ?? "Plain text Block"}
      />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}
