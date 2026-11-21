import { useReactiveView } from '../reactive-editor/context';
import { taskState, toggleTask } from '../runtime/tasks';
import { Show, createMemo } from 'solid-js';
import { listItemChildren, setListItemCollapsed } from '../runtime/text-lists';

export function StandaloneTaskDisclosure(props: { nodeKey: string }) {
  const { editor, projection, passive } = useReactiveView();
  const lists = createMemo(() => listItemChildren(projection, props.nodeKey));
  const collapsed = () => !!(projection.state.nodes[props.nodeKey]?.payload.metadata as any)?.listCollapsed;
  return <Show when={projection.parentOf(props.nodeKey)?.viewType !== 'indented-list-block' && lists().length}>
    <button disabled={passive || !editor.canEditText(props.nodeKey)} class="reactive-task-disclosure" data-native-context-menu type="button" aria-label={collapsed() ? 'Expand child list' : 'Collapse child list'}
      aria-expanded={!collapsed()} aria-controls={lists().map(k => `list-${k}`).join(' ')}
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onClick={e => {
        e.stopPropagation();
        if(passive||!editor.canEditText(props.nodeKey))return;
        if (!collapsed()) {
          let focused = editor.node(editor.focus.state.focusedKey!);
          while (focused && focused.key !== props.nodeKey) {
            if (lists().includes(focused.key)) {
              const item = editor.node(props.nodeKey)!;
              const target = item.viewType === 'standoff-editor-block' ? item : item.children.map(k => editor.node(k)).find(n => n?.viewType === 'standoff-editor-block');
              if (target) editor.focus.request(target.key, { reason: 'collapse-task', caret: 'end' });
              break;
            }
            focused = projection.parentOf(focused.key);
          }
        }
        setListItemCollapsed(editor, props.nodeKey, !collapsed());
      }}>{collapsed() ? '▸' : '▾'}</button>
  </Show>;
}

export function TaskControl(props: { nodeKey: string }) {
  const { editor, projection, passive } = useReactiveView();
  return <input disabled={passive || !editor.canEditText(props.nodeKey)} class="reactive-task-checkbox" type="checkbox" data-native-context-menu
    aria-label="Task completion" checked={taskState(projection.state.nodes[props.nodeKey]) === true}
    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
    onClick={e => e.stopPropagation()}
    onKeyDown={e => e.stopPropagation()}
    onChange={e => { e.stopPropagation(); if(!passive)toggleTask(editor, props.nodeKey); e.currentTarget.checked=taskState(projection.state.nodes[props.nodeKey])===true; }} />;
}
