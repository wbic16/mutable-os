import { assertJson, validateManagedContainer, desktopOf } from "../src/persistence/managed-desktop.js";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "./phext-fs.mjs";
import path from "node:path";
import { Router } from "express";
import { validateDocument } from "./document-store.js";

class WorkspaceStoreError extends Error {
  constructor(readonly status: number, message: string, readonly code = "workspace-store-error") {
    super(message);
  }
}

function record(value: unknown, message: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceStoreError(400, message, "invalid-workspace");
  return value as Record<string, any>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(",")}}`;
}

function contentHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function safeFilename(value: unknown, kind: string): string {
  if (typeof value !== "string" || !value.trim() || /[\\/\0]/.test(value) || value.startsWith(".") || !/\.json$/i.test(value)) {
    throw new WorkspaceStoreError(400, `Enter a JSON ${kind} filename without path separators.`, `invalid-${kind}-filename`);
  }
  return value;
}

function safeFolder(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\\") || value.includes("\0") || path.isAbsolute(value) || value.split("/").includes("..")) {
    throw new WorkspaceStoreError(400, "Invalid Document folder.", "invalid-document-folder");
  }
  return value;
}

async function confinedDirectory(rootInput: string, folder = ".") {
  const root = await fs.realpath(rootInput);
  const target = await fs.realpath(path.resolve(root, folder));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new WorkspaceStoreError(400, "Choose a location inside the configured store.", "path-outside-store");
  }
  if (!(await fs.stat(target)).isDirectory()) throw new WorkspaceStoreError(400, "Choose a folder.", "invalid-folder");
  return target;
}

async function confinedExistingFile(rootInput: string, directory: string, filename: string): Promise<string> {
  const root = await fs.realpath(rootInput);
  const target = await fs.realpath(path.join(directory, filename));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new WorkspaceStoreError(400, "Choose a Workspace inside the configured store.", "path-outside-store");
  }
  return target;
}

async function stagedJson(target: string, value: unknown): Promise<string> {
  const temporary = path.join(path.dirname(target), `.speedy-workspace-${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary, JSON.stringify(value), { encoding: "utf8", flag: "wx" }); }
  catch (error) { await fs.unlink(temporary).catch(() => undefined); throw error; }
  return temporary;
}

async function restore(target: string, previous: Buffer | undefined): Promise<void> {
  if (!previous) {
    await fs.unlink(target).catch(() => undefined);
    return;
  }
  const temporary = path.join(path.dirname(target), `.speedy-rollback-${randomUUID()}.tmp`);
  await fs.writeFile(temporary, previous, { flag: "wx" });
  await fs.rename(temporary, target);
}

function source(resource: Record<string, any>) {
  const value = record(resource.source, "A Workspace Document needs a source.");
  if (value.kind !== "document-store") throw new WorkspaceStoreError(400, `Unsupported Document source ${String(value.kind)}.`, "unsupported-document-source");
  return { kind: "document-store" as const, folder: safeFolder(value.folder), filename: safeFilename(value.filename, "Document") };
}

function validateManifest(value: unknown): Record<string, any> {
  assertJson(value);
  const manifest = record(value, "The Workspace must be a JSON object.");
  if (manifest.kind !== "speedy-workspace" || (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2)) {
    throw new WorkspaceStoreError(400, "The coordinated save requires a Speedy Workspace version 1 or 2 manifest.", "invalid-workspace-version");
  }
  if (manifest.schemaVersion === 2) validateManagedContainer(manifest);
  else if (desktopOf(manifest.root)) throw new WorkspaceStoreError(400, "Managed Desktop requires a version 2 container.");
  if (typeof manifest.workspaceId !== "string" || !manifest.workspaceId) throw new WorkspaceStoreError(400, "The Workspace needs a workspaceId.", "invalid-workspace-id");
  const root = record(manifest.root, "The Workspace needs a root Block.");
  if (root.type !== "workspace-block") throw new WorkspaceStoreError(400, "The Workspace root must be a workspace-block.", "invalid-workspace-root");
  const documents = record(manifest.documents, "The Workspace needs a Document resource table.");
  const locations = new Set<string>();
  for (const [documentId, raw] of Object.entries(documents)) {
    const resource = record(raw, `Document resource ${documentId} is invalid.`);
    if (resource.documentId !== documentId) throw new WorkspaceStoreError(400, `Document resource key ${documentId} does not match its ID.`, "document-id-mismatch");
    const location = source(resource);
    const key = `${location.folder}/${location.filename}`.toLocaleLowerCase();
    if (locations.has(key)) throw new WorkspaceStoreError(400, `More than one Document targets ${location.folder}/${location.filename}.`, "duplicate-document-location");
    locations.add(key);
  }
  const walk = (block: Record<string, any>) => {
    if (["document-block", "main-list-block", "membrane-block"].includes(block.type)) {
      throw new WorkspaceStoreError(400, "A Workspace manifest cannot embed Document content.", "embedded-workspace-document");
    }
    if (block.type === "document-reference-block") {
      const documentId = block.metadata?.documentId;
      if (typeof documentId !== "string" || !Object.hasOwn(documents, documentId)) throw new WorkspaceStoreError(400, `Unknown Document reference ${String(documentId)}.`, "unknown-document-reference");
    }
    if (Array.isArray(block.children)) block.children.forEach(child => walk(record(child, "A Workspace child Block is invalid.")));
    for (const name of ["leftMargin", "rightMargin"]) if (block.relation?.[name]) walk(record(block.relation[name], "A Workspace relation Block is invalid."));
  };
  walk(root);
  return manifest;
}

/** Refuse format downgrades and stale writes before staging any file. */
async function guardWorkspaceTarget(target: string, next: any, expected?: string, createOnly = false) {
  let previous: any;
  try {
    if ((await fs.lstat(target)).isSymbolicLink()) throw new WorkspaceStoreError(409, "Workspace destinations cannot be symbolic links.");
    previous = JSON.parse(await fs.readFile(target, "utf8"));
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      if (expected) throw new WorkspaceStoreError(409, "The Workspace was removed outside this session.");
      return;
    }
    if (error instanceof SyntaxError) throw new WorkspaceStoreError(409, "The existing Workspace is malformed; choose a new filename.");
    throw error;
  }
  if (createOnly) throw new WorkspaceStoreError(409, "A Workspace with this name already exists.", "workspace-exists");
  if ((previous.kind || previous.schemaVersion !== undefined) && !(previous.kind === 'speedy-workspace' && [1,2].includes(previous.schemaVersion) || previous.kind === 'speedy-local-workspace' && previous.schemaVersion === 2)) throw new WorkspaceStoreError(409, "Unsupported existing Workspace version; choose a new filename.");
  if (previous.schemaVersion === 2) {
    validateManagedContainer(previous);
    if (next.schemaVersion !== 2 || previous.kind !== next.kind || previous.workspaceId !== next.workspaceId) throw new WorkspaceStoreError(409, "Managed Workspace identity/format cannot be overwritten; choose a new filename.");
    if (desktopOf(previous.root)!.version < 4 && desktopOf(next.root)?.version === 4) throw new WorkspaceStoreError(409, "D1 upgrade requires Save As to a new filename.");
    if ((desktopOf(next.root)?.version ?? 0) < desktopOf(previous.root)!.version) throw new WorkspaceStoreError(409, "A shell layout cannot be overwritten by an older Desktop format. Choose a new filename.");
    if (!expected || expected !== contentHash(previous)) throw new WorkspaceStoreError(409, "The Workspace changed outside this session. Reopen it or Save As to a new filename.");
  } else if (next.schemaVersion === 2) throw new WorkspaceStoreError(409, "Upgrade requires Save As to a new filename.");
}

export function createWorkspaceStoreRouter(options: {
  documentRoot: string;
  workspaceRoot: string;
  readOnly?: boolean;
  coordinate?: <T>(action: () => Promise<T>) => Promise<T>;
  indexDocument?: (document: any, filepath: string) => Promise<void>;
}) {
  const router = Router();
  let queue: Promise<unknown> = Promise.resolve();
  const coordinate = options.coordinate ?? (<T>(action: () => Promise<T>): Promise<T> => {
    const result = queue.then(action); queue = result.catch(() => undefined); return result;
  });
  const respondError = (res: any, error: any) => {
    const status = error?.name === "ManagedWorkspaceError" ? 400 : error instanceof WorkspaceStoreError ? error.status : error?.code === "ENOENT" ? 404 : 500;
    const message = error instanceof WorkspaceStoreError || error?.name === "ManagedWorkspaceError" ? error.message : status === 404 ? "The Workspace or Document could not be found." : "The Workspace store could not complete the request.";
    res.status(status).json({ Success: false, Error: message, Code: error instanceof WorkspaceStoreError ? error.code : status === 404 ? "not-found" : "workspace-store-error" });
  };

  router.get("/listWorkspaces", async (_req, res) => {
    try {
      const directory = await confinedDirectory(options.workspaceRoot);
      const workspaces = (await fs.readdir(directory, { withFileTypes: true }))
        .filter(entry => entry.isFile() && !entry.name.startsWith(".") && /\.json$/i.test(entry.name))
        .map(entry => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      res.json({ workspaces });
    } catch (error) { respondError(res, error); }
  });

  router.get("/loadWorkspaceJson", async (req, res) => {
    try {
      const directory = await confinedDirectory(options.workspaceRoot);
      const filename = safeFilename(req.query.filename, "Workspace");
      const filepath = await confinedExistingFile(options.workspaceRoot, directory, filename);
      const value = JSON.parse(await fs.readFile(filepath, "utf8"));
      res.json({ Success: true, Data: { workspace: value, contentHash: contentHash(value) } });
    } catch (error) {
      if (error instanceof SyntaxError) respondError(res, new WorkspaceStoreError(422, "The Workspace contains invalid JSON.", "invalid-json"));
      else respondError(res, error);
    }
  });

  // Compatibility writer for the original UI. New reactive saves use the bundle route.
  router.post("/saveWorkspaceJson", async (req, res) => coordinate(async () => {
    let temporary: string | undefined;
    try {
      if (/\.(ink|mutable\.json)$/i.test(String(req.body?.filename ?? ""))) throw new WorkspaceStoreError(409, "Native destinations require paired resource Save.", "native-resource-guard");
      if (options.readOnly) throw new WorkspaceStoreError(403, "Server Workspaces are read-only in the public hosted version. Save to a Local JSON file instead.", "read-only");
      const directory = await confinedDirectory(options.workspaceRoot);
      const target = path.join(directory, safeFilename(req.body?.filename, "Workspace"));
      const legacy = record(req.body?.workspace, "The Workspace must be a JSON object.");
      if (legacy.type !== "workspace-block" || legacy.kind || desktopOf(legacy)) throw new WorkspaceStoreError(400, "The legacy route requires a legacy Workspace tree.");
      await guardWorkspaceTarget(target, legacy);
      temporary = await stagedJson(target, req.body.workspace);
      await fs.rename(temporary, target); temporary = undefined;
      res.json({ Success: true });
    } catch (error) { respondError(res, error); }
    finally { if (temporary) await fs.unlink(temporary).catch(() => undefined); }
  }));

  router.post("/saveWorkspaceBundle", async (req, res) => coordinate(async () => {
    const staged: Array<{ target: string; temporary: string; document?: any }> = [];
    const committed: Array<{ target: string; previous?: Buffer }> = [];
    try {
      if (/\.(ink|mutable\.json)$/i.test(String(req.body?.filename ?? ""))) throw new WorkspaceStoreError(409, "Native destinations require paired resource Save.", "native-resource-guard");
      if (options.readOnly) throw new WorkspaceStoreError(403, "Server Workspaces are read-only in the public hosted version. Save to a Local JSON file instead.", "read-only");
      const manifest = validateManifest(req.body?.workspace);
      const writes = Array.isArray(req.body?.documents) ? req.body.documents : [];
      const workspaceDirectory = await confinedDirectory(options.workspaceRoot);
      const workspaceTarget = path.join(workspaceDirectory, safeFilename(req.body?.filename, "Workspace"));
      await guardWorkspaceTarget(workspaceTarget, manifest, req.header("If-Match"), req.header("If-None-Match") === "*");
      if (manifest.schemaVersion === 2) {
        if (writes.length) throw new WorkspaceStoreError(400, "Managed Workspace Save cannot write Document content.");
        for (const resource of Object.values(manifest.documents) as any[]) {
          const location = source(resource);
          // D1 preserves explicitly unavailable references without writing or
          // resolving their content. Retry/Relink still require exact identity.
          if (desktopOf(manifest.root)?.version === 4 && resource.unavailable === true) continue;
          const directory = await confinedDirectory(options.documentRoot, location.folder);
          const file = await confinedExistingFile(options.documentRoot, directory, location.filename);
          const document = JSON.parse(await fs.readFile(file, "utf8"));
          validateDocument(document);
          if (!["document-block", "main-list-block", "membrane-block"].includes(document.type) || (document.metadata?.documentId ?? document.id) !== resource.documentId) throw new WorkspaceStoreError(409, "A referenced Document has an invalid or different identity.");
        }
      }
      const seen = new Set<string>();
      for (const raw of writes) {
        const write = record(raw, "A Workspace Document write is invalid.");
        const documentId = typeof write.documentId === "string" ? write.documentId : "";
        if (!documentId || seen.has(documentId)) throw new WorkspaceStoreError(400, `Duplicate or missing Document write ID ${documentId}.`, "invalid-document-write");
        seen.add(documentId);
        const resource = record(manifest.documents[documentId], `Document write ${documentId} has no resource entry.`);
        const expectedSource = source(resource);
        if (/\.(ink|mutable\.json)$/i.test(expectedSource.filename) || write.document?.format === "mutable-document") throw new WorkspaceStoreError(409, "Native Documents must be saved individually through their resource binding.", "native-resource-guard");
        const actualSource = source({ source: write.source });
        if (JSON.stringify(expectedSource) !== JSON.stringify(actualSource)) throw new WorkspaceStoreError(400, `Document write ${documentId} does not match its manifest location.`, "document-location-mismatch");
        validateDocument(write.document);
        if (!["document-block", "main-list-block", "membrane-block"].includes(String(write.document.type))) throw new WorkspaceStoreError(400, `Document write ${documentId} is not a Document root.`, "invalid-document-root");
        const actualId = write.document.metadata?.documentId ?? write.document.id;
        if (actualId !== documentId) throw new WorkspaceStoreError(400, `Document write ${documentId} contains identity ${String(actualId)}.`, "document-id-mismatch");
        const actualHash = contentHash(write.document);
        if (write.contentHash !== actualHash || resource.contentHash !== actualHash) throw new WorkspaceStoreError(409, `Document ${documentId} changed while preparing the Workspace save.`, "document-hash-mismatch");
        const directory = await confinedDirectory(options.documentRoot, expectedSource.folder);
        const target = path.join(directory, expectedSource.filename);
        if (typeof write.expectedContentHash === "string") {
          try {
            const current = JSON.parse(await fs.readFile(target, "utf8"));
            if (contentHash(current) !== write.expectedContentHash) {
              throw new WorkspaceStoreError(409, `Document ${documentId} was changed outside this Workspace. Reload or save it under another name.`, "document-write-conflict");
            }
          } catch (error: any) {
            if (error?.code !== "ENOENT") throw error;
            throw new WorkspaceStoreError(409, `Document ${documentId} no longer exists at its saved location.`, "document-write-conflict");
          }
        }
        staged.push({ target, temporary: await stagedJson(target, write.document), document: write.document });
      }
      staged.push({ target: workspaceTarget, temporary: await stagedJson(workspaceTarget, manifest) });

      for (const item of staged) {
        let previous: Buffer | undefined;
        try { previous = await fs.readFile(item.target); } catch (error: any) { if (error?.code !== "ENOENT") throw error; }
        await fs.rename(item.temporary, item.target);
        committed.push({ target: item.target, previous });
      }

      const warnings: string[] = [];
      if (options.indexDocument) {
        for (const item of staged.filter(item => item.document)) {
          try { await options.indexDocument(structuredClone(item.document), item.target); }
          catch { warnings.push(path.basename(item.target)); }
        }
      }
      res.setHeader("X-Speedy-Revision", req.header("X-Speedy-Revision") ?? "");
      res.json({ Success: true, Data: { contentHash: contentHash(manifest) }, ...(warnings.length ? { Warning: `${warnings.length} Document${warnings.length === 1 ? "" : "s"} saved, but could not be added to the search index.` } : {}) });
    } catch (error) {
      const failed: string[] = [];
      for (const item of committed.reverse()) await restore(item.target, item.previous).catch(() => { failed.push(path.basename(item.target)); });
      if (failed.length) { respondError(res, new WorkspaceStoreError(500, `Save failed and rollback could not restore: ${failed.join(", ")}. Inspect these files before retrying.`, "partial-save")); return; }
      respondError(res, error);
    } finally {
      for (const item of staged) await fs.unlink(item.temporary).catch(() => undefined);
    }
  }));

  return router;
}
