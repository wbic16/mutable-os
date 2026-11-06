import { createWorkspaceSaveBundle, materializeLocalWorkspace, materializeWorkspace } from "../src/reactive-editor/workspace-manifest";
import express from "express";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as vfs } from "./phext-fs.mjs";
import { testCavern } from "../src/knowledge-sqlite/phext-test-cavern.mjs";
import { createWorkspaceStoreRouter } from "./workspace-store";
import { createHash } from "node:crypto";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(",")}}`;
}
const hash = (value: unknown) => `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;

describe("Workspace store HTTP routes", () => {
  let root: string, documents: string, workspaces: string, base: string, server: Server;
  const indexDocument = vi.fn();
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "speedy-workspace-test-")); testCavern(root);
    documents = path.join(root, "documents"); workspaces = path.join(root, "workspaces");
    await vfs.mkdir(path.join(documents, "research"), { recursive: true }); await vfs.mkdir(workspaces);
    indexDocument.mockReset(); indexDocument.mockResolvedValue(undefined);
    const app = express(); app.use(express.json()); app.use("/api", createWorkspaceStoreRouter({ documentRoot: documents, workspaceRoot: workspaces, indexDocument }));
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  });
  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  const values = () => {
    const document = { id: "block-id", type: "document-block", metadata: { documentId: "document-one", folder: "research", filename: "Notes.json" }, children: [{ type: "plain-text-block", text: "Separate" }] };
    const contentHash = hash(document);
    const source = { kind: "document-store", folder: "research", filename: "Notes.json" };
    const workspace = { kind: "speedy-workspace", schemaVersion: 1, workspaceId: "workspace-one", documents: { "document-one": { documentId: "document-one", source, contentHash } }, root: { type: "workspace-block", children: [{ type: "image-background-block", metadata: { url: "/green.jpg" }, children: [{ type: "document-window-block", metadata: { position: { x: 1, y: 2 } }, children: [{ type: "document-reference-block", metadata: { documentId: "document-one" } }] }] }] } };
    return { document, contentHash, source, workspace };
  };

  it("writes separate Documents before the manifest and reloads the manifest", async () => {
    const value = values();
    // Root metadata also carries presentation data unknown to this server.
    Object.assign(value.workspace.root, { metadata: { workspacePresentation: { version: 99, active: "future", layouts: { retained: true } } } });
    const response = await fetch(`${base}/saveWorkspaceBundle`, { method: "POST", headers: { "Content-Type": "application/json", "X-Speedy-Revision": "9" }, body: JSON.stringify({ filename: "Desk.json", workspace: value.workspace, documents: [{ documentId: "document-one", source: value.source, document: value.document, contentHash: value.contentHash }] }) });
    expect(response.status).toBe(200); expect(response.headers.get("X-Speedy-Revision")).toBe("9");
    expect(JSON.parse(await vfs.readFile(path.join(documents, "research", "Notes.json"), "utf8"))).toEqual(value.document);
    const storedWorkspace = JSON.parse(await vfs.readFile(path.join(workspaces, "Desk.json"), "utf8"));
    expect(storedWorkspace.root.children[0].type).toBe("image-background-block");
    expect(JSON.stringify(storedWorkspace)).not.toContain("Separate");
    const loaded = await (await fetch(`${base}/loadWorkspaceJson?filename=Desk.json`)).json();
    expect(loaded.Data.workspace).toEqual(value.workspace);
    expect(await (await fetch(`${base}/listWorkspaces`)).json()).toEqual({ workspaces: ["Desk.json"] });
  });

  it("writes bank Documents to the existing store root and retains Canvas/app data across Save As and Open", async () => {
    const presentation = { version: 1, active: "canvas", objects: [{ id: "object", target: { kind: "block", blockId: "window" } }], presentations: { desktop: { version: 1, kind: "legacy-tree" }, canvas: { version: 1, camera: { x: 15, y: 35, zoom: .5 }, placements: [{ id: "placement", objectId: "object", bounds: { x: 50, y: 90, width: 840, height: 620 }, order: 0 }] } } };
    const dto = { type: "workspace-block", metadata: { workspacePresentation: presentation }, children: [{ type: "workspace-object-bank-block", children: [
      { id: "window", type: "document-window-block", children: [{ id: "note", type: "document-block", metadata: { documentId: "bank-document", folder: ".", filename: "bank-document.json" }, children: [{ type: "plain-text-block", text: "New Canvas document" }] }] },
      { type: "canvas-counter-block", count: 9 },
    ] }] };
    const bundle = await createWorkspaceSaveBundle(materializeLocalWorkspace(dto).state, [], "bank-workspace");
    for (const filename of ["Canvas.json", "Canvas-copy.json"]) {
      const saved = await fetch(`${base}/saveWorkspaceBundle`, { method: "POST", headers: { "Content-Type": "application/json", "If-None-Match": "*" }, body: JSON.stringify({ filename, workspace: bundle.manifest, documents: bundle.documents }) });
      expect(saved.status).toBe(200);
      const loaded = await (await fetch(`${base}/loadWorkspaceJson?filename=${filename}`)).json();
      expect(loaded.Data.workspace.root.metadata.workspacePresentation).toEqual(presentation);
      const document = JSON.parse(await vfs.readFile(path.join(documents, "bank-document.json"), "utf8"));
      const reopened = materializeWorkspace(loaded.Data.workspace, new Map([["bank-document", document]]));
      expect(Object.values(reopened.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(1);
      expect(Object.values(reopened.state.contents).find(c => c.viewType === "canvas-counter-block")?.payload.count).toBe(9);
    }
  });

  it("rejects embedded content, mismatched hashes and unsafe paths without writing", async () => {
    const value = values();
    const embedded = structuredClone(value.workspace); embedded.root.children[0].children[0].children = [value.document];
    const invalid = await fetch(`${base}/saveWorkspaceBundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "Bad.json", workspace: embedded, documents: [] }) });
    expect(invalid.status).toBe(400);
    const mismatch = await fetch(`${base}/saveWorkspaceBundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "Bad.json", workspace: value.workspace, documents: [{ documentId: "document-one", source: value.source, document: value.document, contentHash: "sha256:wrong" }] }) });
    expect(mismatch.status).toBe(409);
    expect(await vfs.readdir(workspaces)).toEqual([]);
    const unsafe = structuredClone(value.workspace); unsafe.documents["document-one"].source.folder = "../outside";
    expect((await fetch(`${base}/saveWorkspaceBundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "Bad.json", workspace: unsafe, documents: [] }) })).status).toBe(400);
  });

  it("keeps the previous files when a bundle fails validation", async () => {
    const value = values();
    await vfs.writeFile(path.join(documents, "research", "Notes.json"), JSON.stringify({ old: "document" }));
    await vfs.writeFile(path.join(workspaces, "Desk.json"), JSON.stringify({ old: "workspace" }));
    const broken = structuredClone(value.workspace); broken.documents["document-one"].contentHash = "sha256:wrong";
    const response = await fetch(`${base}/saveWorkspaceBundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "Desk.json", workspace: broken, documents: [{ documentId: "document-one", source: value.source, document: value.document, contentHash: value.contentHash }] }) });
    expect(response.status).toBe(409);
    expect(JSON.parse(await vfs.readFile(path.join(documents, "research", "Notes.json"), "utf8"))).toEqual({ old: "document" });
    expect(JSON.parse(await vfs.readFile(path.join(workspaces, "Desk.json"), "utf8"))).toEqual({ old: "workspace" });
  });

  it("does not overwrite a Document changed outside the loaded Workspace", async () => {
    const value = values();
    const external = { ...value.document, children: [{ type: "plain-text-block", text: "External edit" }] };
    await vfs.writeFile(path.join(documents, "research", "Notes.json"), JSON.stringify(external));
    const response = await fetch(`${base}/saveWorkspaceBundle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "Desk.json", workspace: value.workspace, documents: [{ documentId: "document-one", source: value.source, document: value.document, contentHash: value.contentHash, expectedContentHash: hash(value.document) }] }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).Code).toBe("document-write-conflict");
    expect(JSON.parse(await vfs.readFile(path.join(documents, "research", "Notes.json"), "utf8"))).toEqual(external);
    expect(await vfs.readdir(workspaces)).toEqual([]);
  });

  it("supports conditional creation for Workspace Save As", async () => {
    const value = values();
    await vfs.writeFile(path.join(workspaces, "Desk.json"), JSON.stringify({ existing: true }));
    const response = await fetch(`${base}/saveWorkspaceBundle`, {
      method: "POST", headers: { "Content-Type": "application/json", "If-None-Match": "*" },
      body: JSON.stringify({ filename: "Desk.json", workspace: value.workspace, documents: [{ documentId: "document-one", source: value.source, document: value.document, contentHash: value.contentHash }] }),
    });
    expect(response.status).toBe(409);
    expect(JSON.parse(await vfs.readFile(path.join(workspaces, "Desk.json"), "utf8"))).toEqual({ existing: true });
    expect(await vfs.readdir(path.join(documents, "research"))).toEqual([]);
  });

  it("allows Workspace reads but rejects bundle writes in read-only hosted mode", async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    const app = express(); app.use(express.json()); app.use("/api", createWorkspaceStoreRouter({ documentRoot: documents, workspaceRoot: workspaces, readOnly: true }));
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as any).port}/api`;
    expect((await fetch(`${base}/listWorkspaces`)).status).toBe(200);
    const value = values();
    const response = await fetch(`${base}/saveWorkspaceBundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "Desk.json", workspace: value.workspace, documents: [] }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ Success: false, Code: "read-only" });
    expect(await vfs.readdir(workspaces)).toEqual([]);
  });
});
