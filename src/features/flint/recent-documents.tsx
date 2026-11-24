import { For, Show, createMemo, createSignal } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';

export function RecentDocuments(props: { recent: NonNullable<DocumentApplicationInstance['recentDocuments']> }) {
  const [busy, setBusy] = createSignal(false), [error, setError] = createSignal('');
  // Catalog refreshes supply new objects. Keep buttons keyed by document identity
  // so a refresh cannot detach the pressed/focused button before its click arrives.
  const documents = createMemo(() => new Map(props.recent.items().map(doc => [doc.id, doc])));
  const ids = createMemo(() => [...documents().keys()]);
  const open = async (id: string) => {
    if (busy()) return;
    setBusy(true); setError('');
    try { await props.recent.open(id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const remove = (id: string) => {
    if (busy()) return;
    setError('');
    try { props.recent.remove(id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return <details class="flint-recent-documents" open>
    <summary>Recently opened documents</summary>
    <Show when={ids().length} fallback={<p class="flint-hint">Documents you open will appear here.</p>}>
      <ol><For each={ids()}>{id => {
        const doc = () => documents().get(id)!;
        return <li><button type="button" class="flint-open-document" disabled={busy()} aria-label={`Reopen ${doc().title}`}
        title={doc().location ? `${doc().location!.folder}/${doc().location!.filename}` : doc().title} onClick={() => void open(id)}>
        <span>{doc().title}</span><Show when={doc().location}>{location => <small>{location().folder === '.' ? location().filename : `${location().folder}/${location().filename}`}</small>}</Show>
      </button><button type="button" class="flint-recent-remove" disabled={busy()}
        aria-label={`Remove ${doc().title} from recently opened documents`} title="Remove from recently opened documents"
        onClick={() => remove(id)}><span aria-hidden="true">×</span></button></li>;
      }}</For></ol>
    </Show>
    <Show when={error()}><p role="alert">{error()}</p></Show>
  </details>;
}
