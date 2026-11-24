import type { ChangeSet } from '@codemirror/state';
import type { JsonObject } from '../../block-tree/types';
import { mapStandoffPropertiesForReplacement, replacePoint } from '../../interchange/ranges';

export const CODE_MIRROR_STANDOFF = 'standoff-code-mirror-block';
export const propertiesOf = (value: unknown): JsonObject[] => Array.isArray(value) ? value : [];
/** Explicit boundary table. -1 marks the ambiguous boundary inside CRLF. No
 * Unicode normalization; combining marks and ZWJ remain distinct code points. */
export class Coordinates {
  readonly text: string;
  readonly boundaries: number[] = [0];
  private reverse = new Map<number, number>([[0, 0]]);
  constructor(readonly source: string) {
    const chars = [...source]; let text = '';
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === '\r' && chars[i + 1] === '\n') {
        this.boundaries.push(-1); i++;
        text += '\n';
      } else text += chars[i] === '\r' ? '\n' : chars[i];
      this.boundaries.push(text.length);
      this.reverse.set(text.length, this.boundaries.length - 1);
    }
    this.text = text;
  }
  get length() { return this.boundaries.length - 1; }
  native(point: number) {
    const position = this.boundaries[point];
    if (!Number.isInteger(point) || position === undefined || position < 0) throw Error('Invalid code-point boundary (possibly inside CRLF).');
    return position;
  }
  canonical(offset: number) {
    const point = this.reverse.get(offset);
    if (point === undefined) throw Error('Invalid UTF-16 boundary (possibly inside a supplementary character).');
    return point;
  }
  range(p: JsonObject) {
    if(typeof p.start!=='number'||typeof p.end!=='number')throw Error('Annotation indexes must be numeric code-point boundaries.');
    const from = this.native(Number(p.start)), to = this.native(p.isZeroWidth ? Number(p.start) : Number(p.end) + 1);
    if (to < from || !p.isZeroWidth && to === from) throw Error('Invalid annotation range.');
    return { from, to };
  }
}

/** Explicit import conversion, never run by mounting or saving. All fields survive. */
export function normalizeLineEndings(text: string, properties: JsonObject[]) {
  const old = new Coordinates(text), next = new Coordinates(old.text);
  return { text: next.text, properties: properties.map(p => {
    if (!p || typeof p !== 'object') return p;
    const {from, to} = old.range(p);
    return {...p, start: next.canonical(from), end: p.isZeroWidth ? next.canonical(from) : next.canonical(to) - 1};
  }) };
}

/** Reverse source-order edits preserve the actual simultaneous ChangeSet semantics.
 * Origins compose through every splice, including idless/duplicate-ID imports. */
export function mapChanges(text: string, properties: JsonObject[], changes: ChangeSet, timing?:{coordinatesMs:number;mappingMs:number}) {
  const began=timing?performance.now():0;
  const coordinates = new Coordinates(text);
  if (coordinates.text !== text) throw Error('Convert imported line endings to LF before editing.');
  if (changes.length !== text.length) throw Error('Stale CodeMirror transaction.');
  const edits: {start:number;end:number;text:string}[] = [];
  changes.iterChanges((from, to, _a, _b, inserted) => edits.push({start:coordinates.canonical(from), end:coordinates.canonical(to), text:inserted.toString()}));
  const mappedAt=timing?performance.now():0;if(timing)timing.coordinatesMs+=mappedAt-began;
  let mapped = properties, origins: (number|null)[] = properties.map((_,i) => i), length = coordinates.length;
  for (const edit of edits.reverse()) {
    const count = [...edit.text].length, nextOrigins: (number|null)[] = [], next: JsonObject[] = [];
    mapped.forEach((p,i) => {
      // Points are mapped before span validation, including legacy end=start-1.
      if (p?.isZeroWidth === true) {
        const point = replacePoint(p, edit.start, edit.end, count, length);
        if (point) {next.push(point); nextOrigins.push(origins[i]);}
      } else {
        const retained: (number|null)[] = [];
        const result = mapStandoffPropertiesForReplacement([p], edit.start, edit.end, count, retained, length);
        if (result.length) {next.push(result[0] as JsonObject); nextOrigins.push(origins[i]);}
      }
    });
    mapped = next; origins = nextOrigins; length += count - (edit.end - edit.start);
  }
  if(timing)timing.mappingMs+=performance.now()-mappedAt;
  return {properties:mapped, origins};
}
