import { Router } from "express";
import type { createHistoryService } from "./history-router.js";
import { promises as fs } from "./phext-fs.mjs";
import path from "node:path";
import { randomUUID } from "node:crypto";

class StoreError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function validateDocument(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as any).type !== "string") {
    throw new StoreError(400, "The file is not a Block document.");
  }
  const block = value as Record<string, any>;
  if (block.format === "mutable-document") throw new StoreError(400, "Native resources require the native Document route.");
  if (block.children != null) {
    if (!Array.isArray(block.children)) throw new StoreError(400, "Document children must be an array.");
    block.children.forEach(validateDocument);
  }
  for (const name of ["leftMargin", "rightMargin"]) {
    if (block.relation?.[name] != null) validateDocument(block.relation[name]);
  }
}

export function createDocumentStoreRouter(options: {
  root: string;
  readOnly?: boolean;
  coordinate?: <T>(action: () => Promise<T>) => Promise<T>;
  indexDocument?: (document: any, filepath: string) => Promise<void>;
  history?: Pick<ReturnType<typeof createHistoryService>, "validatePortable" | "saveDocument">;
}) {
  const router = Router();
  const coordinate = options.coordinate ?? (async action => action());
  const inside = (root: string, target: string) => {
    const relative = path.relative(root, target);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new StoreError(400, "Choose a location inside the document store.");
    }
  };
  const directory = async (folder: unknown = ".") => {
    if (typeof folder !== "string" || folder.includes("\\") || folder.includes("\0") || path.isAbsolute(folder) || folder.split("/").includes("..")) {
      throw new StoreError(400, "Invalid document folder.");
    }
    const root = await fs.realpath(options.root);
    const target = await fs.realpath(path.resolve(root, folder || "."));
    inside(root, target);
    if (!(await fs.stat(target)).isDirectory()) throw new StoreError(400, "Choose a folder.");
    return { root, target };
  };
  const filename = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || /[\\/\0]/.test(value) || value.startsWith(".") || !/\.json$/i.test(value)) {
      throw new StoreError(400, "Enter a JSON filename without path separators.");
    }
    return value;
  };
  const errorResponse = (res: any, error: any) => {
    const status = error instanceof StoreError ? error.status : error?.code === "ENOENT" ? 404 : error?.code === "EEXIST" ? 409 : 500;
    const message = error instanceof StoreError ? error.message
      : status === 404 ? "The document or folder could not be found."
      : status === 409 ? "A document with this name already exists."
      : "The document store could not complete the request.";
    res.status(status).json({ Success: false, Error: message });
  };

  router.get(["/listFolders", "/listDocuments"], async (req, res) => {
    try {
      const { target } = await directory(req.query.folder ?? ".");
      const entries = await fs.readdir(target, { withFileTypes: true });
      const folders = req.path === "/listFolders";
      // Listing is filename-based; ordinary JSON needs no native suffix or index entry.
      const names = entries.filter((entry) => !entry.name.startsWith(".") && (folders ? entry.isDirectory() : entry.isFile() && (/\.json$/i.test(entry.name) || /\.(ink|phosphor)$/.test(entry.name))))
        .map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      res.json(folders ? { folders: names } : { files: names });
    } catch (error) { errorResponse(res, error); }
  });

  router.get("/loadDocumentJson", async (req, res) => {
    try {
      const { root, target } = await directory(req.query.folder ?? "data");
      const name = filename(req.query.filename);
      const filepath = await fs.realpath(path.join(target, name));
      inside(root, filepath);
      let document: any;
      try { document = JSON.parse(await fs.readFile(filepath, "utf8")); }
      catch (error) {
        if (error instanceof SyntaxError) throw new StoreError(422, "The document contains invalid JSON.");
        throw error;
      }
      validateDocument(document);
      if (document.format === "codex-history-document") {
        if (!options.history) throw new StoreError(503, "Persistent Document support is unavailable.");
        await options.history.validatePortable(document);
      } else document.metadata = { ...document.metadata, filename: name };
      res.json({ Success: true, Data: { document } });
    } catch (error) { errorResponse(res, error); }
  });

  router.post("/saveDocumentJson", async (req, res) => coordinate(async () => {
    let temporary: string | undefined;
    try {
      if (options.readOnly) throw new StoreError(403, "Server Documents are read-only in the public hosted version. Save to a Local JSON file instead.");
      const { root, target } = await directory(req.body?.folder ?? "data");
      const filepath = path.join(target, filename(req.body?.filename));
      if (/\.(ink|phosphor|mutable\.json)$/i.test(filepath)) throw new StoreError(409, "Native destinations require paired resource Save.");
      validateDocument(req.body?.document);
      // Check existing symlinks as well as the parent before writing.
      try { inside(root, await fs.realpath(filepath)); }
      catch (error: any) { if (error?.code !== "ENOENT") throw error; }
      const persistent = req.body.document.format === "codex-history-document";
      const publish = async () => {
        temporary = path.join(target, `.speedy-${randomUUID()}.tmp`);
        const file = await fs.open(temporary, "wx");
        try { await file.writeFile(JSON.stringify(req.body.document), "utf8"); if (persistent) await file.sync(); }
        finally { await file.close(); }
        if (req.header("If-None-Match") === "*") await fs.link(temporary, filepath);
        else await fs.rename(temporary, filepath);
        if (persistent) {
          const parent = await fs.open(target, "r");
          try { await parent.sync(); } finally { await parent.close(); }
        }
      };
      let receipt: unknown;
      let warning: string | undefined;
      if (persistent) {
        if (!options.history) throw new StoreError(503, "Persistent Document format support is unavailable.");
        if (req.body.historyProof) {
          try {
            const association = await options.history.saveDocument({ folder: req.body.folder ?? "data", filename: req.body.filename }, req.body.historyProof, req.body.document, publish);
            if ("warning" in association) warning = association.warning;
            else receipt = association;
          } catch (error) { throw new StoreError(409, error instanceof Error ? error.message : "The history Save could not be verified."); }
        } else {
          // The portable Document is independently usable. Missing archive proof
          // must never invent a saved revision or silently discard identities.
          if (req.body.document.saved) throw new StoreError(409, "A saved history revision requires its verified proof.");
          await options.history.validatePortable(req.body.document);
          await publish();
          warning = "Document saved. History association is unavailable; no saved-revision receipt was claimed.";
        }
      } else await publish();
      if (persistent) warning = [warning, "Search indexing for this Document format is not yet supported."].filter(Boolean).join(" ");
      if (options.indexDocument && !persistent) {
        try { await options.indexDocument(structuredClone(req.body.document), filepath); }
        catch { warning = "Document saved, but the search index could not be updated."; }
      }
      res.setHeader("X-Speedy-Revision", req.header("X-Speedy-Revision") ?? "");
      res.json({ Success: true, ...(warning ? { Warning: warning } : {}), ...(receipt ? { Data: { receipt } } : {}) });
    } catch (error) { errorResponse(res, error); }
    finally { if (temporary) await fs.unlink(temporary).catch(() => undefined); }
  }));
  return router;
}
