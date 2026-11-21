import { For, Show, createMemo, onCleanup } from 'solid-js';
import { useReactiveView } from '../reactive-editor/context';
import type { InlineAlternativeProperties } from '../block-tree/inline-alternative';
import { focusInlineReading, showInlineReading, selectedReading } from '../runtime/inline-alternatives';
import { InlineReadingLayout } from './inline-alternative-context';
import { StandoffEditorView } from './standoff-editor-view';
import './inline-alternative.css';

export function InlineAlternativeView(props: { hostKey: string; cellKey: string; invalidate(): void }) {
  const { editor, projection } = useReactiveView();
  const host = () => projection.node(props.hostKey)!;
  const slot = () => projection.node(props.cellKey)?.payload as InlineAlternativeProperties | undefined;
  const name = createMemo(() => slot() && selectedReading(editor, host(), slot()!));
  const key = createMemo(() => name() && host()?.ownedRelations[name()!]);
  let alive = true; onCleanup(() => { alive = false; props.invalidate(); });
  const select = (name: string) => {
    const target = host().ownedRelations[name];
    showInlineReading(editor, host(), slot()!, target);
    props.invalidate();
    queueMicrotask(() => { if (!alive || key() !== target) return; const remembered = editor.mounts.inlineSelection(target); focusInlineReading(editor, target, remembered?.head ?? 0); });
  };
  return <span class="native-inline-alternative" data-native-inline-alternative={slot()?.id}>
    <select class="native-inline-alternative__selector" data-cross-text-controls data-native-context-menu aria-label="Alternative reading" title="Choose reading" value={name()} onChange={e => select(e.currentTarget.value)}>
      <For each={slot()?.readings ?? []}>{(name, i) => <option value={name}>{String((projection.node(host().ownedRelations[name])?.payload.metadata as any)?.name ?? `Reading ${i() + 1}`)}</option>}</For>
    </select>
    <InlineReadingLayout.Provider value={props.invalidate}><Show when={key()} keyed>{key => <StandoffEditorView nodeKey={key} inline/>}</Show></InlineReadingLayout.Provider>
  </span>;
}
