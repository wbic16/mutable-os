import express from "express";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentStoreRouter } from "./document-store";
import { promises as vfs } from "./phext-fs.mjs";
import { testCavern } from "../src/knowledge-sqlite/phext-test-cavern.mjs";

describe("document store HTTP routes", () => {
  let root: string, outside: string, base: string, server: Server, cavern: { close(): void };
  const indexDocument = vi.fn();
  const document = { id: "original-id", type: "main-list-block", unknown: { retained: true }, children: [{ type: "standoff-editor-block", text: "Hello 🌈", standoffProperties: [{ type: "style/bold", start: 0, end: 3 }], relation: { leftMargin: { type: "left-margin-block", children: [{ type: "plain-text-block", text: "Note" }] } } }] };
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "speedy-store-test-"));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "speedy-store-outside-"));
    cavern = testCavern(root);
    await vfs.mkdir(path.join(root, "archive", "nested"), { recursive: true });
    await vfs.mkdir(path.join(root, "empty"));
    await vfs.writeFile(path.join(root, "archive", "nested", "Original.json"), JSON.stringify(document));
    await vfs.writeFile(path.join(root, "ignore.txt"), "Not a document");
    indexDocument.mockReset(); indexDocument.mockResolvedValue(undefined);
    const app = express(); app.use(express.json()); app.use("/api", createDocumentStoreRouter({ root, indexDocument }));
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  });
  afterEach(async () => {
    try { cavern.close(); } catch { /* closed */ }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });
  const save = (filename: string, dto: unknown = document, headers: Record<string, string> = {}) => fetch(`${base}/saveDocumentJson`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Speedy-Revision": "7", ...headers },
    body: JSON.stringify({ folder: "archive/nested", filename, document: dto }),
  });

  it("lists immediate folders and JSON documents, including root and empty folders", async () => {
    expect(await (await fetch(`${base}/listFolders`)).json()).toEqual({ folders: ["archive", "empty"] });
    expect(await (await fetch(`${base}/listFolders?folder=archive`)).json()).toEqual({ folders: ["nested"] });
    expect(await (await fetch(`${base}/listDocuments?folder=archive%2Fnested`)).json()).toEqual({ files: ["Original.json"] });
    expect(await (await fetch(`${base}/listDocuments?folder=.`)).json()).toEqual({ files: [] });
    expect(await (await fetch(`${base}/listDocuments?folder=empty`)).json()).toEqual({ files: [] });
  });
  it("saves and reloads legacy data with revision acknowledgement and no temporary files", async () => {
    const response = await save("New document.json");
    expect(response.headers.get("X-Speedy-Revision")).toBe("7");
    expect(await response.json()).toEqual({ Success: true });
    expect(JSON.parse(await vfs.readFile(path.join(root, "archive", "nested", "New document.json"), "utf8"))).toEqual(document);
    const loaded = await (await fetch(`${base}/loadDocumentJson?folder=archive%2Fnested&filename=New+document.json`)).json();
    expect(loaded.Data.document).toEqual({ ...document, metadata: { filename: "New document.json" } });
    expect((await vfs.readdir(path.join(root, "archive", "nested"))).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
  it("lists all JSON names alongside Ink without inspecting content or requiring native suffixes", async () => {
    const names = ['Chapter.json', 'NOTES.JSON', 'Native.mutable.json', 'Screen.ink', 'Artwork.phosphor', 'Unknown.json', 'Broken.json'];
    for (const name of names) await vfs.writeFile(path.join(root, name), name === 'Broken.json' ? '{' : name === 'Unknown.json' ? '{}' : JSON.stringify(document));
    await vfs.writeFile(path.join(root, 'Screen.ink.md'), 'Derived projection');
    await vfs.writeFile(path.join(root, 'Artwork.phosphor.md'), 'Derived projection');
    await vfs.mkdir(path.join(root, 'folder.json'));
    const listing = await (await fetch(`${base}/listDocuments?folder=.`)).json();
    expect(listing.files.sort()).toEqual(names.sort());
    const opened = await (await fetch(`${base}/loadDocumentJson?folder=.&filename=Chapter.json`)).json();
    expect(opened.Success).toBe(true);
    expect(opened.Data.document.id).toBe(document.id);
  });
  it("does not overwrite existing files during conditional creation, including racing saves", async () => {
    const responses = await Promise.all([save("Copy.json", document, { "If-None-Match": "*" }), save("Copy.json", document, { "If-None-Match": "*" })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const blocked = await save("Original.json", { type: "document-block", text: "Changed" }, { "If-None-Match": "*" });
    expect(blocked.status).toBe(409);
    expect(JSON.parse(await vfs.readFile(path.join(root, "archive", "nested", "Original.json"), "utf8"))).toEqual(document);
  });
  it("reports successful file storage separately from a failed search index", async () => {
    indexDocument.mockRejectedValueOnce(new Error("Database offline"));
    const response = await save("Saved.json");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ Success: true, Warning: expect.stringContaining("search index") });
    expect(JSON.parse(await vfs.readFile(path.join(root, "archive", "nested", "Saved.json"), "utf8"))).toEqual(document);
  });
  it("rejects traversal, invalid filenames, and symlinks leading outside the store", async () => {
    await fs.writeFile(path.join(outside, "Private.json"), JSON.stringify(document));
    await fs.symlink(outside, path.join(root, "escape"));
    await fs.mkdir(path.join(root, "archive", "nested"), { recursive: true }); // real parents for the disk symlink only; the store's own tree is virtual
    await fs.symlink(path.join(outside, "Private.json"), path.join(root, "archive", "nested", "Link.json"));
    expect((await fetch(`${base}/listFolders?folder=..`)).status).toBe(400);
    // 'escape' is a disk symlink only: in the phext it is a missing
    // folder (404) — the outside tree is unreachable, never listed
    // or read through the link.
    expect((await fetch(`${base}/listDocuments?folder=escape`)).status).toBe(404);
    expect((await fetch(`${base}/loadDocumentJson?folder=escape&filename=Private.json`)).status).toBe(404);
    expect((await save("../../Private.json")).status).toBe(400);
    expect((await save("NotJson.txt")).status).toBe(400);
    // Phext-only: 'Link.json' exists only as a disk symlink — the
    // store writes its own phext file and never follows the link;
    // the disk target is untouched (asserted below).
    expect((await save("Link.json")).status).toBe(200);
    expect(JSON.parse(await fs.readFile(path.join(outside, "Private.json"), "utf8"))).toEqual(document);
  });
  it("reports missing and malformed files and rejects invalid documents before writing", async () => {
    expect((await fetch(`${base}/listDocuments?folder=missing`)).status).toBe(404);
    expect((await fetch(`${base}/loadDocumentJson?folder=.&filename=Missing.json`)).status).toBe(404);
    await vfs.writeFile(path.join(root, "Broken.json"), "{");
    expect((await fetch(`${base}/loadDocumentJson?folder=.&filename=Broken.json`)).status).toBe(422);
    expect((await save("Original.json", { type: "document-block", children: "invalid" })).status).toBe(400);
    expect(JSON.parse(await vfs.readFile(path.join(root, "archive", "nested", "Original.json"), "utf8"))).toEqual(document);
  });
  it("keeps listing and opening available while rejecting writes in read-only hosted mode", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const app = express(); app.use(express.json()); app.use("/api", createDocumentStoreRouter({ root, readOnly: true }));
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as any).port}/api`;
    expect((await fetch(`${base}/listDocuments?folder=archive%2Fnested`)).status).toBe(200);
    const response = await save("Blocked.json");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ Success: false, Error: expect.stringContaining("read-only") });
    expect(await vfs.readdir(path.join(root, "archive", "nested"))).not.toContain("Blocked.json");
  });
});
