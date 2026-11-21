/** Import-only budgets. They never change clipboard or native persistence admission. */
export interface TeiLimits {
  bytes: number; cells: number; elements: number; depth: number; blocks: number;
  annotations: number; references: number; diagnosticExamples: number; timeoutMs: number;
}
export interface TeiConversionOptions { semanticSublimation?: boolean; operationalSemantics?: boolean; inlineAlternatives?: boolean }
export const defaultTeiLimits: Readonly<TeiLimits> = Object.freeze({
  bytes: 64 * 1024 * 1024, cells: 5_000_000, elements: 1_000_000, depth: 128,
  blocks: 100_000, annotations: 500_000, references: 500_000, diagnosticExamples: 100, timeoutMs: 120_000,
});
export function teiLimits(options: Partial<TeiLimits> = {}): Readonly<TeiLimits> {
  const limits = { ...defaultTeiLimits, ...options };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw Error(`TEI configuration: ${key} must be a positive safe integer`);
  }
  return Object.freeze(limits);
}
export interface TeiDiagnostic { code: string; detail: string; count: number; examples: string[] }
export class Diagnostics {
  private entries = new Map<string, TeiDiagnostic>();
  private examples = 0;
  constructor(private limit: number) {}
  add(code: string, detail: string, example?: string) {
    let entry = this.entries.get(code);
    if (!entry) this.entries.set(code, entry = { code, detail, count: 0, examples: [] });
    entry.count++;
    if (example && this.examples < this.limit) { entry.examples.push(example.slice(0, 180)); this.examples++; }
  }
  list(): TeiDiagnostic[] { return [...this.entries.values()]; }
}
export const TEI = 'http://www.tei-c.org/ns/1.0';
export interface TeiNode {
  name: string; uri: string; attrs: Record<string, string>; parts: Array<string | TeiNode>;
  start: number; end?: number; recovery?: boolean;
}
export const isTei = (n: TeiNode) => !n.uri || n.uri === TEI;
export function nodeText(n: TeiNode): string { return n.parts.map(p => typeof p === 'string' ? p : nodeText(p)).join(''); }
export class TeiBudget extends Error {}
export const incompleteMessage = 'INCOMPLETE IMPORT — a configured resource limit was reached. Remaining source content was not imported. The original file is unchanged.';
