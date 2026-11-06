/**
 * Phext 9D coordinates.
 *
 * A phext coordinate addresses one scroll inside one phext file. It has nine
 * components in three arms, written `library.shelf.series/collection.volume.book/chapter.section.scroll`
 * (for example `1.1.1/1.1.1/1.1.1`). Components are 1-based: no component may
 * be less than 1 (the coordinate floor). Ordering is lexicographic over the
 * tuple in the order above, library most significant.
 *
 * A dimension break byte inside phext text advances its component and resets
 * every lower component to 1. The break bytes, highest dimension first:
 *
 *   library 0x01, shelf 0x1F, series 0x1E, collection 0x1D, volume 0x1C,
 *   book 0x1A, chapter 0x19, section 0x18, scroll 0x17
 *
 * (0x1B is not a break; line breaks 0x0A stay inside a scroll.) This matches
 * libphext (phext.rs) and the reference dead-reckoning parser.
 */

/** Component names in tuple order, most significant first. */
export const DIMENSION_NAMES = [
  "library",
  "shelf",
  "series",
  "collection",
  "volume",
  "book",
  "chapter",
  "section",
  "scroll",
] as const;

export type DimensionName = (typeof DIMENSION_NAMES)[number];

/** Dimension break bytes, parallel to {@link DIMENSION_NAMES}. */
export const DIMENSION_BREAK_BYTES: readonly number[] = [
  0x01, // library
  0x1f, // shelf
  0x1e, // series
  0x1d, // collection
  0x1c, // volume
  0x1a, // book
  0x19, // chapter
  0x18, // section
  0x17, // scroll
];

/** Level index of the scroll dimension (the lowest). */
export const SCROLL_LEVEL = 8;

/** A 9-component phext coordinate, in {@link DIMENSION_NAMES} order. */
export type PhextCoordinate = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const BREAK_LEVEL_BY_BYTE = new Map<number, number>(
  DIMENSION_BREAK_BYTES.map((byte, level) => [byte, level]),
);

/** The first scroll of every phext: `1.1.1/1.1.1/1.1.1`. */
export function originCoordinate(): PhextCoordinate {
  return [1, 1, 1, 1, 1, 1, 1, 1, 1];
}

/** True when `byte` is one of the nine dimension break bytes. */
export function isDimensionBreakByte(byte: number): boolean {
  return BREAK_LEVEL_BY_BYTE.has(byte);
}

/** The level a break byte advances, or undefined for ordinary bytes. */
export function breakLevel(byte: number): number | undefined {
  return BREAK_LEVEL_BY_BYTE.get(byte);
}

/** The break byte for a level (0 = library … 8 = scroll). */
export function breakByte(level: number): number {
  const byte = DIMENSION_BREAK_BYTES[level];
  if (byte === undefined) throw new Error(`Unknown phext dimension level: ${level}`);
  return byte;
}

/** True when every component is an integer at or above the floor of 1. */
export function isValidCoordinate(coordinate: PhextCoordinate): boolean {
  return (
    coordinate.length === 9 &&
    coordinate.every((value) => Number.isInteger(value) && value >= 1)
  );
}

/** Canonical string form: `library.shelf.series/collection.volume.book/chapter.section.scroll`. */
export function formatCoordinate(coordinate: PhextCoordinate): string {
  const [library, shelf, series, collection, volume, book, chapter, section, scroll] =
    coordinate;
  return `${library}.${shelf}.${series}/${collection}.${volume}.${book}/${chapter}.${section}.${scroll}`;
}

/**
 * Parse the canonical string form. Component values below the floor of 1 are
 * undefined behaviour for a phext coordinate; following libphext-node, they
 * are wrapped to 1 rather than emitted or held. Malformed strings throw.
 */
export function parseCoordinate(text: string): PhextCoordinate {
  const arms = text.split("/");
  if (arms.length !== 3) {
    throw new Error(
      `Phext coordinates are of the form LB.SF.SR/CN.VM.BK/CH.SN.SC; got "${text}".`,
    );
  }
  const components: number[] = [];
  for (const arm of arms) {
    const parts = arm.split(".");
    if (parts.length !== 3) {
      throw new Error(
        `Phext coordinates are of the form LB.SF.SR/CN.VM.BK/CH.SN.SC; got "${text}".`,
      );
    }
    for (const part of parts) {
      if (!/^-?\d+$/.test(part)) {
        throw new Error(`Phext coordinate component is not an integer: "${part}".`);
      }
      const value = Number.parseInt(part, 10);
      components.push(value < 1 ? 1 : value);
    }
  }
  return components as unknown as PhextCoordinate;
}

/** Lexicographic order over the tuple, library most significant. */
export function compareCoordinates(a: PhextCoordinate, b: PhextCoordinate): number {
  for (let level = 0; level < 9; level++) {
    if (a[level] !== b[level]) return a[level] < b[level] ? -1 : 1;
  }
  return 0;
}

export function coordinatesEqual(a: PhextCoordinate, b: PhextCoordinate): boolean {
  return compareCoordinates(a, b) === 0;
}

/**
 * Advance across one dimension break: increment that level's component and
 * reset every lower component to 1. This is what a break byte does to the
 * coordinate of the text that follows it.
 */
export function applyBreak(coordinate: PhextCoordinate, level: number): PhextCoordinate {
  if (level < 0 || level > SCROLL_LEVEL) {
    throw new Error(`Unknown phext dimension level: ${level}`);
  }
  const next = [...coordinate];
  next[level] += 1;
  for (let lower = level + 1; lower < 9; lower++) next[lower] = 1;
  return next as unknown as PhextCoordinate;
}

/** The coordinate after a scroll break (next scroll, same section). */
export function nextScroll(coordinate: PhextCoordinate): PhextCoordinate {
  return applyBreak(coordinate, SCROLL_LEVEL);
}

/**
 * The break bytes that move `from` to `to`, highest dimension first — the
 * same emission order libphext uses when it serializes (`append_scroll`).
 * Throws when `to` orders before `from`, since breaks only move forward.
 */
export function breaksBetween(from: PhextCoordinate, to: PhextCoordinate): string {
  if (compareCoordinates(to, from) < 0) {
    throw new Error(
      `Cannot serialize phext coordinate ${formatCoordinate(to)} after ${formatCoordinate(from)}: dimension breaks only move forward.`,
    );
  }
  let current = from;
  let breaks = "";
  while (!coordinatesEqual(current, to)) {
    for (let level = 0; level < 9; level++) {
      if (current[level] < to[level]) {
        breaks += String.fromCharCode(breakByte(level));
        current = applyBreak(current, level);
        break;
      }
    }
  }
  return breaks;
}
