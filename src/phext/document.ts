/**
 * Mapping between a phext and Mutable's canonical Document model.
 *
 * One phext is one Document (`document-block`). One scroll is one TextBlock
 * (`plain-text-block`, the same block type upstream's codec tests round-trip)
 * whose `metadata.phextCoordinate` carries its 9D coordinate string. The
 * Document's own metadata carries `phext: { version, sourceFilename }` so a
 * later export can suggest the original filename. Phext import and export are
 * explicit file actions only — nothing here runs on the typing path, scans a
 * vault, or saves in the background.
 *
 * Export walks the Document depth-first in authored order and collects every
 * Block with string `text`. A Block with a valid `metadata.phextCoordinate`
 * keeps its coordinate; other text Blocks are assigned the next scroll
 * coordinate in sequence. Non-text Blocks (images, containers' own payloads,
 * widgets) have no phext representation and are omitted from the export —
 * phext is a text format, so exporting a rich Document to phext is a
 * deliberate, lossy projection of its text, never a replacement for saving
 * the Document itself as Mutable JSON.
 */
import type { ExistingBlockDto } from "../block-tree/types";
import { parsePhext, serializePhext, type PositionedScroll } from "./codec";
import {
  formatCoordinate,
  nextScroll,
  originCoordinate,
  parseCoordinate,
  type PhextCoordinate,
} from "./coordinate";

export interface PhextDocumentMetadata {
  version: 1;
  sourceFilename?: string;
}

function blockCoordinate(block: ExistingBlockDto): PhextCoordinate | undefined {
  const metadata = block.metadata as { phextCoordinate?: unknown } | undefined;
  if (typeof metadata?.phextCoordinate !== "string") return undefined;
  try {
    return parseCoordinate(metadata.phextCoordinate);
  } catch {
    return undefined;
  }
}

function titleFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.phext$/i, "") || "Untitled phext";
}

/** Parse phext text into a Mutable Document DTO with one TextBlock per scroll. */
export function phextToDocument(text: string, filename: string): ExistingBlockDto {
  const scrolls = parsePhext(text);
  const id = crypto.randomUUID();
  const children: ExistingBlockDto[] = scrolls.map((scroll) => ({
    id: crypto.randomUUID(),
    type: "plain-text-block",
    text: scroll.text,
    metadata: { phextCoordinate: formatCoordinate(scroll.coordinate) },
  }));
  return {
    id,
    type: "document-block",
    metadata: {
      documentId: id,
      title: titleFromFilename(filename),
      phext: { version: 1, sourceFilename: filename } satisfies PhextDocumentMetadata,
    },
    children,
  };
}

function collectTextBlocks(
  block: ExistingBlockDto,
  into: ExistingBlockDto[],
): void {
  if (typeof (block as { text?: unknown }).text === "string") into.push(block);
  for (const child of block.children ?? []) collectTextBlocks(child, into);
}

/** Serialize a Mutable Document DTO back to phext text (text Blocks only). */
export function documentToPhext(document: ExistingBlockDto): string {
  const blocks: ExistingBlockDto[] = [];
  // The Document root itself is a container, never a scroll.
  for (const child of document.children ?? []) collectTextBlocks(child, blocks);
  const scrolls: PositionedScroll[] = [];
  let cursor = originCoordinate();
  for (const block of blocks) {
    const coordinate = blockCoordinate(block) ?? cursor;
    scrolls.push({ coordinate, text: (block as { text: string }).text });
    cursor = nextScroll(coordinate);
  }
  if (!scrolls.length) scrolls.push({ coordinate: originCoordinate(), text: "" });
  return serializePhext(scrolls);
}

/** The filename a phext export of this Document should suggest. */
export function phextFilenameFor(document: ExistingBlockDto): string {
  const metadata = document.metadata as
    | { title?: unknown; phext?: PhextDocumentMetadata }
    | undefined;
  if (typeof metadata?.phext?.sourceFilename === "string" && metadata.phext.sourceFilename) {
    return metadata.phext.sourceFilename;
  }
  const title = typeof metadata?.title === "string" && metadata.title ? metadata.title : "Document";
  const stem = title.replace(/[\\/:*?"<>|]/g, "-").trim() || "Document";
  return /\.phext$/i.test(stem) ? stem : `${stem}.phext`;
}
