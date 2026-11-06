/**
 * Phext codec: parse phext text into ordered scrolls, serialize back.
 *
 * Parsing is one dead-reckoning pass over the text, mirroring the reference
 * parser (`parse_phext.py`) and libphext's `phokenize`: the first scroll sits
 * at the origin `1.1.1/1.1.1/1.1.1`, and each dimension break byte closes the
 * current scroll and advances the coordinate (increment that dimension, reset
 * all lower dimensions to 1). Interior empty scrolls are kept — they are real
 * addressed slots. One trailing empty scroll produced by a final break is
 * dropped, exactly as both reference implementations drop it: a phext that
 * ends with a break has no further scroll. Empty input is the one deliberate
 * deviation from the Python indexer (which returns no scrolls): here it is a
 * single empty scroll at the origin, so an empty file still maps to a
 * Document with one block.
 *
 * Serialization is byte-faithful for well-formed input:
 * `serializePhext(parsePhext(text)) === text` whenever `text` does not end
 * with a dimension break. Scrolls are emitted in coordinate order with the
 * minimal break sequence between them, so coordinate gaps survive a round
 * trip. Dimension breaks are ASCII control bytes (valid UTF-8), and scroll
 * text is ordinary UTF-8 text, so a conforming phext is valid UTF-8 as a
 * whole byte stream.
 */
import {
  applyBreak,
  breakLevel,
  breaksBetween,
  compareCoordinates,
  coordinatesEqual,
  formatCoordinate,
  isDimensionBreakByte,
  originCoordinate,
  type PhextCoordinate,
} from "./coordinate";

export interface PositionedScroll {
  coordinate: PhextCoordinate;
  text: string;
}

/** Parse phext text into its scrolls, in coordinate (document) order. */
export function parsePhext(text: string): PositionedScroll[] {
  const scrolls: PositionedScroll[] = [];
  let coordinate = originCoordinate();
  let start = 0;
  // Dimension breaks are single UTF-16 code units below 0x20; surrogate
  // halves are >= 0xD800, so a code-unit scan can never split a character.
  for (let index = 0; index < text.length; index++) {
    const level = breakLevel(text.charCodeAt(index));
    if (level === undefined) continue;
    scrolls.push({ coordinate, text: text.slice(start, index) });
    coordinate = applyBreak(coordinate, level);
    start = index + 1;
  }
  scrolls.push({ coordinate, text: text.slice(start) });
  // Drop the trailing empty scroll a final break produces, but keep the
  // single empty scroll that is an empty input's whole content.
  if (scrolls.length > 1 && scrolls[scrolls.length - 1].text === "") {
    scrolls.pop();
  }
  return scrolls;
}

function assertNoBreaks(scroll: PositionedScroll): void {
  for (let index = 0; index < scroll.text.length; index++) {
    if (isDimensionBreakByte(scroll.text.charCodeAt(index))) {
      throw new Error(
        `Scroll ${formatCoordinate(scroll.coordinate)} contains a phext dimension break; ` +
          "breaks are structure, not scroll text, and cannot be serialized inside a scroll.",
      );
    }
  }
}

/**
 * Serialize scrolls back to phext text. Input may arrive in any order; it is
 * sorted by coordinate, duplicate coordinates resolve to the last scroll
 * given (the same insert-wins behaviour as libphext's `explode`), and a
 * trailing run of empty scrolls is canonicalized away, matching the parser.
 */
export function serializePhext(scrolls: readonly PositionedScroll[]): string {
  const ordered = [...scrolls].sort((a, b) =>
    compareCoordinates(a.coordinate, b.coordinate),
  );
  const deduped: PositionedScroll[] = [];
  for (const scroll of ordered) {
    const previous = deduped[deduped.length - 1];
    if (previous && coordinatesEqual(previous.coordinate, scroll.coordinate)) {
      deduped[deduped.length - 1] = scroll;
    } else {
      deduped.push(scroll);
    }
  }
  while (deduped.length > 1 && deduped[deduped.length - 1].text === "") {
    deduped.pop();
  }
  let current = originCoordinate();
  let output = "";
  for (const scroll of deduped) {
    assertNoBreaks(scroll);
    output += breaksBetween(current, scroll.coordinate);
    output += scroll.text;
    current = scroll.coordinate;
  }
  return output;
}
