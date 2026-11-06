import { onCleanup, onMount } from 'solid-js';
import type { BlockViewProps } from '../block-tree/types';
import { useReactiveView } from '../reactive-editor/context';
import { ContainerBlockView } from './container-block-view';
import { codeLanguage, StandoffCodeSyntax } from '../runtime/standoff-code';
import './standoff-code.css';

export function StandoffCodeView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const language = () => codeLanguage(projection.state.nodes[props.nodeKey]?.payload.metadata);
  let syntax: StandoffCodeSyntax | undefined;
  onMount(() => { if (editor.features.standoffCodeHighlighting && editor.features.standoffPropertyRendering) syntax = new StandoffCodeSyntax(editor, props.nodeKey); });
  onCleanup(() => syntax?.dispose());
  return <div class="standoff-code">
    <label class="standoff-code__language">Language <select aria-label="Code language" value={language()} onChange={event => {
      const node = editor.node(props.nodeKey)!;
      const metadata = JSON.parse(JSON.stringify(node.payload.metadata ?? {}));
      editor.commands.setPayloadField(props.nodeKey, 'metadata', { ...metadata, markdownCode: { ...metadata.markdownCode, language: event.currentTarget.value } }, 'Change code language');
    }}>
      <option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="markdown">Markdown</option><option value="plain">Plain text</option>
      {!['javascript', 'typescript', 'markdown', 'plain'].includes(language()) && <option value={language()}>{language()}</option>}
    </select></label>
    <ContainerBlockView nodeKey={props.nodeKey} class="standoff-code__body" />
  </div>;
}
