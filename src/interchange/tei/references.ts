import { Diagnostics, isTei, TeiBudget, type TeiNode } from './model';
export interface TeiTarget { kind: 'block' | 'definition' | 'annotation'; id: string; precision?: 'block-context' }
export interface ReferenceToken { raw: string; scope: 'local' | 'external'; state: 'resolved' | 'unresolved' | 'ambiguous'; target?: TeiTarget; candidates?: TeiTarget[]; effectiveUri?: string }
export interface TeiReference { type: 'tei/reference'; attribute: string; raw: string; tokens: ReferenceToken[]; base?: string }
const attributes = new Set(['ref', 'target', 'corresp', 'who', 'ana', 'wit', 'facs', 'sameAs', 'next', 'prev', 'resp', 'source']);
const semanticPointers = new Set(['hand', 'change', 'spanTo', 'synch', 'copyOf', 'exclude', 'select']);
/** Attribute meaning depends on its element: date/@from is not a pointer. */
export function isReferenceAttribute(n: TeiNode, attribute: string, rich = true) {
  return attributes.has(attribute) || rich && isTei(n) && (semanticPointers.has(attribute) ||
    n.name === 'app' && ['from', 'to'].includes(attribute) ||
    n.name === 'relation' && ['active', 'passive', 'mutual'].includes(attribute) ||
    n.name === 'handShift' && attribute === 'new');
}
export class References {
  private ids = new Map<string, TeiTarget[]>();
  private pending: TeiReference[] = [];
  private count = 0;
  constructor(private limit: number, private diagnostics: Diagnostics, private rich = true) {}
  identify(sourceId: string | undefined, target: TeiTarget) {
    if (!sourceId) return;
    const list = this.ids.get(sourceId) ?? []; list.push(target); this.ids.set(sourceId, list);
  }
  collect(n: TeiNode, base?: string): TeiReference[] {
    const result: TeiReference[] = [];
    for (const [attribute, raw] of Object.entries(n.attrs)) {
      if (!isReferenceAttribute(n, attribute, this.rich)) continue;
      const tokens: ReferenceToken[] = [];
      for (const match of raw.matchAll(/\S+/g)) {
        const token = match[0];
        if (++this.count > this.limit) throw new TeiBudget('reference-token budget');
        let effectiveUri: string | undefined;
        if (base) { try { effectiveUri = new URL(token, base).href; } catch { /* retain original and base */ } }
        tokens.push({ raw: token, scope: token.startsWith('#') && !base ? 'local' : 'external', state: 'unresolved', ...(effectiveUri ? { effectiveUri } : {}) });
      }
      const ref: TeiReference = { type: 'tei/reference', attribute, raw, tokens, ...(base ? { base } : {}) };
      this.pending.push(ref); result.push(ref);
    }
    return result;
  }
  resolve(present: (target: TeiTarget) => boolean = () => true) {
    for (const ref of this.pending) for (const token of ref.tokens) {
      const targets = token.scope === 'local' ? (this.ids.get(token.raw.slice(1)) ?? []).filter(present) : [];
      if (targets.length === 1) { token.state = 'resolved'; token.target = targets[0]; }
      else if (targets.length > 1) { token.state = 'ambiguous'; token.candidates = targets; }
      if (token.state !== 'resolved') this.diagnostics.add(`${token.state}-reference`, `${token.state === 'ambiguous' ? 'Ambiguous' : 'Unresolved'} references were retained without inventing targets.`, `${ref.attribute}=${token.raw}`);
    }
  }
}
