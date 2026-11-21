/** Invocation syntax only: these characters never determine stored annotation types. */
export type CompletionKind = 'entity' | 'document' | 'block' | 'command';
export type CompletionScope = 'blend' | 'document' | 'session' | 'day' | 'week' | 'cavern';
export interface Invocation { kind: CompletionKind; start: number; end: number; input: string }
export const TOKEN_LIMIT = 256;
/** Bounded, cell-coordinate recogniser. No Document or vault reads. */
export function invocation(caret: number, cell: (index: number) => string | undefined): Invocation | undefined {
  const from = Math.max(0, caret - TOKEN_LIMIT), chars: string[] = [];
  for (let i = from; i < caret; i++) { const text = cell(i); if (text === undefined || text.includes('\n')) { chars.length = 0; continue; } chars.push(text); }
  const text = chars.join(''), base = caret - chars.length;
  // Document parameter values may contain punctuation used by other invocations.
  const match = /(?:^|\s)(\/)(flint\s+open\s+--doc(?:\s[^\n]*)?)$/iu.exec(text)
    ?? /(?:^|\s)(@|\[\[|\(\(|\/)([^\n\[\]()]*)$/u.exec(text);
  if (!match) return;
  const start = base + [...text.slice(0, match.index + match[0].indexOf(match[1]))].length;
  // A token beginning at the truncated suffix boundary is not known to be a boundary.
  if (start === from && from > 0 && !/\s/u.test(cell(from - 1) ?? 'x')) return;
  return { kind: ({ '@':'entity', '[[':'entity', '((':'entity', '/':'command' } as const)[match[1] as "@"|"[["|"(("|"/"], start, end: caret, input: match[2] };
}
export function parseInput(input: string) {
  // Require spaced punctuation; times, URLs and ordinary colons remain literal.
  const index = input.search(/(?<!\\) : /u);
  const unescape = (s: string) => s.replace(/\\([:@#+\\])/gu, '$1');
  const mention = unescape(index < 0 ? input : input.slice(0, index)).trim();
  const raw = index < 0 ? input : input.slice(index + 3), query = unescape(raw).trim();
  return { mention, query: index >= 0 && ['@','#'].includes(raw.trim()) ? '' : query,
    scope: index >= 0 && raw.trim() === '@' ? 'session' as const : index >= 0 && raw.trim() === '#' ? 'document' as const : undefined,
    createName: index >= 0 && raw.trim().startsWith('+') ? query.slice(1).trim() : undefined };
}
export interface CompletionCandidate { id: string; name: string; reason: string; exact?: boolean; frequency?: number; recent?: number; data?: unknown; disabled?: boolean }
export function rank(candidates: CompletionCandidate[], query: string, scope: CompletionScope): CompletionCandidate[] {
  const normalized = query.normalize('NFKC').toLocaleLowerCase(), rows = new Map<string, CompletionCandidate>();
  for (const row of candidates) {
    const old = rows.get(row.id); rows.set(row.id, old ? { ...old, ...row, reason: [...new Set([old.reason,row.reason])].join(' · '), frequency: Math.max(old.frequency ?? 0,row.frequency ?? 0), recent: Math.max(old.recent ?? 0,row.recent ?? 0), exact: old.exact || row.exact } : row);
  }
  const exact = (r: CompletionCandidate) => Number(!!normalized && (r.exact || r.name.normalize('NFKC').toLocaleLowerCase() === normalized));
  return [...rows.values()].sort((a,b) => (scope === 'document' ? (b.frequency ?? 0)-(a.frequency ?? 0) : ['session','day','week'].includes(scope) ? (b.recent ?? 0)-(a.recent ?? 0) : exact(b)-exact(a) || (b.frequency ?? 0)-(a.frequency ?? 0) || (b.recent ?? 0)-(a.recent ?? 0)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
