/** Managed-filesystem pair adapter, qualified in B2 and used by the native server.
 * Replacements MOVE the displaced inode aside, then publish create-only.
 * Preserved prior files are never deleted, including late writes via open handles. */
import { fstatSync } from "node:fs";
import { promises as fs } from "../../server/phext-fs.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { flockDescriptor } from "../../scripts/stage-c-gates/flock.mjs";
let nativeLock;
try { nativeLock = promisify(createRequire(import.meta.url)("fs-ext").flock); } catch { /* optional native capability */ }
// When the fs-ext binding is absent, route through the stage-C gates
// fallback (scripts/stage-c-gates/flock.mjs): a token lock keyed by the
// descriptor's dev+ino identity, contention reported with code
// EWOULDBLOCK — the same contract the call sites already handle from the
// native path. The helper's release function replaces the native 'un'
// call; releases are tracked per descriptor because the native-vault
// store drops its lock by closing the handle, and its explicit unlock
// (like ManagedPair's) lands here first.
const fallbackReleases = new Map();
async function fallbackFlock(fd, operation) {
  if (operation === "un") {
    const release = fallbackReleases.get(fd);
    if (release) { fallbackReleases.delete(fd); await release(); }
    return;
  }
  const stat = fstatSync(fd);
  const release = await flockDescriptor(fd,
    { dev: String(stat.dev), ino: String(stat.ino) },
    operation === "sh" || operation === "shnb");
  fallbackReleases.set(fd, release);
}
export const nativeFlock = nativeLock ? (...args) => nativeLock(...args) : fallbackFlock;
const flock = nativeFlock;
import { createHash, randomUUID } from "node:crypto";
import { decodeNative } from "./native-resource";
import { isNativeDocumentName, markdownProjectionName } from './document-file-names.mjs';
export const hash = value => createHash("sha256").update(value).digest("hex");
const bytes = text => new TextEncoder().encode(text);
const sameHash = (value, expected) => (value === undefined ? null : hash(value)) === expected;
const read = async file => { try { return await fs.readFile(file); } catch (e) { if (e.code !== "ENOENT") throw e; } };
const syncDir = async dir => { const file = await fs.open(dir, "r"); try { await file.sync(); } finally { await file.close(); } };
async function durableWrite(file, data, exclusive = true) { const f = await fs.open(file, exclusive ? "wx" : "w"); try { await f.writeFile(data); await f.sync(); } finally { await f.close(); } }
const fail = (message, conflict = false) => Object.assign(new Error(message), { conflict });
const validGeneration = value => typeof value === "string" && /^[a-zA-Z0-9-]+$/.test(value);
const fields = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(k => keys.includes(k));

export class ManagedPair {
  constructor({ root, resourceId, nativeName, markdownName, locations = new Map(), fault = async () => {} }) {
    if (![nativeName, markdownName].every(n => typeof n === "string" && !n.includes("\0") && /^[^./\\][^/\\]*$/.test(n)) || nativeName === markdownName || !isNativeDocumentName(nativeName) || !markdownName.endsWith(".md") || /\.(ink|phosphor)$/.test(nativeName) && markdownName !== markdownProjectionName(nativeName)) throw Error("Invalid pair locations");
    this.root = root; this.resourceId = resourceId; this.nativeName = nativeName; this.markdownName = markdownName;
    this.locations = new Map(locations); this.fault = fault;
    this.home = path.join(root, `.mutable-pair-${hash(resourceId)}`);
  }
  file(kind) { return path.join(this.root, kind === "native" ? this.nativeName : this.markdownName); }
  async lock(action) {
    await fs.mkdir(this.home, { recursive: true });
    const lock = await fs.open(path.join(this.home, "writer.lock"), "a+");
    try { await flock(lock.fd, "exnb"); } catch (e) { await lock.close(); if (["EAGAIN", "EWOULDBLOCK"].includes(e.code)) return { phase: "failed", conflict: true, error: "Another cooperating writer holds the resource lock" }; throw e; }
    try { return await action(); } finally { await flock(lock.fd, "un"); await lock.close(); }
  }
  async receipt() {
    const raw = await read(path.join(this.home, "receipt.json")); if (!raw) return;
    const r = JSON.parse(raw);
    if (!fields(r, ["version", "resourceId", "generation", "nativeHash", "markdownHash", "nativeName", "markdownName"]) || ![1, 2].includes(r.version) || !validGeneration(r.generation) || r.resourceId !== this.resourceId || r.nativeName !== this.nativeName || r.markdownName !== this.markdownName || !/^[0-9a-f]{64}$/.test(r.nativeHash) || (r.version === 2 ? r.markdownHash !== null : !/^[0-9a-f]{64}$/.test(r.markdownHash))) throw fail("Invalid pair receipt", true);
    return r;
  }
  async dependencies(native) { return validateResourceDependencies(native,this.resourceId,this.locations); }
  async save(generation, acceptMarkdownHash, baseline) {
    return this.lock(async () => {
      try {
        if (await read(path.join(this.home, "pending.json"))) throw fail("Recover the pending generation first", true);
        if (generation.resourceId !== this.resourceId || !validGeneration(generation.generation)) throw fail("Wrong save identity/generation");
        await this.dependencies(generation.native);
        const prior = await this.receipt(), nativeOnly = generation.markdown === undefined;
        // Production callers carry their observed version; a newer durable
        // receipt must never refresh a stale editor's permission to overwrite.
        if (baseline && (baseline.generation !== (prior?.generation ?? null) || ![baseline.nativeHash, baseline.markdownHash].every(h => h === null || typeof h === "string" && /^[0-9a-f]{64}$/.test(h)))) throw fail("Caller baseline is stale or invalid", true);
        if (baseline && prior && baseline.nativeHash !== prior.nativeHash) throw fail("Native file differs from its confirmed baseline; explicit resolution required", true);
        if (!nativeOnly && baseline && prior && baseline.markdownHash !== prior.markdownHash && acceptMarkdownHash !== baseline.markdownHash) throw fail("Changed Markdown requires explicit Compare / Keep Mutable", true);
        if (!nativeOnly && baseline && !prior && baseline.markdownHash !== null && acceptMarkdownHash !== baseline.markdownHash) throw fail("Existing Markdown requires explicit Compare / Keep Mutable", true);
        const expected = { native: baseline ? baseline.nativeHash : prior?.nativeHash ?? null, markdown: nativeOnly ? null : acceptMarkdownHash ?? (baseline ? baseline.markdownHash : prior?.markdownHash ?? null) };
        for (const kind of nativeOnly ? ["native"] : ["native", "markdown"]) if (!sameHash(await read(this.file(kind)), expected[kind])) throw fail(`External ${kind} changes or unknown destination`, true);
        const dir = path.join(this.home, generation.generation); await fs.mkdir(dir);
        await durableWrite(path.join(dir, "native"), generation.native); if (!nativeOnly) await durableWrite(path.join(dir, "markdown"), generation.markdown);
        const intent = { version: nativeOnly ? 2 : 1, resourceId: this.resourceId, generation: generation.generation, nativeName: this.nativeName, markdownName: this.markdownName,
          profile: generation.profile ?? "mutable-document", nativeHash: hash(generation.native), markdownHash: nativeOnly ? null : hash(generation.markdown), expected };
        await durableWrite(path.join(dir, "intent.json"), JSON.stringify(intent)); await syncDir(dir);
        await durableWrite(path.join(this.home, "pending.json"), JSON.stringify({ version: 1, generation: generation.generation })); await syncDir(this.home);
        return await this.attempt(intent);
      } catch (error) { return { phase: "failed", error: error.message, conflict: !!error.conflict }; }
    });
  }
  async pending() {
    const raw = await read(path.join(this.home, "pending.json")); if (!raw) return;
    const p = JSON.parse(raw);
    if (!fields(p, ["version", "generation"]) || p.version !== 1 || !validGeneration(p.generation)) throw fail("Invalid pending record", true);
    const intent = JSON.parse(await fs.readFile(path.join(this.home, p.generation, "intent.json")));
    if (!fields(intent, ["version", "resourceId", "generation", "nativeName", "markdownName", "profile", "nativeHash", "markdownHash", "expected"]) || ![1, 2].includes(intent.version) || intent.resourceId !== this.resourceId || intent.generation !== p.generation || intent.nativeName !== this.nativeName || intent.markdownName !== this.markdownName || !fields(intent.expected, ["native", "markdown"]) || ![intent.nativeHash, intent.markdownHash, ...Object.values(intent.expected)].every(h => h === null || /^[0-9a-f]{64}$/.test(h))) throw fail("Invalid pair intent", true);
    if (intent.version === 2 && (intent.markdownHash !== null || intent.expected.markdown !== null)) throw fail("Invalid native-only intent", true);
    return intent;
  }
  async recover() {
    return this.lock(async () => {
      try {
        const intent = await this.pending();
        if (intent) return this.attempt(intent);
        const receipt = await this.receipt(); if (!receipt) return { phase: "failed", error: "No pair to recover" };
        for (const kind of receipt.version === 2 ? ["native"] : ["native", "markdown"]) if (!sameHash(await read(this.file(kind)), receipt[kind + "Hash"])) throw fail(`External ${kind} changes`, true);
        const native = (await fs.readFile(this.file("native"))).toString(); await this.dependencies(native);
        return { phase: "saved", generation: receipt.generation, native };
      } catch (error) { return { phase: "failed", error: error.message, conflict: !!error.conflict }; }
    });
  }
  async displaced(intent, kind) { return checkDisplacedFile(this,intent,kind); }
  async publish(intent, kind, data) { return publishManagedFile(this,intent,kind,data); }
  async attempt(intent) {
    try {
      const dir = path.join(this.home, intent.generation), native = await fs.readFile(path.join(dir, "native")), markdown = intent.version === 2 ? undefined : await fs.readFile(path.join(dir, "markdown"));
      const kinds = intent.version === 2 ? ["native"] : ["native", "markdown"];
      if (hash(native) !== intent.nativeHash || (markdown !== undefined && hash(markdown) !== intent.markdownHash)) throw fail("Captured generation bytes changed", true);
      await this.dependencies(native.toString());
      await this.publish(intent, "native", native); if (markdown !== undefined) await this.publish(intent, "markdown", markdown);
      await this.fault("before-receipt", { intent });
      await this.dependencies(native.toString());
      for (const kind of kinds) { await this.displaced(intent, kind); if (!sameHash(await read(this.file(kind)), intent[kind + "Hash"])) throw fail(`External ${kind} changes at confirmation`, true); }
      const receipt = { version: intent.version, resourceId: this.resourceId, generation: intent.generation, nativeName: this.nativeName, markdownName: this.markdownName, nativeHash: intent.nativeHash, markdownHash: intent.markdownHash };
      const temp = path.join(this.home, `receipt-${randomUUID()}`); await durableWrite(temp, JSON.stringify(receipt)); await fs.rename(temp, path.join(this.home, "receipt.json")); await syncDir(this.home);
      await this.fault("after-receipt", { intent });
      for (const kind of kinds) { await this.displaced(intent, kind); if (!sameHash(await read(this.file(kind)), intent[kind + "Hash"])) throw fail(`External ${kind} changes after receipt`, true); }
      await fs.unlink(path.join(this.home, "pending.json")); await syncDir(this.home);
      return { phase: "saved", generation: intent.generation, native: native.toString() };
    } catch (error) {
      const canonical = sameHash(await read(this.file("native")), intent.nativeHash), md = intent.version === 2 || sameHash(await read(this.file("markdown")), intent.markdownHash);
      return { phase: canonical ? md ? "confirmation-pending" : "canonical-saved-markdown-pending" : "failed", generation: intent.generation, error: error.message, conflict: !!error.conflict };
    }
  }
  /** Read-only compare/import input. Never treats Markdown as native authority. */
  async compare(generated) { const external = await read(this.file("markdown")); return { external: external?.toString(), externalHash: external ? hash(external) : null, generated }; }
}

/** Shared preservation primitive; callers retain their own journal/identity protocol. */
export async function checkDisplacedFile(adapter,intent,kind){
    const backup = path.join(adapter.home, intent.generation, `${kind}.previous`), prior = await read(backup);
    if (prior && !sameHash(prior, intent.expected[kind])) throw fail(`External ${kind} write preserved in ${backup}`, true);
}
export async function publishManagedFile(adapter,intent,kind,data){
    const file = adapter.file(kind), desired = intent[kind + "Hash"], priorHash = intent.expected[kind];
    await checkDisplacedFile(adapter, intent, kind);
    if (sameHash(await read(file), desired)) return;
    await adapter.fault(`before-${kind}`, { file, intent });
    const current = await read(file);
    const backup = path.join(adapter.home, intent.generation, `${kind}.previous`);
    if (await read(backup)) {
      if (current) throw fail(`Unexpected ${kind} after interrupted replacement`, true);
    } else if (current !== undefined) {
      if (priorHash === null) throw fail(`Unknown ${kind} destination`, true);
      // Rename preserves the ACTUAL displaced inode, even if another writer raced.
      await fs.rename(file, backup); await syncDir(adapter.root); await syncDir(path.dirname(backup));
      await adapter.fault(`displaced-${kind}`, { file, backup, intent });
      await checkDisplacedFile(adapter, intent, kind);
    } else if (priorHash !== null) throw fail(`Expected ${kind} disappeared`, true);
    const temp = path.join(adapter.home, intent.generation, `${kind}.publish-${randomUUID()}`);
    await durableWrite(temp, data);
    try { await adapter.fault(`publish-${kind}`, { file, intent }); await fs.link(temp, file); await syncDir(adapter.root); }
    catch (error) { if (error.code === "EEXIST") throw fail(`External ${kind} created during publication; all files preserved`, true); throw error; }
    finally { await fs.unlink(temp); }
    await adapter.fault(`after-${kind}`, { file, intent });
    await checkDisplacedFile(adapter, intent, kind);
    if (!sameHash(await read(file), desired)) throw fail(`External ${kind} changes after publication`, true);
}

export async function validateResourceDependencies(native,resourceId,locations=new Map()) {
    const owner = decodeNative(bytes(native)); if (owner.resourceId !== resourceId) throw fail("Native resource identity mismatch", true);
    const known = new Map([[owner.resourceId, owner]]);
    for (const [id, location] of locations) {
      if (id === owner.resourceId) continue;
      const data = await read(location); if (!data) continue;
      const r = decodeNative(data); if (r.resourceId !== id) throw fail("Dependency catalog identity mismatch", true); known.set(id, r);
    }
    const claims = new Map();
    const owned = r => Object.values(r.placements).filter(p => p.kind === "owned" && p.target.kind === "external");
    for (const [id, r] of known) for (const p of owned(r)) {
      const child = p.target.reference.source.resourceId;
      if (claims.has(child)) throw fail("Conflicting owned-resource evidence", true); claims.set(child, id);
    }
    const visit = (id, active = new Set()) => {
      if (active.has(id)) throw fail("Owned-resource cycle", true);
      const r = known.get(id); if (!r) throw fail(`Required owned resource unavailable: ${id}`);
      for (const p of owned(r)) {
        const t = p.target.reference, child = known.get(t.source.resourceId), root = child?.placements[child.rootPlacementKey];
        if (!child || root.target.kind !== "local" || child.contents[root.target.contentKey].payload.id !== t.targetId) throw fail(`Required owned resource unavailable: ${t.source.resourceId}`);
        visit(t.source.resourceId, new Set(active).add(id));
      }
    }; visit(owner.resourceId);
}
