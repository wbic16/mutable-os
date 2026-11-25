import { createSignal, getListener } from "solid-js";
import { cellWork } from "./cell-diagnostics";
import { clone } from "./clone";
import type { ContentRecord, JsonObject } from "./types";

interface Cell { value: string; index: number; serial: number; utf16: number }
export interface ResidentCharacter { readonly value: string; readonly index: number; readonly utf16: number }
function allocate(text: string, start: number, serial: number, utf16: number) {
  const cells = Array.from(text, (value, i) => {
    const cell = {value, index: start + i, serial: serial + i, utf16};
    utf16 += value.length;
    return cell;
  });
  if (cellWork) cellWork.allocations += cells.length;
  return cells;
}
const observedPositions = new WeakMap<Cell, ReturnType<typeof createSignal<number>>>();
function positionOf(cell: Cell) {
  if (!getListener()) return cell.index;
  let observed = observedPositions.get(cell);
  if (!observed) observedPositions.set(cell, observed = createSignal(cell.index));
  return observed[0]();
}
function move(cell: Cell, index: number) {
  cell.index = index;
  observedPositions.get(cell)?.[1](index);
}

interface Range {
  fields: JsonObject; first: Cell; last: Cell;
  point?: { affinity: "before" | "after"; endDelta: number };
}
const BEFORE_TEXT = -1, AFTER_TEXT = -2;
function pointOffset(r: Range) { return Number(r.point?.affinity === "before"); }

// Immutable runs of allocation serials describe historical positions without
// keeping each version of the Cell array alive. Sequential typing coalesces.
interface Run { serial: number; length: number }
function spliceRuns(runs: Run[], start: number, end: number, insert: Run): Run[] {
  const next: Run[] = [];
  function append(serial: number, length: number) {
    if (!length) return;
    const last = next.at(-1);
    if (last && last.serial + last.length === serial) last.length += length;
    else next.push({ serial, length });
  }
  let index = 0;
  for (const run of runs) {
    append(run.serial, Math.max(0, Math.min(run.length, start - index)));
    index += run.length;
    if (index >= start) break;
  }
  append(insert.serial, insert.length);
  index = 0;
  for (const run of runs) {
    const skip = Math.max(0, Math.min(run.length, end - index));
    append(run.serial + skip, run.length - skip);
    index += run.length;
  }
  return next;
}

// Only the active version needs its full run list on every edit. Historical
// versions share a checkpoint and at most 31 immutable splice descriptors.
type RunStep = {start: number; end: number; insert: Run; previous?: RunStep};
class RangeVersion {
  live = false;
  private activeRuns?: Run[];
  constructor(readonly ranges: Range[], private readonly checkpoint: Run[],
    readonly edited = false, private readonly step?: RunStep, private readonly depth = 0) {}
  get runs(): Run[] {
    if (this.activeRuns) return this.activeRuns;
    const steps: RunStep[] = [];
    for (let step = this.step; step; step = step.previous) steps.push(step);
    let result = this.checkpoint;
    for (let i = steps.length - 1; i >= 0; i--) {
      const {start, end, insert} = steps[i];
      result = spliceRuns(result, start, end, insert);
    }
    return result;
  }
  next(ranges: Range[], start: number, end: number, insert: Run) {
    const runs = spliceRuns(this.runs, start, end, insert);
    const next = this.depth === 31 ? new RangeVersion(ranges, runs, true)
      : new RangeVersion(ranges, this.checkpoint, true, {start, end, insert, previous:this.step}, this.depth + 1);
    next.activeRuns = runs;
    return next;
  }
  retire() { this.live = false; this.activeRuns = undefined; }
  numeric(): JsonObject[] {
    if (cellWork) { cellWork.numericExports++; cellWork.numericRanges += this.ranges.length; }
    let offset = 0;
    const sorted = this.live ? [] : this.runs.map(run => {
      const entry = { ...run, offset };
      offset += run.length;
      return entry;
    }).sort((a, b) => a.serial - b.serial);
    const live = this.live;
    function position(cell: Cell) {
      if (live) return cell.index;
      if (cell.serial === BEFORE_TEXT) return -1;
      if (cell.serial === AFTER_TEXT) return offset;
      let lo = 0, hi = sorted.length;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid].serial <= cell.serial) lo = mid;
        else hi = mid;
      }
      return sorted[lo].offset + cell.serial - sorted[lo].serial;
    }
    return this.ranges.map(r => {
      const start = position(r.first) + pointOffset(r);
      return {...clone(r.fields), ...(r.point && this.edited ? {affinity: r.point.affinity} : {}),
        start, end: r.point ? start + r.point.endDelta : position(r.last)};
    });
  }
}

// Every compatibility payload owns its numeric DTOs. Solid reconciliation,
// external captures and consumers retaining previousContents can mutate/read
// their own copy without changing the live anchors or a history preimage.
function deferField(payload: JsonObject, field: string, read: () => unknown) {
  const assign = (value: unknown) => {
    Object.defineProperty(payload, field, {value, writable: true, configurable: true, enumerable: true});
    return value;
  };
  Object.defineProperty(payload, field, {
    configurable: true, enumerable: true, get: () => assign(read()), set: assign,
  });
}

export class CellRecordVersion {
  constructor(private readonly base: ContentRecord, readonly text: string,
    readonly version: RangeVersion, readonly revision: number, readonly inlineRevision: number) {}
  payload() {
    const payload = {...this.base.payload};
    for (const [field, value] of Object.entries(payload)) {
      if (field === "standoffProperties" && Array.isArray(value)) deferField(payload, field, () => this.version.numeric());
      else if (value !== null && typeof value === "object") deferField(payload, field, () => clone(value));
    }
    return payload;
  }
  record(): ContentRecord {
    if (cellWork) cellWork.records++;
    return { ...clone({...this.base, payload: {}}), payload: this.payload(), revision: this.revision, inlineRevision: this.inlineRevision,
      compactInline: {version: 1, spans: this.text ? [{kind: "text", text: this.text}] : []} };
  }
}

export class ResidentCells {
  private readonly endpoints = new Map<Cell, Set<Range>>();
  private nextSerial: number;
  private views?: JsonObject[];
  private constructor(private readonly cells: Cell[], private readonly base: ContentRecord, public current: CellRecordVersion, private readonly afterText: Cell) {
    current.version.live = true;
    this.nextSerial = cells.length;
    for (const range of current.version.ranges) this.attach(range);
  }

  static open(content: ContentRecord, previous?: ResidentCells): ResidentCells | undefined {
    const spans = content.compactInline?.spans;
    if (!spans || spans.length > 1 || spans[0] && spans[0].kind !== "text") return;
    const text = spans[0]?.kind === "text" ? spans[0].text : "";
    const properties = content.payload.standoffProperties;
    if (properties !== undefined && !Array.isArray(properties)) return;
    // Annotation authoring can replace the whole payload while every character
    // survives. Rebind to the same sequence only for an identical text preimage.
    const reuse = previous?.current.text === text ? previous : undefined;
    // Unsupported legacy records stay numeric. Validate before allocating a
    // paragraph of Cells that the caller would immediately discard.
    const props = Array.isArray(properties) ? properties : [];
    let required = 0;
    for (const p of props) {
      if (!p || !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0) return;
      if (p.isZeroWidth === true) {
        if (p.end !== p.start && p.end !== p.start - 1) return;
        required = Math.max(required, p.start);
      } else {
        if (p.end < p.start) return;
        required = Math.max(required, p.end + 1);
      }
    }
    if (required > (reuse?.cells.length ?? text.length)) return;
    if (!reuse && required > text.length / 2) {
      let length = 0;
      for (const _ of text) if (++length >= required) break;
      if (length < required) return;
    }
    const cells = reuse?.cells ?? allocate(text, 0, 0, 0);
    if (cellWork) { if (reuse) cellWork.rebinds++; else cellWork.hydrations++; }
    const ranges: Range[] = [];
    const beforeText = {value: "", index: -1, serial: BEFORE_TEXT, utf16: 0};
    const afterText = reuse?.afterText ?? {value: "", index: cells.length, serial: AFTER_TEXT, utf16: text.length};
    for (const property of props) {
      const { start, end } = property;
      const fields = clone(property);
      if (property.isZeroWidth === true) {
        const affinity = fields.affinity === "before" || fields.affinity === "after"
          ? fields.affinity : start === cells.length ? "before" : "after";
        const cell = affinity === "before" ? cells[start - 1] ?? beforeText : cells[start] ?? afterText;
        ranges.push({fields, first: cell, last: cell, point: {affinity, endDelta: end - start}});
      } else {
        ranges.push({fields, first: cells[start], last: cells[end]});
      }
    }
    const base = clone({...content, compactInline: {version: 1 as const, spans: []},
      payload: {...content.payload, ...(properties === undefined ? {} : {standoffProperties: []})}});
    const runs = reuse?.current.version.runs ?? (cells.length ? [{serial: 0, length: cells.length}] : []);
    const result = new ResidentCells(cells, base, new CellRecordVersion(base, text,
      new RangeVersion(ranges, runs), content.revision, content.inlineRevision), afterText);
    if (reuse) {
      reuse.current.version.retire();
      result.nextSerial = reuse.nextSerial;
    }
    return result;
  }

  // A mounted reader can retain definitions across keystrokes. Each requested
  // numeric bound follows the original endpoint even after a suffix move.
  annotations(): JsonObject[] {
    const version = this.current.version;
    if (cellWork && !this.views) cellWork.annotationViews += version.ranges.length;
    return this.views ??= version.ranges.map(r => ({
      ...clone(r.fields), ...(r.point && version.edited ? {affinity: r.point.affinity} : {}),
      get start() { return positionOf(r.first) + pointOffset(r); },
      get end() { return r.point ? positionOf(r.first) + pointOffset(r) + r.point.endDelta : positionOf(r.last); },
    }));
  }

  // For subscribers that cache the text covered by a particular range. An
  // endpoint deletion can leave the shortened range touching the splice edge.
  // Use an inclusive intersection there and let the caller compare the text.
  rangeTextNearSplice(ordinal: number, start: number, inserted: number): string | false | undefined {
    const range = this.current.version.ranges[ordinal];
    if (!range || range.point) return undefined;
    const {first, last} = range;
    if (last.index + 1 < start || first.index > start + inserted) return false;
    return this.current.text.slice(first.utf16, last.utf16 + last.value.length);
  }

  characterAt(index: number): ResidentCharacter | undefined { return this.cells[index]; }

  private attach(range: Range) {
    for (const cell of [range.first, range.last]) {
      let owners = this.endpoints.get(cell);
      if (!owners) this.endpoints.set(cell, owners = new Set());
      owners.add(range);
    }
  }

  plan(start: number, end: number, text: string) {
    const cells = this.cells, length = cells.length, before = this.current;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > length) throw Error("Invalid compact range");
    const from = cells[start]?.utf16 ?? before.text.length, to = cells[end]?.utf16 ?? before.text.length;
    const unitsDelta = text.length - (to - from);
    const added = allocate(text, start, this.nextSerial, from);
    const delta = added.length - (end - start);
    // Joining isolated surrogate halves changes logical length at a splice
    // boundary. Use the compact codec's established handling for this input.
    const left = cells[start - 1]?.value ?? "", right = cells[end]?.value ?? "";
    if (/^[\uDC00-\uDFFF]/.test(text || right) && /[\uD800-\uDBFF]$/.test(left) ||
        /[\uD800-\uDBFF]$/.test(text) && /^[\uDC00-\uDFFF]/.test(right)) return;
    const touched = new Map<Range, Range | undefined>();
    for (let i = start; i < end; i++) {
      for (const range of this.endpoints.get(cells[i]) ?? []) {
        if (cellWork) cellWork.endpointVisits++;
        if (touched.has(range)) continue;
        const first = range.first.index < start ? range.first : cells[end];
        const last = range.last.index >= end ? range.last : cells[start - 1];
        touched.set(range, range.first.index >= start && range.last.index < end ? undefined : {...range, first, last});
      }
    }
    let ranges = before.version.ranges;
    let origins: number[] | undefined;
    if (touched.size) {
      if (cellWork) cellWork.survivorListReads += ranges.length;
      origins = [];
      ranges = ranges.flatMap((range, index) => {
        const next = touched.has(range) ? touched.get(range) : range;
        if (!next) return [];
        origins!.push(index);
        return [next];
      });
      if (ranges.length === before.version.ranges.length) origins = undefined;
    }
    const version = before.version.next(ranges, start, end, {serial: this.nextSerial, length: added.length});
    const nextText = before.text.slice(0, from) + text + before.text.slice(to);
    const after = new CellRecordVersion(this.base, nextText, version,
      before.revision + 1, before.inlineRevision + Number(before.text !== nextText));
    const apply = () => {
      if (this.current !== before || !before.version.live) throw Error("Stale Cell splice");
      if (cellWork) {
        cellWork.splices++;
        cellWork.suffixWrites += delta ? length - end : 0;
        for (const next of touched.values()) { if (next) cellWork.retargets++; else cellWork.removedRanges++; }
      }
      before.version.retire();
      for (const [previous, next] of touched) {
        for (const cell of [previous.first, previous.last]) {
          const bucket = this.endpoints.get(cell);
          if (bucket?.delete(previous) && !bucket.size) this.endpoints.delete(cell);
        }
        if (next) this.attach(next);
      }
      if (delta > 0) {
        cells.length += delta;
        for (let i = length - 1; i >= end; i--) {
          const cell = cells[i];
          cell.utf16 += unitsDelta;
          move(cell, i + delta);
          cells[i + delta] = cell;
        }
      } else if (delta < 0) {
        for (let i = end; i < length; i++) {
          const cell = cells[i];
          cell.utf16 += unitsDelta;
          move(cell, i + delta);
          cells[i + delta] = cell;
        }
        cells.length = length + delta;
      } else if (unitsDelta) {
        // Replacing one BMP character with an astral one shifts JS string
        // offsets while leaving every surviving annotation index unchanged.
        for (let i = end; i < length; i++) cells[i].utf16 += unitsDelta;
      }
      for (let i = 0; i < added.length; i++) cells[start + i] = added[i];
      move(this.afterText, cells.length);
      this.nextSerial += added.length;
      this.current = after;
      after.version.live = true;
      if (touched.size || !before.version.edited) this.views = undefined;
    };
    return {before, after, apply, origins, bindingsChanged: touched.size > 0, removedText: before.text.slice(from, to), insertedLength: added.length};
  }
}
