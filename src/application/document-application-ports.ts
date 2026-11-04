import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { DocumentApplicationInstance } from '../feature-api/document-application';
import type { RetainedDocumentSession } from './document-sessions';
import type { SavePrompt } from './document-save';

/** Runtime presentation ports, not new application instances or canonical state. */
export interface DocumentApplicationPort {
  key: string;
  application: DocumentApplicationInstance;
  windowId(): string | undefined;
  tabs(): readonly { key: string; title: string; documentId?: string; dirty: boolean }[];
  activeTab(): string | undefined;
  selectTab(key: string): void;
  session(): RetainedDocumentSession | undefined;
  presented(value: boolean): void;
  prompt(): SavePrompt | undefined;
  saveAs?():Promise<unknown>;
}
const registries = new WeakMap<ReactiveEditor, ReturnType<typeof createRegistry>>();
function createRegistry() {
  const [ports, setPorts] = createSignal<readonly DocumentApplicationPort[]>([]);
  return { ports, register(port: DocumentApplicationPort) {
    setPorts(list => [...list, port]);
    return () => setPorts(list => list.filter(p => p !== port));
  } };
}
export function documentApplicationPorts(editor: ReactiveEditor) {
  let registry = registries.get(editor);
  if (!registry) { registry = createRegistry(); registries.set(editor, registry); }
  return registry;
}
