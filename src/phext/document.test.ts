import { describe, expect, it } from "vitest";
import { decodeDocument, encodeDocument } from "../block-tree/codecs";
import type { ExistingBlockDto } from "../block-tree/types";
import { documentToPhext, phextFilenameFor, phextToDocument } from "./document";

const SCROLL = "\x17";
const SECTION = "\x18";
const BOOK = "\x1a";

describe("phext Document mapping", () => {
  it("maps one phext to one Document with one TextBlock per scroll", () => {
    const document = phextToDocument(`one${SCROLL}two${SECTION}three`, "notes.phext");
    expect(document.type).toBe("document-block");
    expect(document.children).toHaveLength(3);
    expect(document.children?.map((child) => child.type)).toEqual([
      "plain-text-block",
      "plain-text-block",
      "plain-text-block",
    ]);
    expect(document.children?.map((child) => (child as { text: string }).text)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(
      document.children?.map(
        (child) => (child.metadata as { phextCoordinate: string }).phextCoordinate,
      ),
    ).toEqual(["1.1.1/1.1.1/1.1.1", "1.1.1/1.1.1/1.1.2", "1.1.1/1.1.1/1.2.1"]);
    const metadata = document.metadata as { title: string; phext: { sourceFilename: string } };
    expect(metadata.title).toBe("notes");
    expect(metadata.phext.sourceFilename).toBe("notes.phext");
  });

  it("produces Documents the canonical codec accepts and round-trips", () => {
    const document = phextToDocument(`alpha${SCROLL}${SCROLL}gamma${BOOK}delta`, "x.phext");
    const decoded = decodeDocument(document);
    expect(encodeDocument(decoded.state)).toEqual(document);
  });

  it("round-trips phext -> Document -> phext byte for byte", () => {
    const samples = [
      "plain text, one scroll",
      "",
      `a${SCROLL}b${SECTION}c`,
      `a${SCROLL}${SCROLL}b${BOOK}c${SCROLL}d`,
    ];
    for (const sample of samples) {
      expect(documentToPhext(phextToDocument(sample, "round.phext"))).toBe(sample);
    }
  });

  it("keeps coordinates after an in-app edit of one scroll's text", () => {
    const document = phextToDocument(`one${SECTION}two`, "edit.phext");
    (document.children![1] as { text: string }).text = "TWO";
    expect(documentToPhext(document)).toBe(`one${SECTION}TWO`);
  });

  it("assigns sequential scroll coordinates to Documents without phext metadata", () => {
    const document: ExistingBlockDto = {
      id: "doc",
      type: "document-block",
      metadata: { title: "Ordinary" },
      children: [
        { id: "a", type: "plain-text-block", text: "first" },
        { id: "b", type: "standoff-editor-block", text: "second" },
        { id: "c", type: "image-block", metadata: { url: "x.png" } },
        {
          id: "d",
          type: "container-block",
          children: [{ id: "e", type: "plain-text-block", text: "nested third" }],
        },
      ],
    };
    expect(documentToPhext(document)).toBe(
      `first${SCROLL}second${SCROLL}nested third`,
    );
    expect(phextFilenameFor(document)).toBe("Ordinary.phext");
  });

  it("suggests the source filename for re-export", () => {
    const document = phextToDocument("hello", "my scrolls.phext");
    expect(phextFilenameFor(document)).toBe("my scrolls.phext");
  });
});
