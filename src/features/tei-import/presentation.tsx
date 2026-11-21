import { For, Show, createSignal, onCleanup } from 'solid-js';
import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { RetainedDocumentSession } from '../../application/document-sessions';
import type { GlossEntry, GlossOccurrence, GlossSessionIndex } from '../gloss/session-index';
import { milestoneIndex, navigateAnnotation } from './navigation';
import './presentation.css';

/** Small source facts, displayed inertly; no source-file or authority fetch. */
export function TeiSourceFacts(props: { source?: Record<string, any> }) {
  return <Show when={props.source}>{source => <details class="tei-source-facts"><summary>Imported source details</summary>
    <Show when={source().sourceId}><p>Source ID: {source().sourceId}</p></Show>
    <For each={Object.entries(source().fields ?? {})}>{([key, value]) => <div>{key}: {String(value)}</div>}</For>
    <For each={source().references ?? []}>{ref => <div>{ref.attribute}: <For each={ref.tokens}>{token => <span>{token.raw} ({token.state}) </span>}</For></div>}</For>
  </details>}</Show>;
}

export function TeiMilestones(props: { editor: ReactiveEditor; session: RetainedDocumentSession }) {
  const index = milestoneIndex(props.editor, props.session.projection, props.session.rootKey);
  const [message, setMessage] = createSignal(''); let alive = true, epoch = 0;
  (props.session.element as any).teiMilestoneIndex = index;
  onCleanup(() => { alive = false; index.dispose(); delete (props.session.element as any).teiMilestoneIndex; });
  const navigate = async (anchor: GlossOccurrence) => {
    const ticket = ++epoch;
    const ok = await navigateAnnotation(index, anchor, () => alive && epoch === ticket && props.session.current());
    if (alive && ticket === epoch) setMessage(ok ? '' : 'This milestone location is no longer available.');
  };
  return <details class="tei-milestones"><summary>TEI milestones ({index.rows[0]().length})</summary>
    <ol><For each={index.rows[0]()}>{entry => <li>
      <strong>{entry.data().type} {entry.data().body}</strong>
      <For each={entry.occurrences()}>{(anchor, i) => <button type="button" onClick={() => void navigate(anchor)}>Go to {i() + 1}</button>}</For>
      <Show when={!entry.occurrences().length}><span> Location removed</span></Show>
      <TeiSourceFacts source={entry.data().source}/>
    </li>}</For></ol><Show when={message()}><p role="status">{message()}</p></Show>
  </details>;
}

/** Extends the existing Gloss inventory; these are source-defined local
 * identities, not external canonical Entity bindings. */
export function TeiDefinitionDetails(props: { entry: GlossEntry; index: GlossSessionIndex; navigate: (entry: GlossEntry, occurrence?: GlossOccurrence) => unknown }) {
  const definitions = () => props.entry.occurrences().filter(o => o.role === 'tei/definition');
  const mentions = () => props.entry.occurrences().filter(o => o.role === 'tei/mention');
  return <Show when={props.entry.data().source?.type === 'tei/entity'}><section class="tei-definition-details" aria-label="TEI local definition">
    <p>Local {props.entry.data().source?.kind} definition</p>
    <Show when={props.entry.occurrences().some(o => !o.role)}><p>Some older occurrences have no recorded definition/mention role. Use Passage to visit them.</p></Show>
    <For each={definitions()}>{(anchor, i) => <button type="button" onClick={() => props.navigate(props.entry, anchor)}>Source definition {i() + 1}</button>}</For>
    <TeiSourceFacts source={props.entry.data().source}/>
    <details><summary>Explicit mentions ({mentions().length})</summary><For each={mentions()}>{(anchor, i) => <button type="button" onClick={() => props.navigate(props.entry, anchor)}>Mention {i() + 1}</button>}</For></details>
  </section></Show>;
}
