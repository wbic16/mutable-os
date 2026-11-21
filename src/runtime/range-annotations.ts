import type { NodeKey } from "../block-tree/types";
import { exactTextRangeKey, type TextRangeSnapshot, type TextRanges } from "./text-ranges";
import {standoffStyleSchema} from '../rendering/standoff-styles';

export interface AnnotationReference { nodeKey: NodeKey; id: string | number }
export interface AnnotationApplication { type: string; added: number; references: readonly AnnotationReference[] }
export interface RangeAnnotationPorts {
  ranges: Pick<TextRanges, "validate">;
  properties(key: NodeKey): readonly Record<string, unknown>[];
  write(key: NodeKey, properties: Record<string, unknown>[], origins?: (number|null)[]): void;
  transaction(label: string, apply: () => void): void;
}

/** Ordinary independent annotations; shared semantic annotation identity is separate. */
export class RangeAnnotations {
  constructor(private readonly ports: RangeAnnotationPorts, private readonly applied: (result: AnnotationApplication) => void = () => {}) {}
  apply(ranges: readonly TextRangeSnapshot[], type: string, value?: string, attributes: Readonly<Record<string, number | string>> = {}): AnnotationApplication {
    this.ports.ranges.validate(ranges, "cell"); // validate the whole batch before any mutation
    const authoring=standoffStyleSchema(type)?.authoring;
    if(authoring)value=authoring.prepare({...attributes,...(value===undefined?{}:{value})},'standoff-editor-block').value;
    const updates = new Map<string, { key: NodeKey; properties: Record<string, unknown>[]; origins:(number|null)[] }>();
    const seen = new Set<string>(), references: AnnotationReference[] = [];
    let added = 0;
    for (const range of ranges) {
      const token = exactTextRangeKey(range); if (seen.has(token)) continue; seen.add(token);
      let update = updates.get(range.contentKey);
      if (!update) { const properties=[...this.ports.properties(range.nodeKey)]; update = { key: range.nodeKey, properties, origins:properties.map((_,i)=>i) }; updates.set(range.contentKey, update); }
      const end = range.end - 1;
      const index = update.properties.findIndex(p => !p.isDeleted && p.type === type && p.start === range.start && p.end === end && p.value === value);
      const property = index >= 0 ? update.properties[index] : { ...attributes, id: crypto.randomUUID(), type, start: range.start, end, ...(value === undefined ? {} : { value }) };
      if (index < 0) { update.properties.push(property); update.origins.push(null); added++; }
      references.push({ nodeKey: range.nodeKey, id: typeof property.id === "string" ? property.id : index });
    }
    if (added) this.ports.transaction("Annotate text ranges", () => { for (const update of updates.values()) this.ports.write(update.key, update.properties, update.origins); });
    const result = { type, added, references };
    this.applied(result); return result;
  }
}

/** Narrow bridge to the existing conceal/reveal projection, not a rendering API. */
export interface SelectionVisibility {
  active(key?: NodeKey): boolean;
  ranges(key: NodeKey): TextRangeSnapshot[];
  removeAt(key: NodeKey, index: number): boolean;
  clear(): void;
}
