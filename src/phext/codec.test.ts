import { describe, expect, it } from "vitest";
import { parsePhext, serializePhext } from "./codec";
import {
  applyBreak,
  breaksBetween,
  formatCoordinate,
  originCoordinate,
  parseCoordinate,
} from "./coordinate";

const SCROLL = "\x17";
const SECTION = "\x18";
const CHAPTER = "\x19";
const BOOK = "\x1a";
const VOLUME = "\x1c";
const COLLECTION = "\x1d";
const SERIES = "\x1e";
const SHELF = "\x1f";
const LIBRARY = "\x01";

const coords = (text: string) => parsePhext(text).map((s) => formatCoordinate(s.coordinate));
const texts = (text: string) => parsePhext(text).map((s) => s.text);

describe("phext coordinates", () => {
  it("formats and parses the canonical string form", () => {
    expect(formatCoordinate(originCoordinate())).toBe("1.1.1/1.1.1/1.1.1");
    expect(formatCoordinate(parseCoordinate("2.3.4/5.6.7/8.9.10"))).toBe(
      "2.3.4/5.6.7/8.9.10",
    );
    // Arm order: library.shelf.series / collection.volume.book / chapter.section.scroll
    const parsed = parseCoordinate("2.3.4/5.6.7/8.9.10");
    expect([...parsed]).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("enforces the 1-based floor by wrapping sub-floor components to 1", () => {
    expect(formatCoordinate(parseCoordinate("0.1.1/1.1.1/1.1.-2"))).toBe(
      "1.1.1/1.1.1/1.1.1",
    );
    expect(() => parseCoordinate("1.1/1.1.1/1.1.1")).toThrow();
    expect(() => parseCoordinate("a.b.c/d.e.f/g.h.i")).toThrow();
  });

  it("advances a break by incrementing its dimension and resetting lower ones", () => {
    const start = parseCoordinate("1.1.1/1.1.1/1.1.1");
    expect(formatCoordinate(applyBreak(start, 8))).toBe("1.1.1/1.1.1/1.1.2"); // scroll
    expect(formatCoordinate(applyBreak(start, 7))).toBe("1.1.1/1.1.1/1.2.1"); // section
    expect(formatCoordinate(applyBreak(start, 3))).toBe("1.1.1/2.1.1/1.1.1"); // collection
    expect(formatCoordinate(applyBreak(start, 0))).toBe("2.1.1/1.1.1/1.1.1"); // library
    const deep = parseCoordinate("1.1.1/1.1.1/3.4.5");
    expect(formatCoordinate(applyBreak(deep, 6))).toBe("1.1.1/1.1.1/4.1.1"); // chapter
  });

  it("emits breaks from the highest differing dimension down", () => {
    const from = originCoordinate();
    const to = parseCoordinate("1.1.1/1.1.1/1.2.3");
    expect(breaksBetween(from, to)).toBe(SECTION + SCROLL + SCROLL);
    expect(breaksBetween(from, parseCoordinate("2.1.1/1.1.1/1.1.1"))).toBe(LIBRARY);
    expect(() => breaksBetween(to, from)).toThrow();
  });
});

describe("phext codec", () => {
  it("treats delimiter-free text as a single scroll at the origin (plain text)", () => {
    const text = "Hello, world.\nSecond line stays in the same scroll.\n";
    expect(parsePhext(text)).toEqual([{ coordinate: originCoordinate(), text }]);
    expect(serializePhext(parsePhext(text))).toBe(text);
  });

  it("treats empty input as one empty scroll at the origin", () => {
    expect(parsePhext("")).toEqual([{ coordinate: originCoordinate(), text: "" }]);
    expect(serializePhext(parsePhext(""))).toBe("");
  });

  it("splits scrolls on scroll breaks in order", () => {
    const text = `one${SCROLL}two${SCROLL}three`;
    expect(texts(text)).toEqual(["one", "two", "three"]);
    expect(coords(text)).toEqual([
      "1.1.1/1.1.1/1.1.1",
      "1.1.1/1.1.1/1.1.2",
      "1.1.1/1.1.1/1.1.3",
    ]);
    expect(serializePhext(parsePhext(text))).toBe(text);
  });

  it("maps every dimension break to its coordinate component", () => {
    expect(coords(`a${SECTION}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "1.1.1/1.1.1/1.2.1"]);
    expect(coords(`a${CHAPTER}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "1.1.1/1.1.1/2.1.1"]);
    expect(coords(`a${BOOK}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "1.1.1/1.1.2/1.1.1"]);
    expect(coords(`a${VOLUME}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "1.1.1/1.2.1/1.1.1"]);
    expect(coords(`a${COLLECTION}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "1.1.1/2.1.1/1.1.1"]);
    expect(coords(`a${SERIES}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "1.1.2/1.1.1/1.1.1"]);
    expect(coords(`a${SHELF}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "1.2.1/1.1.1/1.1.1"]);
    expect(coords(`a${LIBRARY}b`)).toEqual(["1.1.1/1.1.1/1.1.1", "2.1.1/1.1.1/1.1.1"]);
  });

  it("keeps interior empty scrolls as addressed slots", () => {
    const text = `a${SCROLL}${SCROLL}b`;
    expect(texts(text)).toEqual(["a", "", "b"]);
    expect(coords(text)[1]).toBe("1.1.1/1.1.1/1.1.2");
    expect(serializePhext(parsePhext(text))).toBe(text);
  });

  it("preserves coordinate gaps across a round trip", () => {
    const scrolls = parsePhext(`a${SECTION}${SCROLL}b`);
    // The section break opens 1.2.1; the scroll break closes it empty, so
    // "b" lands at 1.2.2 and the empty slot at 1.2.1 is preserved.
    expect(texts(`a${SECTION}${SCROLL}b`)).toEqual(["a", "", "b"]);
    expect(coords(`a${SECTION}${SCROLL}b`)).toEqual([
      "1.1.1/1.1.1/1.1.1",
      "1.1.1/1.1.1/1.2.1",
      "1.1.1/1.1.1/1.2.2",
    ]);
    expect(serializePhext(scrolls)).toBe(`a${SECTION}${SCROLL}b`);
  });

  it("drops a trailing break, like the reference parsers", () => {
    expect(texts(`a${SCROLL}`)).toEqual(["a"]);
    expect(serializePhext(parsePhext(`a${SCROLL}`))).toBe("a");
  });

  it("round-trips a composite phext byte for byte", () => {
    const text =
      `Title scroll\nwith lines${SCROLL}second 😀 scroll${SECTION}new section` +
      `${CHAPTER}new chapter${SCROLL}${SCROLL}gap after empties${BOOK}new book` +
      `${LIBRARY}new library${SCROLL}last`;
    expect(serializePhext(parsePhext(text))).toBe(text);
    expect(coords(text)).toEqual([
      "1.1.1/1.1.1/1.1.1",
      "1.1.1/1.1.1/1.1.2",
      "1.1.1/1.1.1/1.2.1",
      "1.1.1/1.1.1/2.1.1",
      "1.1.1/1.1.1/2.1.2",
      "1.1.1/1.1.1/2.1.3",
      "1.1.1/1.1.2/1.1.1",
      "2.1.1/1.1.1/1.1.1",
      "2.1.1/1.1.1/1.1.2",
    ]);
  });

  it("serializes out-of-order scrolls in coordinate order", () => {
    const scrolls = [
      { coordinate: parseCoordinate("1.1.1/1.1.1/1.1.2"), text: "b" },
      { coordinate: originCoordinate(), text: "a" },
    ];
    expect(serializePhext(scrolls)).toBe(`a${SCROLL}b`);
  });

  it("rejects dimension breaks inside scroll text", () => {
    expect(() =>
      serializePhext([{ coordinate: originCoordinate(), text: `a${SCROLL}b` }]),
    ).toThrow(/dimension break/);
  });
});
