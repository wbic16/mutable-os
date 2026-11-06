import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parsePhext } from "./codec";
import {
  formatCoordinate,
  parseCoordinate,
  type PhextCoordinate,
} from "./coordinate";
import { PhextLattice } from "./lattice";

const coord = (text: string): PhextCoordinate => parseCoordinate(text);

/** The phext-lattice Rust test fixture: hello / world / deep. */
function rustFixture(): Buffer {
  const buffer = Buffer.alloc(5 + 1 + 5 + 1 + 4);
  let offset = 0;
  offset += buffer.write("hello", offset);
  buffer[offset++] = 0x17; // scroll break → 1.1.1/1.1.1/1.1.2
  offset += buffer.write("world", offset);
  buffer[offset++] = 0x18; // section break → 1.1.1/1.1.1/1.2.1
  buffer.write("deep", offset);
  return buffer;
}

// Vitest's SSR transform rewrites import.meta.url, so fixture paths are
// resolved from the repo root (the pattern in block-tree fixture tests).
const CYOA_PATH = join(
  process.cwd(),
  "src/assets/hosted/phext/choose-your-own-adventure.phext",
);

describe("lattice index (phext-lattice index.rs parity)", () => {
  it("builds spans and answers lookups in one scan", () => {
    const lattice = PhextLattice.fromBuffer(rustFixture());
    expect(lattice.scrollCount()).toBe(3);
    expect(lattice.readScroll(coord("1.1.1/1.1.1/1.1.1"))).toBe("hello");
    expect(lattice.readScroll(coord("1.1.1/1.1.1/1.1.2"))).toBe("world");
    expect(lattice.readScroll(coord("1.1.1/1.1.1/1.2.1"))).toBe("deep");
    const span = lattice.indexSpan(coord("1.1.1/1.1.1/1.1.2"));
    expect(span).toEqual({ start: 6, end: 11 });
    expect(lattice.readScroll(coord("5.5.5/5.5.5/5.5.5"))).toBeUndefined();
    expect(lattice.hasScroll(coord("5.5.5/5.5.5/5.5.5"))).toBe(false);
  });

  it("preserves document order and navigates it", () => {
    const lattice = PhextLattice.fromBuffer(rustFixture());
    const populated = lattice.populatedCoordinates().map(formatCoordinate);
    expect(populated).toEqual([
      "1.1.1/1.1.1/1.1.1",
      "1.1.1/1.1.1/1.1.2",
      "1.1.1/1.1.1/1.2.1",
    ]);
    expect(
      formatCoordinate(lattice.nextPopulated(coord("1.1.1/1.1.1/1.1.1"))!),
    ).toBe("1.1.1/1.1.1/1.1.2");
    expect(
      formatCoordinate(lattice.prevPopulated(coord("1.1.1/1.1.1/1.1.2"))!),
    ).toBe("1.1.1/1.1.1/1.1.1");
    expect(lattice.nextPopulated(coord("1.1.1/1.1.1/1.2.1"))).toBeUndefined();
    expect(lattice.prevPopulated(coord("1.1.1/1.1.1/1.1.1"))).toBeUndefined();
  });

  it("skips empty spans: leading, interior, and trailing breaks", () => {
    // Starts with two breaks (empty origin spans), an interior empty
    // scroll, and a trailing break: only "a" and "b" are materialized.
    const raw = Buffer.concat([
      Buffer.from([0x17, 0x17]),
      Buffer.from("a", "utf8"),
      Buffer.from([0x17, 0x17]),
      Buffer.from("b", "utf8"),
      Buffer.from([0x17]),
    ]);
    const lattice = PhextLattice.fromBuffer(raw);
    expect(lattice.populatedCoordinates().map(formatCoordinate)).toEqual([
      "1.1.1/1.1.1/1.1.3",
      "1.1.1/1.1.1/1.1.5",
    ]);
    expect(lattice.readScroll(coord("1.1.1/1.1.1/1.1.3"))).toBe("a");
    expect(lattice.readScroll(coord("1.1.1/1.1.1/1.1.5"))).toBe("b");
  });

  it("an empty buffer has no scrolls", () => {
    const lattice = PhextLattice.empty();
    expect(lattice.scrollCount()).toBe(0);
    expect(lattice.byteLength).toBe(0);
    expect(lattice.toPhextBytes().length).toBe(0);
  });
});

describe("lattice equivalence with the existing codec on CYOA", () => {
  const bytes = readFileSync(CYOA_PATH);
  const text = bytes.toString("utf8");

  it("finds the same populated coordinates with the same contents", () => {
    const lattice = PhextLattice.fromBuffer(bytes);
    // parsePhext keeps interior empty scrolls; the index materializes
    // only populated ones, so compare against the non-empty subset.
    const parsed = parsePhext(text).filter((scroll) => scroll.text !== "");
    expect(lattice.scrollCount()).toBe(parsed.length);
    expect(lattice.populatedCoordinates().map(formatCoordinate)).toEqual(
      parsed.map((scroll) => formatCoordinate(scroll.coordinate)),
    );
    for (const scroll of parsed) {
      expect(lattice.readScroll(scroll.coordinate)).toBe(scroll.text);
    }
  });

  it("reconstruction preserves the populated content, and is a fixed point", () => {
    const lattice = PhextLattice.fromBuffer(bytes);
    const rebuilt = lattice.toPhextBytes();
    const reparsed = parsePhext(rebuilt.toString("utf8")).filter(
      (scroll) => scroll.text !== "",
    );
    const expected = parsePhext(text).filter((scroll) => scroll.text !== "");
    expect(reparsed.map((s) => formatCoordinate(s.coordinate))).toEqual(
      expected.map((s) => formatCoordinate(s.coordinate)),
    );
    for (let i = 0; i < expected.length; i++) {
      expect(reparsed[i].text).toBe(expected[i].text);
    }
    // Rebuilding the rebuild changes nothing (byte-for-byte fixed point).
    const twice = PhextLattice.fromBuffer(rebuilt).toPhextBytes();
    expect(twice.equals(rebuilt)).toBe(true);
  });
});

describe("copy-on-write overlay (phext-lattice mmap.rs parity)", () => {
  const dir = mkdtempSync(join(tmpdir(), "phext-lattice-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("modify / insert / delete stay in the overlay until saved", () => {
    const lattice = PhextLattice.fromBuffer(rustFixture());
    const c1 = coord("1.1.1/1.1.1/1.1.1");
    expect(lattice.isDirty()).toBe(false);

    lattice.writeScroll(c1, "modified");
    expect(lattice.isDirty()).toBe(true);
    expect(lattice.pendingChanges()).toBe(1);
    expect(lattice.readScroll(c1)).toBe("modified");

    const far = coord("2.2.2/2.2.2/2.2.2");
    lattice.writeScroll(far, "new content");
    expect(lattice.hasScroll(far)).toBe(true);
    expect(lattice.scrollCount()).toBe(4);

    lattice.deleteScroll(coord("1.1.1/1.1.1/1.1.2"));
    expect(lattice.hasScroll(coord("1.1.1/1.1.1/1.1.2"))).toBe(false);
    expect(lattice.readScroll(coord("1.1.1/1.1.1/1.1.2"))).toBeUndefined();
    expect(lattice.scrollCount()).toBe(3);
  });

  it("save + reopen yields the merged state and clears the overlay", () => {
    const path = join(dir, "merged.phext");
    const lattice = PhextLattice.fromBuffer(rustFixture());
    lattice.writeScroll(coord("1.1.1/1.1.1/1.1.1"), "modified");
    lattice.writeScroll(coord("2.2.2/2.2.2/2.2.2"), "new content");
    lattice.deleteScroll(coord("1.1.1/1.1.1/1.1.2"));
    lattice.saveToFile(path);
    expect(lattice.isDirty()).toBe(false);
    expect(lattice.path).toBe(path);

    const reopened = PhextLattice.open(path);
    expect(reopened.readScroll(coord("1.1.1/1.1.1/1.1.1"))).toBe("modified");
    expect(reopened.readScroll(coord("2.2.2/2.2.2/2.2.2"))).toBe("new content");
    expect(reopened.hasScroll(coord("1.1.1/1.1.1/1.1.2"))).toBe(false);
    expect(readFileSync(path).equals(lattice.toPhextBytes())).toBe(true);
  });

  it("revert discards the overlay", () => {
    const lattice = PhextLattice.fromBuffer(rustFixture());
    const c1 = coord("1.1.1/1.1.1/1.1.1");
    lattice.writeScroll(c1, "modified");
    lattice.deleteScroll(coord("1.1.1/1.1.1/1.1.2"));
    lattice.revert();
    expect(lattice.isDirty()).toBe(false);
    expect(lattice.readScroll(c1)).toBe("hello");
    expect(lattice.readScroll(coord("1.1.1/1.1.1/1.1.2"))).toBe("world");
  });

  it("writing an empty string deletes; round-trips the Rust fixture byte-for-byte", () => {
    const original = rustFixture();
    const lattice = PhextLattice.fromBuffer(original);
    expect(lattice.toPhextBytes().equals(original)).toBe(true);

    const c1 = coord("1.1.1/1.1.1/1.1.1");
    lattice.writeScroll(c1, "");
    expect(lattice.hasScroll(c1)).toBe(false);
    expect(lattice.readScroll(c1)).toBeUndefined();
    expect(lattice.scrollCount()).toBe(2);
  });

  it("rejects break bytes in content and invalid coordinates", () => {
    const lattice = PhextLattice.empty();
    expect(() =>
      lattice.writeScroll(coord("1.1.1/1.1.1/1.1.1"), "bad\u0017break"),
    ).toThrow(/dimension break/);
    expect(() =>
      lattice.writeScroll(
        [0, 1, 1, 1, 1, 1, 1, 1, 1] as unknown as PhextCoordinate,
        "x",
      ),
    ).toThrow(/Invalid phext coordinate/);
  });
});
