import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultPhextDocuments,
  openDefaultPhextDocument,
} from "./default-documents";

// Two scrolls: 1.1.1/1.1.1/1.1.1 and the next scroll coordinate.
const SAMPLE = "first scroll\u0017second scroll";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => text })),
  );
}

describe("bundled default phext documents", () => {
  it("ships exactly the CYOA and Incipit defaults, with distinct stable ids", () => {
    expect(defaultPhextDocuments.map((def) => def.title)).toEqual([
      "Choose Your Own Adventure",
      "Incipit",
    ]);
    expect(defaultPhextDocuments.map((def) => def.filename)).toEqual([
      "choose-your-own-adventure.phext",
      "incipit.phext",
    ]);
    expect(
      new Set(defaultPhextDocuments.map((def) => def.documentId)).size,
    ).toBe(2);
    for (const def of defaultPhextDocuments) expect(def.url).toBeTruthy();
  });

  it("converts with the stable document id and title on every open", async () => {
    stubFetch(SAMPLE);
    const def = defaultPhextDocuments[0];
    const first = await openDefaultPhextDocument(def);
    const second = await openDefaultPhextDocument(def);
    expect(first.id).toBe(def.documentId);
    expect(second.id).toBe(def.documentId);
    expect(first.metadata).toMatchObject({
      documentId: def.documentId,
      title: "Choose Your Own Adventure",
      phext: { version: 1, sourceFilename: "choose-your-own-adventure.phext" },
    });
    expect(first.children?.map((child) => child.id)).toEqual(
      second.children?.map((child) => child.id),
    );
    expect(new Set(first.children?.map((child) => child.id)).size).toBe(
      first.children?.length,
    );
    expect(first.children?.map((child) => child.text)).toEqual([
      "first scroll",
      "second scroll",
    ]);
  });

  it("reports a failed asset load instead of opening an empty document", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })),
    );
    await expect(
      openDefaultPhextDocument(defaultPhextDocuments[1]),
    ).rejects.toThrow(/incipit\.phext \(404\)/);
  });
});
