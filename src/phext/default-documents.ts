/**
 * The phext documents the hosted demo offers by default: Will's canonical
 * Choose Your Own Adventure and Incipit phexts, shipped as assets under
 * `src/assets/hosted/phext/` and imported by URL (the same `?url` pattern
 * as the hosted demo assets), so the payloads travel with the built site
 * byte-for-byte and are fetched only when a visitor opens one.
 *
 * Opening a default converts the phext at runtime with the usual
 * `phextToDocument` mapping, then re-stamps it with a stable document id
 * (and deterministic per-scroll block ids derived from it). A default is
 * therefore the same Document every time it is opened, appears only via
 * its explicit menu entry, and is never written to any store — a visitor's
 * own documents and edits are untouched unless they deliberately save the
 * opened copy themselves, exactly like Open Phext… with a local file.
 */
import type { ExistingBlockDto } from "../block-tree/types";
import { phextToDocument } from "./document";
import chooseYourOwnAdventureUrl from "../assets/hosted/phext/choose-your-own-adventure.phext?url";
import incipitUrl from "../assets/hosted/phext/incipit.phext?url";

export interface DefaultPhextDocument {
  title: string;
  filename: string;
  /** Stable id of the converted Document; per-scroll ids derive from it. */
  documentId: string;
  url: string;
}

export const defaultPhextDocuments: DefaultPhextDocument[] = [
  {
    title: "Choose Your Own Adventure",
    filename: "choose-your-own-adventure.phext",
    documentId: "c70a0000-0000-4000-8000-000000000000",
    url: chooseYourOwnAdventureUrl,
  },
  {
    title: "Incipit",
    filename: "incipit.phext",
    documentId: "111c1917-0000-4000-8000-000000000000",
    url: incipitUrl,
  },
];

function withStableIds(
  document: ExistingBlockDto,
  def: DefaultPhextDocument,
): ExistingBlockDto {
  const stem = def.documentId.slice(0, 24); // "xxxxxxxx-xxxx-xxxx-xxxx-"
  const suffix = (n: number) => `${stem}${n.toString(16).padStart(12, "0")}`;
  const metadata = document.metadata as Record<string, unknown> | undefined;
  return {
    ...document,
    id: def.documentId,
    metadata: { ...metadata, documentId: def.documentId, title: def.title },
    children: (document.children ?? []).map((child, index) => ({
      ...child,
      id: suffix(index + 1),
    })),
  };
}

/** Fetch a bundled phext and convert it to its (stable-id) Document. */
export async function openDefaultPhextDocument(
  def: DefaultPhextDocument,
): Promise<ExistingBlockDto> {
  const response = await fetch(def.url);
  if (!response.ok) {
    throw Error(`Could not load the bundled phext ${def.filename} (${response.status})`);
  }
  return withStableIds(phextToDocument(await response.text(), def.filename), def);
}
