/**
 * Lattice engine: the phext processing core, ported from phext-lattice.
 *
 * Provenance: the design is a faithful TypeScript port of wbic16's
 * phext-lattice (`src/index.rs` — `LatticeIndex`; `src/mmap.rs` —
 * `MappedLattice`), the engine behind edit.phext.io, MIT-licensed, same
 * author as this fork. It replaces the parse-everything model of
 * `codec.ts` with the lattice model:
 *
 * - **One scan builds the index.** A single pass over the raw buffer maps
 *   every populated coordinate to its byte span (`ScrollSpan {start, end}`)
 *   in a hash map, plus the ordered coordinate list. Coordinate → span is
 *   O(1) thereafter; the existing codec's `parsePhext` is O(file) on
 *   *every* operation.
 * - **The buffer is the backing store.** There is no mmap in Node's
 *   standard library, so the Buffer plays the mmap's role: reads slice it
 *   by span and decode UTF-8 only at read time. Nothing is copied or
 *   decoded at open.
 * - **Copy-on-write overlay.** Edits never touch the base buffer. A scroll
 *   write lands in an overlay map as `modified` (base has the coordinate)
 *   or `inserted` (it does not); a delete of a base scroll is a
 *   tombstone. `toPhextBytes()` reconstructs the merged phext by emitting
 *   the populated coordinates in ascending order with the minimal break
 *   sequence between them — ascending order is correctness, not style,
 *   because phext delimiters encode *relative* coordinate movement and
 *   only move forward. `saveToFile` writes atomically (tmp + rename) and
 *   rebases the lattice onto the saved bytes, exactly as the Rust `save`
 *   re-maps the file and clears the overlay. `revert()` discards the
 *   overlay.
 *
 * Deliberate deltas from the Rust original, all in the direction of the
 * index's own invariants:
 *
 * - **Empty scrolls are not materialized.** The Rust index skips empty
 *   spans, so an empty scroll cannot survive a save/reload round trip;
 *   its overlay nevertheless lists one until then. This port normalizes
 *   eagerly: writing an empty string is a delete, and a coordinate whose
 *   effective content is empty is absent from `hasScroll`,
 *   `populatedCoordinates`, and the reconstruction, before and after save
 *   alike.
 * - **`writeScroll` rejects break bytes in content.** A scroll whose text
 *   contains a dimension break byte cannot be serialized (the break would
 *   become structure). The Rust version stores it silently and corrupts
 *   on save; this port throws, mirroring `codec.ts`'s `assertNoBreaks`.
 *
 * Benchmarks (this machine, Node 24; reproduce with
 * `node scripts/bench-phext-lattice.mjs`): see the BENCH note in
 * PATCHES.md. In short, on the 4.6 MB CYOA phext a mid-file scroll read
 * costs a full parse with the old codec and a hash lookup here, and a
 * one-scroll edit + full reconstruction stays cheaper than the old
 * parse + serialize pair while never re-parsing on reads.
 */
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import {
  breaksBetween,
  compareCoordinates,
  formatCoordinate,
  isValidCoordinate,
  originCoordinate,
  DIMENSION_BREAK_BYTES,
  type PhextCoordinate,
} from "./coordinate.js";

/** A scroll's location within the base buffer: bytes `[start, end)`. */
export interface ScrollSpan {
  readonly start: number;
  readonly end: number;
}

type OverlayEntry =
  | { readonly kind: "modified" | "inserted"; readonly content: Buffer }
  | { readonly kind: "deleted" };

interface OverlaySlot {
  readonly coordinate: PhextCoordinate;
  readonly entry: OverlayEntry;
}

/** Byte → break level lookup (levels per `coordinate.ts`); -1 = not a break. */
const BREAK_LEVEL_BY_BYTE = (() => {
  const table = new Int16Array(256).fill(-1);
  DIMENSION_BREAK_BYTES.forEach((byte, level) => {
    table[byte] = level;
  });
  return table;
})();

let saveCounter = 0;

/**
 * A phext document as a base buffer + coordinate index + copy-on-write
 * overlay. Construct with {@link PhextLattice.fromBuffer} or
 * {@link PhextLattice.open}; mutate through the overlay; persist with
 * {@link PhextLattice.saveToFile}.
 */
export class PhextLattice {
  private buffer: Buffer;
  private spans = new Map<string, ScrollSpan>();
  private ordered: PhextCoordinate[] = [];
  private readonly overlay = new Map<string, OverlaySlot>();
  private backingPath: string | undefined;

  private constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.buildIndex();
  }

  /**
   * Build a lattice over an existing buffer. The lattice takes ownership
   * of the buffer — it is the backing store (the mmap's role), so the
   * caller must not mutate it afterwards.
   */
  static fromBuffer(buffer: Buffer): PhextLattice {
    return new PhextLattice(buffer);
  }

  /** An empty lattice (no scrolls), ready to be written and saved. */
  static empty(): PhextLattice {
    return new PhextLattice(Buffer.alloc(0));
  }

  /** Open a phext file: read it once, index it, remember the path. */
  static open(path: string): PhextLattice {
    const lattice = new PhextLattice(readFileSync(path));
    lattice.backingPath = path;
    return lattice;
  }

  /** The backing file path, once opened from or saved to one. */
  get path(): string | undefined {
    return this.backingPath;
  }

  /** Size of the base buffer in bytes (the on-disk size at open/save). */
  get byteLength(): number {
    return this.buffer.length;
  }

  /** The base index span for a coordinate, ignoring the overlay. */
  indexSpan(coordinate: PhextCoordinate): ScrollSpan | undefined {
    return this.spans.get(formatCoordinate(coordinate));
  }

  /**
   * The effective bytes of a scroll: overlay first, then the base span.
   * The returned Buffer is a view (base) or the overlay's own buffer —
   * treat it as read-only.
   */
  readScrollBytes(coordinate: PhextCoordinate): Buffer | undefined {
    const slot = this.overlay.get(formatCoordinate(coordinate));
    if (slot !== undefined) {
      return slot.entry.kind === "deleted" ? undefined : slot.entry.content;
    }
    const span = this.spans.get(formatCoordinate(coordinate));
    return span === undefined
      ? undefined
      : this.buffer.subarray(span.start, span.end);
  }

  /** The effective text of a scroll, decoded as UTF-8 at read time. */
  readScroll(coordinate: PhextCoordinate): string | undefined {
    const bytes = this.readScrollBytes(coordinate);
    return bytes === undefined ? undefined : bytes.toString("utf8");
  }

  /**
   * Write a scroll through the overlay. A coordinate present in the base
   * index is recorded `modified`; a new one `inserted`. Writing an empty
   * string deletes the scroll (empty scrolls are not materialized — see
   * the module header). Throws on an invalid coordinate or on content
   * containing a dimension break byte.
   */
  writeScroll(coordinate: PhextCoordinate, text: string): void {
    if (!isValidCoordinate(coordinate)) {
      throw new Error(
        `Invalid phext coordinate: ${JSON.stringify([...coordinate])}`,
      );
    }
    if (text === "") {
      this.deleteScroll(coordinate);
      return;
    }
    for (let index = 0; index < text.length; index++) {
      // Break bytes are single UTF-16 code units below 0x20; surrogate
      // halves are >= 0xD800, so a code-unit scan cannot split a character.
      if (BREAK_LEVEL_BY_BYTE[text.charCodeAt(index)] >= 0) {
        throw new Error(
          `Scroll ${formatCoordinate(coordinate)} contains a phext dimension break; ` +
            "breaks are structure, not scroll text, and cannot be stored inside a scroll.",
        );
      }
    }
    const key = formatCoordinate(coordinate);
    const kind = this.spans.has(key) ? "modified" : "inserted";
    this.overlay.set(key, {
      coordinate,
      entry: { kind, content: Buffer.from(text, "utf8") },
    });
  }

  /**
   * Delete a scroll through the overlay: a tombstone for a base scroll,
   * removal of the overlay slot for an inserted one. Deleting an absent
   * scroll is a no-op.
   */
  deleteScroll(coordinate: PhextCoordinate): void {
    const key = formatCoordinate(coordinate);
    if (this.spans.has(key)) {
      this.overlay.set(key, { coordinate, entry: { kind: "deleted" } });
    } else {
      this.overlay.delete(key);
    }
  }

  /** True when the coordinate has effective (non-empty) content. */
  hasScroll(coordinate: PhextCoordinate): boolean {
    const slot = this.overlay.get(formatCoordinate(coordinate));
    if (slot !== undefined) return slot.entry.kind !== "deleted";
    return this.spans.has(formatCoordinate(coordinate));
  }

  /**
   * All populated coordinates — base scrolls minus tombstones, plus
   * insertions — in ascending coordinate order.
   */
  populatedCoordinates(): PhextCoordinate[] {
    const result: PhextCoordinate[] = [];
    for (const coordinate of this.ordered) {
      const slot = this.overlay.get(formatCoordinate(coordinate));
      if (slot !== undefined && slot.entry.kind === "deleted") continue;
      result.push(coordinate);
    }
    for (const slot of this.overlay.values()) {
      if (slot.entry.kind === "inserted") result.push(slot.coordinate);
    }
    result.sort(compareCoordinates);
    return result;
  }

  /** Number of populated scrolls, overlay considered. */
  scrollCount(): number {
    return this.populatedCoordinates().length;
  }

  /**
   * The next populated coordinate after `coordinate` in the *base index*
   * (overlay ignored — the navigation primitive from `LatticeIndex`).
   */
  nextPopulated(coordinate: PhextCoordinate): PhextCoordinate | undefined {
    const index = this.lowerBound(coordinate);
    if (index < this.ordered.length && compareCoordinates(this.ordered[index], coordinate) === 0) {
      return this.ordered[index + 1];
    }
    return this.ordered[index];
  }

  /** The previous populated coordinate before `coordinate` in the base index. */
  prevPopulated(coordinate: PhextCoordinate): PhextCoordinate | undefined {
    const index = this.lowerBound(coordinate);
    return index > 0 ? this.ordered[index - 1] : undefined;
  }

  /** True when the overlay holds unsaved modifications. */
  isDirty(): boolean {
    return this.overlay.size > 0;
  }

  /** Number of modified / inserted / deleted scrolls in the overlay. */
  pendingChanges(): number {
    return this.overlay.size;
  }

  /**
   * Reconstruct the merged phext: populated coordinates in ascending
   * order, minimal break sequences between them, base spans sliced and
   * overlay content written verbatim. No re-parse, no re-encode of
   * untouched scrolls.
   */
  toPhextBytes(): Buffer {
    const parts: Buffer[] = [];
    let current = originCoordinate();
    for (const coordinate of this.populatedCoordinates()) {
      const breaks = breaksBetween(current, coordinate);
      if (breaks !== "") parts.push(Buffer.from(breaks, "latin1"));
      const bytes = this.readScrollBytes(coordinate);
      if (bytes !== undefined) parts.push(bytes);
      current = coordinate;
    }
    return Buffer.concat(parts);
  }

  /**
   * Persist the merged phext to `path` atomically (write a temp file in
   * the same directory, fsync, rename over the target), then rebase:
   * the saved bytes become the base buffer, the index is rebuilt, and
   * the overlay clears — the Rust `save` sequence.
   */
  saveToFile(path: string): void {
    const bytes = this.toPhextBytes();
    const tmp = `${path}.tmp-${process.pid}-${++saveCounter}`;
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
    this.buffer = bytes;
    this.buildIndex();
    this.overlay.clear();
    this.backingPath = path;
  }

  /** Persist to the backing path (from {@link PhextLattice.open} or a prior save). */
  save(): void {
    if (this.backingPath === undefined) {
      throw new Error("No backing file path: use saveToFile(path) first.");
    }
    this.saveToFile(this.backingPath);
  }

  /** Discard all unsaved changes, reverting to the base buffer state. */
  revert(): void {
    this.overlay.clear();
  }

  /**
   * Rebase onto a newer base buffer (Phase 4 multi-instance support):
   * the base index is rebuilt from `buffer`, and every overlay slot is
   * re-applied on top of it — a modification of a scroll the new base
   * no longer holds becomes an insertion, a tombstone for a scroll the
   * new base no longer holds is dropped (the delete has already
   * happened), and content is carried verbatim. This lets two
   * PhextLattice instances over one file adopt each other's saved
   * generations without losing their own unsaved edits, provided each
   * writer owns disjoint scrolls (in Mutable: disjoint VFS strata).
   */
  rebaseFromBuffer(buffer: Buffer): void {
    const slots = [...this.overlay.values()];
    this.buffer = buffer;
    this.buildIndex();
    this.overlay.clear();
    for (const slot of slots) {
      const key = formatCoordinate(slot.coordinate);
      if (slot.entry.kind === "deleted") {
        if (this.spans.has(key)) this.overlay.set(key, slot);
      } else {
        this.overlay.set(key, {
          coordinate: slot.coordinate,
          entry: {
            kind: this.spans.has(key) ? "modified" : "inserted",
            content: slot.entry.content,
          },
        });
      }
    }
  }

  /** First index in `ordered` whose coordinate is >= `coordinate`. */
  private lowerBound(coordinate: PhextCoordinate): number {
    let low = 0;
    let high = this.ordered.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (compareCoordinates(this.ordered[mid], coordinate) < 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  /**
   * The one scan: walk the buffer once, committing a span for the
   * current coordinate at each break byte (empty spans are skipped, as
   * in the Rust `LatticeIndex::build`), advancing the coordinate in
   * place. Coordinates strictly increase along the scan, so `ordered`
   * is built already sorted.
   */
  private buildIndex(): void {
    this.spans.clear();
    this.ordered = [];
    const buffer = this.buffer;
    const coordinate = [1, 1, 1, 1, 1, 1, 1, 1, 1];
    let scrollStart = 0;
    const commit = (end: number): void => {
      if (end <= scrollStart) return; // empty spans are not materialized
      const tuple = [...coordinate] as unknown as PhextCoordinate;
      this.spans.set(formatCoordinate(tuple), { start: scrollStart, end });
      this.ordered.push(tuple);
    };
    for (let index = 0; index < buffer.length; index++) {
      const level = BREAK_LEVEL_BY_BYTE[buffer[index]];
      if (level < 0) continue;
      commit(index);
      // applyBreak, in place: increment this level, reset all lower to 1.
      coordinate[level] += 1;
      for (let lower = level + 1; lower < 9; lower++) coordinate[lower] = 1;
      scrollStart = index + 1;
    }
    if (scrollStart < buffer.length) commit(buffer.length);
  }
}
