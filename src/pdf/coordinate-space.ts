/**
 * Coordinate spaces for extracted PDF content.
 *
 * A phext address has nine components, written as three triples:
 *
 *     d1.d2.d3 / page.region.cell / line.column.span
 *
 * For PDF extraction the components mean:
 *
 * - `d1.d2.d3` — the document identity triple, derived from the document
 *   identity string (for a retained capture, its asset id) by the FNV-1a
 *   scheme documented on `documentTriple`. The triple is a namespace, not
 *   a proof of identity: provenance carries the full identity string.
 * - `page` — the 1-based page number. Every page is its own coordinate
 *   space; the page frame (media box and rotation) is stored explicitly
 *   on the page extraction, so orientation is data, never assumed.
 * - `region` — the layout-block space within the page. Region 0 is the
 *   whole-page space; layout blocks occupy regions `ordinal + 1`, where
 *   `ordinal` is the block's 0-based reading-order index on the page.
 * - `cell` — the table-cell space within a region. Cell 0 is the whole
 *   region; table cells occupy `index + 1`, row-major, 0-based `index`.
 * - `line` / `column` — free dimensions inside the region: the 1-based
 *   line and UTF-16 column of the addressed range's start within the
 *   page text (offsets follow the repository's `offsetUnit: 'utf16'`).
 * - `span` — the length of the addressed range, in UTF-16 code units.
 *
 * Placement carries no sequence: an address names where a scroll sits in
 * the page's coordinate space, not when it is read. Reading order is
 * recorded as data (each block's `ordinal`), so a page whose regions are
 * addressed out of stream order — region 12 before region 3 — is still
 * fully placed; assembly order is the consumer's choice.
 *
 * Geometry lives in the repository's PDF frame: the page viewBox
 * `[x0, y0, x1, y1]` with a bottom-left origin and y increasing upwards
 * (the pdf.js convention used by `pdfText`). Bounding boxes in this
 * module are `[x, y, width, height]` with `y` the bottom edge. Extraction
 * engines that report top-left-origin geometry (LiteParse does) are
 * converted at projection time by `fromTopLeftBox`; everything inside
 * the lattice only ever sees the repository frame.
 */

/** The nine components of a phext address, in order. */
export type PhextAddress = readonly [number, number, number, number, number, number, number, number, number];

/** A rectangle in the repository PDF frame: `[x, y, width, height]`, y = bottom edge. */
export type PageBox = readonly [number, number, number, number];

/** The explicit frame of one page's coordinate space. */
export interface PageFrame {
  viewBox: readonly [number, number, number, number];
  rotation: number;
}

/** Geometry of one layout block (region) on a page. */
export interface RegionGeometry {
  ordinal: number;
  range: { start: number; end: number };
  bbox: PageBox;
  cells?: ReadonlyArray<{ range: { start: number; end: number }; bbox: PageBox }>;
}

/** Geometry of one page: its frame, its text, and its regions. */
export interface PageGeometry {
  pageIndex: number;
  frame: PageFrame;
  text: string;
  blocks: readonly RegionGeometry[];
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit over the UTF-8 encoding of `text`. */
export function fnv1a(text: string): number {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The document identity triple: for n = 1, 2, 3, the FNV-1a hash of
 * `${identity}#${n}`, reduced modulo 999 into the range 1..999 (phext
 * components are 1-based). Deterministic for a given identity string;
 * two different identities can share a triple, which is why provenance
 * always carries the identity itself.
 */
export function documentTriple(identity: string): readonly [number, number, number] {
  const component = (n: number) => (fnv1a(`${identity}#${n}`) % 999) + 1;
  return [component(1), component(2), component(3)];
}

/** Line/column (both 1-based) of `offset` within `text`; column counts UTF-16 code units. */
function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function rangeAddress(
  identity: string,
  page: PageGeometry,
  region: number,
  cell: number,
  range: { start: number; end: number },
): PhextAddress {
  const [d1, d2, d3] = documentTriple(identity);
  const { line, column } = lineColumn(page.text, range.start);
  return [d1, d2, d3, page.pageIndex + 1, region, cell, line, column, range.end - range.start];
}

/** The address of a page's whole-page space (region 0, cell 0). */
export function pageAddress(identity: string, page: PageGeometry): PhextAddress {
  return rangeAddress(identity, page, 0, 0, { start: 0, end: page.text.length });
}

/** The address of one layout block: region `ordinal + 1`, cell 0. */
export function blockAddress(identity: string, page: PageGeometry, block: RegionGeometry): PhextAddress {
  return rangeAddress(identity, page, block.ordinal + 1, 0, block.range);
}

/** The address of one table cell: region `ordinal + 1`, cell `index + 1`. */
export function cellAddress(
  identity: string,
  page: PageGeometry,
  block: RegionGeometry,
  cellIndex: number,
): PhextAddress {
  const cell = block.cells?.[cellIndex];
  if (!cell) throw Error(`No cell ${cellIndex} in region ${block.ordinal}`);
  return rangeAddress(identity, page, block.ordinal + 1, cellIndex + 1, cell.range);
}

/**
 * Convert a top-left-origin box (`y` = top edge, as LiteParse reports)
 * into the repository frame (`y` = bottom edge) for a page whose frame
 * is `frame`. Pure geometry; rotation is frame data and does not change
 * the stored box — consumers read it from the frame.
 */
export function fromTopLeftBox(frame: PageFrame, box: { x: number; y: number; width: number; height: number }): PageBox {
  const [x0, , , y1] = frame.viewBox;
  return [x0 + box.x, y1 - box.y - box.height, box.width, box.height];
}

/** The repository-frame box of a top-left-origin point's containing region, if any. */
function contains(box: PageBox, x: number, y: number): boolean {
  return x >= box[0] && x <= box[0] + box[2] && y >= box[1] && y <= box[1] + box[3];
}

/**
 * The address of the smallest coordinate space containing the point
 * `(x, y)` (repository frame): a table cell if the point falls in one,
 * else its layout block, else the whole-page space. Line/column/span
 * describe the containing space's own range — a point has no character
 * offset until it is resolved against text.
 */
export function addressForPoint(identity: string, page: PageGeometry, x: number, y: number): PhextAddress {
  let best: RegionGeometry | undefined;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const block of page.blocks) {
    if (!contains(block.bbox, x, y)) continue;
    const area = block.bbox[2] * block.bbox[3];
    if (area < bestArea) {
      best = block;
      bestArea = area;
    }
  }
  if (!best) return pageAddress(identity, page);
  if (best.cells) {
    for (let i = 0; i < best.cells.length; i++) {
      if (contains(best.cells[i].bbox, x, y)) return cellAddress(identity, page, best, i);
    }
  }
  return blockAddress(identity, page, best);
}

/**
 * The geometry an address occupies on its page: the page rectangle for
 * region 0, the block's box for a region, the cell's box for a cell.
 * Returns undefined when the address names a different page or a
 * region/cell the page does not have. Line/column/span refine a range
 * inside the region; the returned box is the region's, because a text
 * range's exact ink box is a property of the text layer, not the frame.
 */
export function geometryForAddress(page: PageGeometry, address: PhextAddress): PageBox | undefined {
  const [, , , pageNumber, region, cell] = address;
  if (pageNumber !== page.pageIndex + 1) return undefined;
  if (region === 0) {
    const [x0, y0, x1, y1] = page.frame.viewBox;
    return [x0, y0, x1 - x0, y1 - y0];
  }
  const block = page.blocks.find((b) => b.ordinal === region - 1);
  if (!block) return undefined;
  if (cell === 0) return block.bbox;
  return block.cells?.[cell - 1]?.bbox;
}

/** The canonical text form: `d1.d2.d3/page.region.cell/line.column.span`. */
export function formatAddress(address: PhextAddress): string {
  const [d1, d2, d3, page, region, cell, line, column, span] = address;
  return `${d1}.${d2}.${d3}/${page}.${region}.${cell}/${line}.${column}.${span}`;
}

/** Parse the canonical text form. Document, page, line and column are
 * 1-based; region and cell may be 0 (the whole-page / whole-region spaces)
 * and span may be 0 (an empty range). */
export function parseAddress(text: string): PhextAddress {
  const match = /^(\d+)\.(\d+)\.(\d+)\/(\d+)\.(\d+)\.(\d+)\/(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!match) throw Error(`Invalid phext address: ${text}`);
  const parts = match.slice(1).map(Number);
  const minimums = [1, 1, 1, 1, 0, 0, 1, 1, 0];
  if (parts.some((n, i) => !Number.isSafeInteger(n) || n < minimums[i])) {
    throw Error(`Invalid phext address: ${text}`);
  }
  return parts as unknown as PhextAddress;
}
