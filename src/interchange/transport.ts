import { parseClipboardHtml } from './html-ast';
import { importSemanticHtml } from './html-import';
import { importNativeMarkdown } from './markdown-native';
import { LIMITS, validateFragment, type MutableFragment } from './fragment';
import { emptyFragment } from './fragment';
import { fragmentText, plainFragment } from './serializer';

export const NATIVE_MIME = 'application/x-mutable-fragment+json';
export const MARKDOWN_MIMES = ['text/markdown', 'text/x-markdown'] as const;
export type ClipboardRepresentations = Record<string, string>;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function encode(s: string) { const bytes = new TextEncoder().encode(s); let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
function decode(s: string) { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); }

export function exportClipboard(fragment: MutableFragment): ClipboardRepresentations {
  validateFragment(fragment);
  const text = fragmentText(fragment), json = JSON.stringify(fragment);
  // Native fidelity lives in the carrier; the visible projection remains useful outside Mutable.
  const representations = { 'text/plain': text, 'text/html': `<div data-mutable-fragment="${encode(json)}"><pre><span>${escape(text)}</span></pre></div>`, [NATIVE_MIME]: json };
  if (Object.values(representations).reduce((n, value) => n + new TextEncoder().encode(value).length, 0) > LIMITS.bytes) throw Error('Selection exceeds the clipboard transport limit. Copy a smaller selection; nothing was removed.');
  return representations;
}

export function importClipboard(data: ClipboardRepresentations, plain = false, semanticHtml = true, markdown = true, asMarkdown = false): { fragment?: MutableFragment; notice?: string } {
  if (Object.values(data).reduce((n, s) => n + new TextEncoder().encode(s).length, 0) > LIMITS.bytes) throw Error('Clipboard exceeds the size limit.');
  const warnings: string[] = [];
  const markdownText = MARKDOWN_MIMES.map(type => data[type]).find(value => value !== undefined);
  const convertMarkdown = (source: string) => {
    try { return importNativeMarkdown(source); }
    catch { return { fragment: plainFragment(source), notice: 'Markdown exceeded import limits; pasted literal text.' }; }
  };
  // Explicit intent overrides automatic negotiation. It never interprets HTML as Markdown.
  if (!plain && markdown && asMarkdown) {
    const source = markdownText ?? data['text/plain'];
    return source ? convertMarkdown(source) : { notice: 'Clipboard contains no Markdown or plain text; the selection was left unchanged.' };
  }
  if (!plain && data[NATIVE_MIME]) {
    try { return { fragment: validateFragment(JSON.parse(data[NATIVE_MIME])) }; }
    catch { warnings.push('Native clipboard data was invalid or unsupported; used a fallback.'); }
  }
  let html: ReturnType<typeof parseClipboardHtml> | undefined;
  if (data['text/html'] && (!plain || data['text/plain'] === undefined)) {
    try {
      html = parseClipboardHtml(data['text/html']);
      if (!plain && html.carrier) {
        const fragment = validateFragment(JSON.parse(decode(html.carrier)));
        // Exact projection comparison detects carriers retained after external text edits.
        if (fragmentText(fragment) === html.text && (!data['text/plain'] || data['text/plain'] === html.text)) return { fragment };
        warnings.push('The HTML carrier no longer matches the visible content; used text.');
      }
    } catch { warnings.push('Could not recover native formatting from HTML.'); }
  }
  if (!plain && data['application/json']) {
    try {
      const legacy = JSON.parse(data['application/json']);
      if (legacy?.source === 'codex' && legacy.format === 'standoff-inline-v1' && Array.isArray(legacy.data)) {
        const f = emptyFragment();
        legacy.data.forEach((atoms: any[], i: number) => {
          if (!Array.isArray(atoms)) throw Error('Invalid legacy clipboard.');
          const block = plainFragment(''); const b = block.blocks[0]; b.localId = `b${i}`;
          b.inline!.atoms = atoms.map((a, j) => {
            if (a?.kind === 'text' && typeof a.text === 'string') return { kind: 'text', text: a.text };
            if (a?.kind !== 'image') throw Error('Invalid legacy atom.');
            const embed = `i${i}-${j}`; f.embeds.push({ localId: embed, type: 'image-cell', data: a }); return { kind: 'embed', embed };
          });
          f.blocks.push(b); f.placements.push({ localId: `e${i}`, kind: 'owned', target: { kind: 'local', object: 'block', id: b.localId } });
          f.roots.push({ ...block.roots[0], placement: `e${i}`, ...(i < legacy.data.length - 1 ? { separatorAfter: 'selection-gap' } : {}) });
        });
        return { fragment: validateFragment(f), notice: 'Imported legacy inline clipboard; unavailable annotations cannot be recovered.' };
      }
    } catch { warnings.push('Legacy clipboard data was invalid; used text.'); }
  }
  let derivedText = html?.text;
  // Native and legacy formats win. A failed carrier falls back to visible text,
  // without reinterpreting its stale native projection as an external document.
  if (semanticHtml && html && !html.carrier) {
    try {
      const imported = importSemanticHtml(html.tree);
      if (imported.fragment) {
        if (!plain) return { fragment: imported.fragment, ...((warnings.length || imported.notice) ? { notice: [...warnings, imported.notice].filter(Boolean).join(' ') } : {}) };
        derivedText = fragmentText(imported.fragment);
      } else warnings.push(imported.notice ?? 'HTML contained no supported content.');
    } catch { warnings.push('HTML exceeded semantic import limits; used text when available.'); }
  }
  // Text-only Markdown stays literal unless the user explicitly requests conversion.
  const text = data['text/plain'] ?? markdownText ?? derivedText;
  if (!text) return { notice: 'Clipboard contains no supported text; the selection was left unchanged.' };
  if (!plain && data['text/html'] && !warnings.length) warnings.push('Pasted text. External semantic HTML import is disabled.');
  return { fragment: plainFragment(text), ...(warnings.length ? { notice: warnings.join(' ') } : {}) };
}

export function captureClipboard(data: DataTransfer | null): ClipboardRepresentations {
  const result: ClipboardRepresentations = {}; if (!data) throw Error('The browser did not provide clipboard access.');
  for (const type of [NATIVE_MIME, 'text/plain', 'text/html', ...MARKDOWN_MIMES, 'application/json']) if (data.types.includes(type)) result[type] = data.getData(type);
  return result;
}
export function writeEventClipboard(data: DataTransfer | null, representations: ClipboardRepresentations) {
  if (!data) throw Error('Clipboard access failed; nothing was removed.');
  for (const type of ['text/plain', 'text/html', ...MARKDOWN_MIMES, NATIVE_MIME]) if (representations[type] !== undefined) {
    if (type === 'text/plain' || type === 'text/html') data.setData(type, representations[type]);
    else try { data.setData(type, representations[type]); } catch { /* Mandatory plain projection remains available. */ }
  }
}
export function canWriteAsync() { return typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined'; }
export async function writeAsyncClipboard(representations: ClipboardRepresentations) {
  const data: Record<string, Blob> = {};
  for (const type of ['text/plain', 'text/html', ...MARKDOWN_MIMES, NATIVE_MIME]) if (representations[type] !== undefined) {
    const native = type === 'text/plain' || type === 'text/html', name = native ? type : `web ${type}`;
    if (native || ClipboardItem.supports?.(name)) data[name] = new Blob([representations[type]], {type});
  }
  await navigator.clipboard.write([new ClipboardItem(data)]);
}

export async function readAsyncClipboardBundle(images = false): Promise<{ data: ClipboardRepresentations; files: Array<{blob: Blob; name: string}> }> {
  if (!navigator.clipboard?.read) throw Error('Use Command/Control-V to paste with this browser.');
  const items = await navigator.clipboard.read(), out: ClipboardRepresentations = {};
  for (const item of items) for (const name of [NATIVE_MIME, `web ${NATIVE_MIME}`, 'text/plain', 'text/html', ...MARKDOWN_MIMES, ...MARKDOWN_MIMES.map(type => `web ${type}`)]) if (item.types.includes(name) && !out[name.replace(/^web /, '')]) {
    const blob = await item.getType(name); if (blob.size > LIMITS.bytes) throw Error('Clipboard exceeds the size limit.');
    out[name.replace(/^web /, '')] = await blob.text();
  }
  const files: Array<{blob: Blob; name: string}> = [];
  if (images) for (const item of items) {
    const type = ['image/png','image/jpeg'].find(t => item.types.includes(t));
    if (type) { const blob = await item.getType(type); if (blob.size > 10*1024*1024 || files.length >= 20 || files.reduce((n,f)=>n+f.blob.size,0)+blob.size>40*1024*1024) throw Error('Clipboard image limits exceeded.'); files.push({blob,name:'clipboard-image'}); }
  }
  return { data: out, files };
}
export async function readAsyncClipboard(): Promise<ClipboardRepresentations> { return (await readAsyncClipboardBundle()).data; }
