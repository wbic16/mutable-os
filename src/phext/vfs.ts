/**
 * PhextVFS: a virtual filesystem backed by a single phext file.
 *
 * Phase 1 of the PhextVFS (see the evaluation in
 * `phext-vfs-evaluation.md`): every Mutable I/O path is to be mapped to a
 * virtual fs layer that routes into one phext per Cavern, so a Cavern's
 * knowledge work becomes one shippable file. This module is the core —
 * the path ↔ coordinate mapping, directory index scrolls, chunking,
 * checksums — built on the lattice engine (`lattice.ts`). It is wired
 * into no server path yet; Phase 2 adds the gates backend behind a flag.
 * Phase 3a adds two operations the native document stores need:
 * `rename` (exclusive, chunk-preserving) and caller-named chunk
 * boundaries on `writeFile` (`slices`, one scroll run per slice).
 *
 * ## Strata (the library arm)
 *
 * The library component names the stratum, mirroring today's on-disk
 * homes so each existing I/O path lands in exactly one region:
 *
 *   1 documents      the vault document tree
 *   2 pair journals  `.mutable-pair-*` homes
 *   3 knowledge      `.mutable/` (ledger / facts records, never DB bytes)
 *   4 history        `.memory/` record homes
 *   5 services       `.mutable/jobs`, `.mutable/publications`
 *   6 assets         `.mutable/assets`
 *   7 control        `.mutable-relocations`, `.control`
 *   9 VFS index      manifest + per-scroll checksums (below)
 *   8, 10+           reserved; new strata take new libraries
 *
 * A Mutable path dispatches to a stratum by its first component(s):
 * `.mutable-pair-*` → 2, `.mutable-relocations` / `.control` → 7,
 * `.memory` → 4, `.mutable/jobs|publications` → 5, `.mutable/assets` → 6,
 * any other `.mutable/*` → 3, everything else → 1. The stratum-relative
 * path drops the `.mutable` component for strata 3/5/6 (their root *is*
 * the `.mutable` directory) and keeps the full path otherwise.
 *
 * ## Path ↔ coordinate mapping (within a stratum)
 *
 * Arms are spent structurally, one per path level, levels in
 * `coordinate.ts` order (shelf, series, collection, volume, book,
 * chapter, section, scroll):
 *
 * - A directory at depth d (d components below the stratum root; the root
 *   is depth 0) has an *address*: the d slot values on levels 1..d. Its
 *   **index scroll** sits at the home coordinate — the address followed
 *   by all 1s — and holds JSON `{v: 1, nextSlot, entries: {name → entry}}`. Browsing
 *   the phext is browsing the filesystem: listing a directory is reading
 *   one index scroll, and every lookup is an O(1) lattice lookup per
 *   level.
 * - **Slot 1 is never a child**: in every directory, child slots start at
 *   2, so slot 1 with all lower arms at 1 is always the directory's own
 *   index coordinate and can never collide with a child. Slots are
 *   assigned from a high-water mark persisted in the index scroll and
 *   are never reused after an unlink, so a coordinate, once assigned,
 *   means one node for the life of the file.
 * - A file's address is its directory's address plus its slot. Its
 *   content lives in chunk scrolls: the arm after the file's slot is the
 *   *part* arm (1 = content; 2+ reserved for document parts in Phase 3),
 *   and the scroll arm is the 1-based chunk index. Intermediate arms are
 *   1. A directory index entry for a file records
 *   `{kind, slot, format, size, chunks, sha256}` — the whole-file
 *   SHA-256 of the caller's bytes.
 * - **Depth cap and folding.** Files need slot + part + scroll arms, so
 *   structural descent covers directories to depth 5. A path whose
 *   remaining suffix would go deeper is *folded*: the whole suffix
 *   (e.g. `deep/dir/file.ink`) becomes one index entry in the depth-5
 *   directory, named by the suffix. Folded files store chunks at their
 *   slot exactly like structural ones; folded directories are marker
 *   entries, and listing or stat-ing one synthesizes its children from
 *   the folded entries beneath it. Folded entries draw slots from the
 *   same per-directory sequence as structural ones — phext arms are
 *   unary (reaching component N costs N−1 break bytes in the serialized
 *   file), so slot values must stay small and sequential; a hash-derived
 *   slot would explode the encoding. Resolution always reads slots back
 *   from index scrolls — the mapping is deterministic at creation and
 *   stable across reopens.
 *
 * ## File content encoding
 *
 * - **Text** (default): the file's UTF-8 bytes, chunked at `chunkSize`
 *   (default 64 KB) with each chunk boundary snapped back to a codepoint
 *   boundary, so every scroll is valid UTF-8 and chunk concatenation is
 *   byte-identical to the input. Text must be valid UTF-8 and contain no
 *   phext dimension break bytes (the lattice rejects those); stores with
 *   arbitrary bytes use binary.
 * - **Binary** (`format: "binary"` in the index entry): raw bytes are
 *   split into chunks of `3⌊chunkSize/4⌋` bytes and each chunk is stored
 *   base64-encoded (ASCII, self-contained per chunk), costing ≈ +33 %
 *   over the raw bytes in exchange for a package that leaves nothing
 *   behind.
 *
 * ## Integrity (library 9)
 *
 * The L9 home scroll is the manifest:
 * `{format: "mutable-phext-vfs", version, chunkSize, checksumScrolls,
 * scrolls}`. Behind it, a series of checksum scrolls (same address, scroll
 * arm 2, 3, …) holds JSON maps of coordinate → SHA-256 of that scroll's
 * bytes, covering every populated scroll except the checksum series
 * itself. `flush()` rewrites the series from the live state; `open()`
 * verifies it (option `verify: false` skips) and throws
 * {@link PhextVfsIntegrityError} naming every mismatched coordinate and,
 * where a directory walk resolves it, its path. On flush, the previous
 * on-disk generation is first copied to `<path>.bak`, then the new phext
 * is written atomically by the lattice (tmp + rename).
 *
 * Errors are {@link PhextVfsError} with a `code` in the fs tradition
 * (ENOENT, ENOTDIR, EISDIR, EEXIST, EINVAL, ECLOSED, EINTEGRITY,
 * ELOCKED).
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import {
  formatCoordinate,
  type PhextCoordinate,
} from "./coordinate.js";
import { PhextLattice } from "./lattice.js";

export const PHEXT_VFS_FORMAT = "mutable-phext-vfs";
export const PHEXT_VFS_VERSION = 1;
export const DEFAULT_CHUNK_SIZE = 65536;

/** Stratum library numbers (evaluation §3). 8 and 10+ are reserved. */
export const VFS_STRATA = {
  documents: 1,
  pairJournals: 2,
  knowledge: 3,
  history: 4,
  services: 5,
  assets: 6,
  control: 7,
  index: 9,
} as const;

const STRUCTURAL_DIR_LIMIT = 5;
const FIRST_SLOT = 2;
const PART_CONTENT = 1;
const CHECKSUMS_PER_SCROLL = 512;
const INDEX_LIBRARY = VFS_STRATA.index;

const BREAK_BYTES = new Set([0x01, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x1f]);

export type PhextVfsFileFormat = "text" | "binary";

export interface PhextVfsOptions {
  /** Chunk size in bytes for new writes (default 65536). */
  chunkSize?: number;
  /** Verify L9 checksums at open (default true). */
  verify?: boolean;
}

export interface PhextVfsStat {
  type: "file" | "directory";
  /** Home coordinate: the directory's index scroll, or the file's first chunk. */
  coordinate: string;
  /** Files only: caller-visible byte length. */
  size?: number;
  format?: PhextVfsFileFormat;
  chunks?: number;
  /** Files only: SHA-256 of the caller's bytes. */
  sha256?: string;
}

export interface PhextVfsDirEntry {
  name: string;
  type: "file" | "directory";
}

export class PhextVfsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PhextVfsError";
    this.code = code;
  }
}

export interface PhextVfsMismatch {
  coordinate: string;
  path?: string;
  reason: string;
}

export class PhextVfsIntegrityError extends PhextVfsError {
  readonly mismatches: readonly PhextVfsMismatch[];
  constructor(mismatches: PhextVfsMismatch[]) {
    super(
      "EINTEGRITY",
      `PhextVFS integrity check failed: ${mismatches.length} scroll(s) ` +
        `do not match the L9 index: ` +
        mismatches
          .map((m) => `${m.coordinate}${m.path ? ` (${m.path})` : ""}: ${m.reason}`)
          .join("; "),
    );
    this.name = "PhextVfsIntegrityError";
    this.mismatches = mismatches;
  }
}

interface FileIndexEntry {
  kind: "file";
  slot: number;
  hashed?: boolean;
  format: PhextVfsFileFormat;
  size: number;
  chunks: number;
  sha256: string;
}

interface DirIndexEntry {
  kind: "dir";
  slot: number;
  hashed?: boolean;
}

type IndexEntry = FileIndexEntry | DirIndexEntry;

interface DirIndex {
  v: 1;
  /** High-water mark for slot allocation; slots are never reused. */
  nextSlot: number;
  entries: Record<string, IndexEntry>;
}

interface Manifest {
  format: string;
  version: number;
  chunkSize: number;
  checksumScrolls: number;
  scrolls: number;
}

type ResolvedNode =
  | {
      type: "directory";
      library: number;
      address: number[];
      virtual: boolean;
      /** For a folded (virtual) directory: the depth-5 ancestor holding its entries. */
      foldAncestor?: number[];
      foldSuffix?: string;
    }
  | {
      type: "file";
      library: number;
      /** The directory (or fold ancestor) whose index holds the entry. */
      parentAddress: number[];
      entryName: string;
      entry: FileIndexEntry;
    };

const sha256Hex = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Build a coordinate tuple from a library + arm values (levels 1..n). */
function coordinateOf(library: number, arms: readonly number[]): PhextCoordinate {
  const tuple = [library, 1, 1, 1, 1, 1, 1, 1, 1];
  arms.forEach((value, i) => {
    tuple[i + 1] = value;
  });
  return tuple as unknown as PhextCoordinate;
}

/** A directory's index scroll coordinate: its address, lower arms at 1. */
function directoryCoordinate(library: number, address: readonly number[]): PhextCoordinate {
  return coordinateOf(library, address);
}

/** A file's chunk coordinate: address + part arm, chunk index on the scroll arm. */
function chunkCoordinate(
  library: number,
  fileAddress: readonly number[],
  chunkIndex: number,
): PhextCoordinate {
  const tuple = [library, 1, 1, 1, 1, 1, 1, 1, 1];
  fileAddress.forEach((value, i) => {
    tuple[i + 1] = value;
  });
  tuple[fileAddress.length + 1] = PART_CONTENT;
  tuple[8] = chunkIndex;
  return tuple as unknown as PhextCoordinate;
}

const MANIFEST_COORDINATE = coordinateOf(INDEX_LIBRARY, []);

function checksumCoordinate(seriesIndex: number): PhextCoordinate {
  const tuple = [INDEX_LIBRARY, 1, 1, 1, 1, 1, 1, 1, 1];
  tuple[8] = seriesIndex + 2; // scroll arm 2, 3, … (1 is the manifest)
  return tuple as unknown as PhextCoordinate;
}

function isChecksumCoordinate(coordinate: PhextCoordinate): boolean {
  return (
    coordinate[0] === INDEX_LIBRARY &&
    coordinate.slice(1, 8).every((value) => value === 1) &&
    coordinate[8] >= 2
  );
}

/** Split a vp path into components, rejecting traversal and empties. */
function splitPath(path: string): string[] {
  if (typeof path !== "string" || path === "" || !path.startsWith("/")) {
    throw new PhextVfsError("EINVAL", `PhextVFS paths are absolute: ${JSON.stringify(path)}`);
  }
  const components = path.split("/").filter((part) => part !== "" && part !== ".");
  if (components.some((part) => part === "..")) {
    throw new PhextVfsError("EINVAL", `PhextVFS paths may not contain "..": ${path}`);
  }
  return components;
}

interface Dispatched {
  library: number;
  rel: string[];
  /** True for the exact path "/.mutable", which spans strata 3/5/6. */
  mutableHome: boolean;
}

function dispatch(path: string): Dispatched {
  const components = splitPath(path);
  if (components.length === 0) {
    return { library: VFS_STRATA.documents, rel: [], mutableHome: false };
  }
  const [first, second] = components;
  if (first.startsWith(".mutable-pair-")) {
    return { library: VFS_STRATA.pairJournals, rel: components, mutableHome: false };
  }
  if (first === ".mutable-relocations" || first === ".control") {
    return { library: VFS_STRATA.control, rel: components, mutableHome: false };
  }
  if (first === ".memory") {
    return { library: VFS_STRATA.history, rel: components, mutableHome: false };
  }
  if (first === ".mutable") {
    if (components.length === 1) {
      return { library: VFS_STRATA.knowledge, rel: [], mutableHome: true };
    }
    if (second === "jobs" || second === "publications") {
      return { library: VFS_STRATA.services, rel: components.slice(1), mutableHome: false };
    }
    if (second === "assets") {
      return { library: VFS_STRATA.assets, rel: components.slice(1), mutableHome: false };
    }
    return { library: VFS_STRATA.knowledge, rel: components.slice(1), mutableHome: false };
  }
  return { library: VFS_STRATA.documents, rel: components, mutableHome: false };
}

/** The Mutable-path prefix a stratum's relative paths hang from. */
function stratumPrefix(library: number): string {
  switch (library) {
    case VFS_STRATA.knowledge:
    case VFS_STRATA.services:
    case VFS_STRATA.assets:
      return "/.mutable/";
    default:
      return "/";
  }
}

/** Split UTF-8 bytes into chunks whose boundaries fall on codepoints. */
function splitUtf8Chunks(bytes: Buffer, size: number): Buffer[] {
  const chunks: Buffer[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + size, bytes.length);
    if (end < bytes.length) {
      let snapped = end;
      while (snapped > start && (bytes[snapped] & 0xc0) === 0x80) snapped--;
      if (snapped === start) {
        // One codepoint larger than the chunk size: take it whole.
        snapped = start + 1;
        while (snapped < bytes.length && (bytes[snapped] & 0xc0) === 0x80) snapped++;
      }
      end = snapped;
    }
    chunks.push(bytes.subarray(start, end));
    start = end;
  }
  return chunks;
}

export class PhextVFS {
  /** The lattice engine underneath (Phase 2 seam; treat scrolls as VFS-owned). */
  readonly lattice: PhextLattice;
  private readonly filePath: string;
  private readonly chunkSize: number;
  private isClosed = false;
  /**
   * SHA-256 of the on-disk bytes this instance's base was loaded from
   * (or last saved). flush() compares it against the live file to
   * detect generations saved by another instance (Phase 4).
   */
  private diskFingerprint: string | undefined;

  private constructor(filePath: string, lattice: PhextLattice, chunkSize: number) {
    this.filePath = filePath;
    this.lattice = lattice;
    this.chunkSize = chunkSize;
  }

  /** Create a new, empty VFS phext. Fails if the file already exists. */
  static create(path: string, options: PhextVfsOptions = {}): PhextVFS {
    if (existsSync(path)) {
      throw new PhextVfsError("EEXIST", `PhextVFS file already exists: ${path}`);
    }
    const vfs = new PhextVFS(
      path,
      PhextLattice.empty(),
      options.chunkSize ?? DEFAULT_CHUNK_SIZE,
    );
    vfs.writeManifest(0, 0);
    vfs.flush();
    return vfs;
  }

  /** Open an existing VFS phext, verifying its L9 checksums by default. */
  static open(path: string, options: PhextVfsOptions = {}): PhextVFS {
    const bytes = readFileSync(path);
    const lattice = PhextLattice.open(path);
    const manifest = readManifest(lattice);
    if (manifest === undefined) {
      throw new PhextVfsError(
        "EINVAL",
        `Not a PhextVFS file (no L9 manifest): ${path}`,
      );
    }
    const vfs = new PhextVFS(
      path,
      lattice,
      options.chunkSize ?? manifest.chunkSize ?? DEFAULT_CHUNK_SIZE,
    );
    vfs.diskFingerprint = sha256Hex(bytes);
    if (options.verify !== false) vfs.verifyIntegrity(manifest);
    return vfs;
  }

  static openOrCreate(path: string, options: PhextVfsOptions = {}): PhextVFS {
    return existsSync(path) ? PhextVFS.open(path, options) : PhextVFS.create(path, options);
  }

  get path(): string {
    return this.filePath;
  }

  get closed(): boolean {
    return this.isClosed;
  }

  // ------------------------------------------------------------- files

  /** Read a whole virtual file. Throws ENOENT / EISDIR as appropriate. */
  readFile(path: string): Buffer {
    this.assertOpen();
    const node = this.resolveOrThrow(path);
    if (node.type === "directory") {
      throw new PhextVfsError("EISDIR", `Cannot read a directory: ${path}`);
    }
    return this.readFileEntry(node);
  }

  /** {@link readFile} decoded as UTF-8 (for text-format files). */
  readTextFile(path: string): string {
    return this.readFile(path).toString("utf8");
  }

  /**
   * Write a whole virtual file, creating parent directories as needed.
   * `options.format` defaults to "text" for strings; for Buffers it
   * defaults to "text" as well — binary data must opt in explicitly so
   * non-UTF-8 bytes are never silently mangled.
   *
   * `options.slices` (Phase 3a, text format only) lets the caller name
   * the chunk boundaries: the slices must partition `data` exactly
   * (their concatenation is compared byte-for-byte), and each slice is
   * stored as its own run of consecutive chunk scrolls — sub-split only
   * when a single slice exceeds the chunk size — so reassembly by
   * concatenation stays byte-identical while scroll boundaries carry
   * caller meaning (e.g. one slice per block of a native document
   * envelope). The index records the same whole-file size and SHA-256
   * either way; nothing downstream can tell sliced from opaque writes.
   */
  writeFile(
    path: string,
    data: Buffer | string,
    options: { format?: PhextVfsFileFormat; slices?: readonly Buffer[] } = {},
  ): void {
    this.assertOpen();
    const format = options.format ?? "text";
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    if (format === "text") assertTextPayload(bytes, path);

    const { library, rel, mutableHome } = dispatch(path);
    if (mutableHome || rel.length === 0) {
      throw new PhextVfsError("EISDIR", `Cannot write a file over a directory: ${path}`);
    }
    const filename = rel[rel.length - 1];
    const parent = this.ensureParent(library, rel.slice(0, -1));

    const parentIndex = this.readIndex(parent.library, parent.address);
    if (parent.foldSuffix !== undefined) {
      const head = parentIndex.entries[parent.foldSuffix.split("/")[0]];
      if (head !== undefined && !head.hashed && head.kind === "file") {
        throw new PhextVfsError(
          "ENOTDIR",
          `Path component is not a directory: ${parent.foldSuffix.split("/")[0]}`,
        );
      }
    }
    const entryName = parent.foldSuffix === undefined
      ? filename
      : `${parent.foldSuffix}/${filename}`;
    const existing = parentIndex.entries[entryName];
    if (existing !== undefined && existing.kind === "dir") {
      throw new PhextVfsError("EISDIR", `Cannot write a file over a directory: ${path}`);
    }
    if (existing !== undefined && existing.kind === "file") {
      this.deleteChunks(parent.library, [...parent.address, existing.slot], existing.chunks);
    }

    const slot = existing !== undefined && existing.kind === "file"
      ? existing.slot
      : allocateSlot(parentIndex);
    const fileAddress = [...parent.address, slot];
    const chunkTexts = options.slices !== undefined
      ? encodeSlices(bytes, options.slices, format, this.chunkSize, path)
      : encodeChunks(bytes, format, this.chunkSize);
    chunkTexts.forEach((text, i) => {
      try {
        this.lattice.writeScroll(chunkCoordinate(library, fileAddress, i + 1), text);
      } catch (error) {
        throw new PhextVfsError(
          "EINVAL",
          `Cannot store ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
    parentIndex.entries[entryName] = {
      kind: "file",
      slot,
      ...(parent.foldSuffix === undefined ? {} : { hashed: true }),
      format,
      size: bytes.length,
      chunks: chunkTexts.length,
      sha256: sha256Hex(bytes),
    } satisfies FileIndexEntry;
    this.writeIndex(parent.library, parent.address, parentIndex);
  }

  /** Append to a virtual file (creating it if absent), preserving its format. */
  appendFile(
    path: string,
    data: Buffer | string,
    options: { format?: PhextVfsFileFormat } = {},
  ): void {
    this.assertOpen();
    const node = this.resolve(path);
    if (node === undefined) {
      this.writeFile(path, data, options);
      return;
    }
    if (node.type === "directory") {
      throw new PhextVfsError("EISDIR", `Cannot append to a directory: ${path}`);
    }
    const current = this.readFile(path);
    const extra = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    this.writeFile(path, Buffer.concat([current, extra]), {
      format: options.format ?? node.entry.format,
    });
  }

  /** Create a directory (and any missing parents). Idempotent for existing dirs. */
  mkdir(path: string): void {
    this.assertOpen();
    const node = this.resolve(path);
    if (node !== undefined) {
      if (node.type === "directory") return;
      throw new PhextVfsError("EEXIST", `A file already exists at: ${path}`);
    }
    const { library, rel, mutableHome } = dispatch(path);
    if (mutableHome || rel.length === 0) return; // roots always exist
    const parent = this.ensureParent(library, rel.slice(0, -1));
    const parentIndex = this.readIndex(parent.library, parent.address);
    if (parent.foldSuffix === undefined && parent.address.length >= STRUCTURAL_DIR_LIMIT) {
      // A directory at the depth cap: it becomes a folded marker in its
      // parent's index (its children fold beneath it the same way).
      const name = rel[rel.length - 1];
      parentIndex.entries[name] = {
        kind: "dir",
        slot: allocateSlot(parentIndex),
        hashed: true,
      };
      this.writeIndex(parent.library, parent.address, parentIndex);
      return;
    }
    if (parent.foldSuffix === undefined) {
      const name = rel[rel.length - 1];
      const address = [...parent.address, allocateSlot(parentIndex)];
      parentIndex.entries[name] = { kind: "dir", slot: address[address.length - 1] };
      this.writeIndex(parent.library, parent.address, parentIndex);
      this.writeIndex(library, address, emptyIndex());
    } else {
      const entryName = `${parent.foldSuffix}/${rel[rel.length - 1]}`;
      parentIndex.entries[entryName] = {
        kind: "dir",
        slot: allocateSlot(parentIndex),
        hashed: true,
      };
      this.writeIndex(parent.library, parent.address, parentIndex);
    }
  }

  /**
   * Remove a file, or a directory that is empty (no entries, nothing
   * folded beneath it). Freed slots are never reused.
   */
  unlink(path: string): void {
    this.assertOpen();
    const { library, rel, mutableHome } = dispatch(path);
    if (mutableHome || rel.length === 0) {
      throw new PhextVfsError("EINVAL", `Cannot unlink a stratum root: ${path}`);
    }
    const node = this.resolve(path);
    if (node === undefined) {
      throw new PhextVfsError("ENOENT", `No such file or directory: ${path}`);
    }
    if (node.type === "file") {
      const parentIndex = this.readIndex(node.library, node.parentAddress);
      this.deleteChunks(node.library, [...node.parentAddress, node.entry.slot], node.entry.chunks);
      delete parentIndex.entries[node.entryName];
      this.writeIndex(node.library, node.parentAddress, parentIndex);
      return;
    }
    // Directory: must be empty.
    if (node.virtual) {
      const ancestor = this.readIndex(node.library, node.foldAncestor!);
      const prefix = `${node.foldSuffix!}/`;
      const occupied = Object.keys(ancestor.entries).some((name) =>
        name.startsWith(prefix),
      );
      if (occupied) {
        throw new PhextVfsError("EINVAL", `Directory is not empty: ${path}`);
      }
      delete ancestor.entries[node.foldSuffix!];
      this.writeIndex(node.library, node.foldAncestor!, ancestor);
      return;
    }
    const ownIndex = this.readIndex(node.library, node.address);
    if (Object.keys(ownIndex.entries).length > 0) {
      throw new PhextVfsError("EINVAL", `Directory is not empty: ${path}`);
    }
    this.lattice.deleteScroll(directoryCoordinate(node.library, node.address));
    const parentAddr = node.address.slice(0, -1);
    const parentIdx = this.readIndex(node.library, parentAddr);
    for (const [name, entry] of Object.entries(parentIdx.entries)) {
      if (entry.kind === "dir" && !entry.hashed && entry.slot === node.address[node.address.length - 1]) {
        delete parentIdx.entries[name];
      }
    }
    this.writeIndex(node.library, parentAddr, parentIdx);
  }

  /**
   * Rename a file or directory (Phase 3a), with the exclusive semantics
   * of the native store's relocation primitive (renameat2
   * RENAME_NOREPLACE): the destination must not exist, and a directory
   * moves with everything beneath it. File chunk scrolls are copied
   * verbatim to the destination address, so a sliced file keeps its
   * chunk boundaries and every byte; only the index entries change.
   * Callers that want POSIX replace semantics unlink the destination
   * first (the phext-fs facade does exactly that).
   */
  rename(fromPath: string, toPath: string): void {
    this.assertOpen();
    const fromParts = splitPath(fromPath);
    const toParts = splitPath(toPath);
    if (fromParts.length === 0 || toParts.length === 0) {
      throw new PhextVfsError("EINVAL", "Cannot rename a stratum root");
    }
    if (toPath === fromPath || toPath.startsWith(`${fromPath}/`)) {
      throw new PhextVfsError("EINVAL", `Cannot rename ${fromPath} into itself`);
    }
    const source = this.resolve(fromPath);
    if (source === undefined) {
      throw new PhextVfsError("ENOENT", `No such file or directory: ${fromPath}`);
    }
    if (this.resolve(toPath) !== undefined) {
      throw new PhextVfsError("EEXIST", `Destination already exists: ${toPath}`);
    }
    if (source.type === "file") {
      this.moveFileEntry(fromPath, source, toPath);
      return;
    }
    this.mkdir(toPath);
    for (const child of this.listDir(fromPath)) {
      this.rename(`${fromPath}/${child.name}`, `${toPath}/${child.name}`);
    }
    this.unlink(fromPath);
  }

  /** Move one file's index entry, copying its chunk scrolls verbatim. */
  private moveFileEntry(
    fromPath: string,
    node: Extract<ResolvedNode, { type: "file" }>,
    toPath: string,
  ): void {
    const { library, rel, mutableHome } = dispatch(toPath);
    if (mutableHome || rel.length === 0) {
      throw new PhextVfsError("EISDIR", `Cannot rename a file over a directory: ${toPath}`);
    }
    const filename = rel[rel.length - 1];
    const parent = this.ensureParent(library, rel.slice(0, -1));
    const parentIndex = this.readIndex(parent.library, parent.address);
    if (parent.foldSuffix !== undefined) {
      const head = parentIndex.entries[parent.foldSuffix.split("/")[0]];
      if (head !== undefined && !head.hashed && head.kind === "file") {
        throw new PhextVfsError(
          "ENOTDIR",
          `Path component is not a directory: ${parent.foldSuffix.split("/")[0]}`,
        );
      }
    }
    const entryName = parent.foldSuffix === undefined
      ? filename
      : `${parent.foldSuffix}/${filename}`;
    const sourceIndex = this.readIndex(node.library, node.parentAddress);
    const sameIndex = node.library === parent.library
      && node.parentAddress.length === parent.address.length
      && node.parentAddress.every((value, i) => value === parent.address[i]);
    const destIndex = sameIndex ? sourceIndex : parentIndex;
    if (destIndex.entries[entryName] !== undefined) {
      throw new PhextVfsError("EEXIST", `Destination already exists: ${toPath}`);
    }
    const sourceAddress = [...node.parentAddress, node.entry.slot];
    const slot = allocateSlot(destIndex);
    const destAddress = [...parent.address, slot];
    for (let i = 1; i <= node.entry.chunks; i++) {
      const text = this.lattice.readScroll(chunkCoordinate(node.library, sourceAddress, i));
      if (text === undefined) {
        throw new PhextVfsError(
          "EINTEGRITY",
          `Missing chunk ${i} of ${fromPath} at ` +
            formatCoordinate(chunkCoordinate(node.library, sourceAddress, i)),
        );
      }
      this.lattice.writeScroll(chunkCoordinate(library, destAddress, i), text);
    }
    destIndex.entries[entryName] = {
      kind: "file",
      slot,
      ...(parent.foldSuffix === undefined ? {} : { hashed: true }),
      format: node.entry.format,
      size: node.entry.size,
      chunks: node.entry.chunks,
      sha256: node.entry.sha256,
    } satisfies FileIndexEntry;
    if (sameIndex) {
      delete destIndex.entries[node.entryName];
      this.writeIndex(parent.library, parent.address, destIndex);
    } else {
      this.writeIndex(parent.library, parent.address, destIndex);
      delete sourceIndex.entries[node.entryName];
      this.writeIndex(node.library, node.parentAddress, sourceIndex);
    }
    this.deleteChunks(node.library, sourceAddress, node.entry.chunks);
  }

  /** Stat a path; undefined when it does not exist. */
  stat(path: string): PhextVfsStat | undefined {
    this.assertOpen();
    const node = this.resolve(path);
    if (node === undefined) return undefined;
    if (node.type === "directory") {
      const address = node.virtual ? node.foldAncestor! : node.address;
      return {
        type: "directory",
        coordinate: formatCoordinate(directoryCoordinate(node.library, address)),
      };
    }
    const fileAddress = [...node.parentAddress, node.entry.slot];
    return {
      type: "file",
      coordinate: formatCoordinate(
        chunkCoordinate(node.library, fileAddress, 1),
      ),
      size: node.entry.size,
      format: node.entry.format,
      chunks: node.entry.chunks,
      sha256: node.entry.sha256,
    };
  }

  /** List a directory's immediate children, sorted by name. */
  listDir(path: string): PhextVfsDirEntry[] {
    this.assertOpen();
    const { mutableHome } = dispatch(path);
    if (mutableHome) {
      return mergeDirEntries([
        this.listStratumRoot(VFS_STRATA.knowledge),
        this.listStratumRoot(VFS_STRATA.services),
        this.listStratumRoot(VFS_STRATA.assets),
      ]);
    }
    if (splitPath(path).length === 0) {
      const entries = mergeDirEntries([
        this.listStratumRoot(VFS_STRATA.documents),
        this.listStratumRoot(VFS_STRATA.pairJournals),
        this.listStratumRoot(VFS_STRATA.history),
        this.listStratumRoot(VFS_STRATA.control),
      ]);
      const mutableUsed = [
        VFS_STRATA.knowledge,
        VFS_STRATA.services,
        VFS_STRATA.assets,
      ].some(
        (library) =>
          Object.keys(this.readIndex(library, []).entries).length > 0,
      );
      if (mutableUsed && !entries.some((e) => e.name === ".mutable")) {
        entries.push({ name: ".mutable", type: "directory" });
        entries.sort((a, b) => (a.name < b.name ? -1 : 1));
      }
      return entries;
    }
    const node = this.resolveOrThrow(path);
    if (node.type !== "directory") {
      throw new PhextVfsError("ENOTDIR", `Not a directory: ${path}`);
    }
    if (node.virtual) {
      return this.listFolded(node.library, node.foldAncestor!, node.foldSuffix!);
    }
    return this.listStructural(node.library, node.address);
  }

  // ------------------------------------------------------------- flush

  /**
   * Persist: rewrite the L9 checksum series from the live state, refresh
   * the manifest, keep the previous on-disk generation at `<path>.bak`,
   * and save the phext atomically. A no-op when nothing changed.
   *
   * Multi-instance discipline (Phase 4): several PhextVFS instances may
   * hold one file (the server lifecycle owns one; the knowledge worker
   * owns another) provided each writes disjoint strata. The whole
   * check-and-save section runs under a short cross-process mutex (a
   * token file in the system temp directory, keyed by the phext's
   * absolute path — nothing new appears beside the phext). Before
   * saving, the on-disk fingerprint is compared with the generation
   * this instance loaded: a mismatch means another instance saved
   * meanwhile, so the lattice rebases onto the on-disk generation
   * (foreign scrolls are adopted, this instance's overlay is replayed)
   * and the checksums are computed over the merged state. A foreign
   * file that is not a PhextVFS generation is refused, never adopted.
   */
  flush(): void {
    this.assertOpen();
    const release = acquireFlushMutex(this.filePath);
    try {
      this.flushLocked();
    } finally {
      release();
    }
  }

  private flushLocked(): void {
    if (existsSync(this.filePath)) {
      const diskBytes = readFileSync(this.filePath);
      const diskHash = sha256Hex(diskBytes);
      if (this.diskFingerprint !== undefined && diskHash !== this.diskFingerprint) {
        const foreign = PhextLattice.fromBuffer(diskBytes);
        if (readManifest(foreign) === undefined) {
          throw new PhextVfsError(
            "EINTEGRITY",
            `Refusing to adopt the on-disk generation of ${this.filePath}: ` +
              "it is not a PhextVFS file (no L9 manifest)",
          );
        }
        this.lattice.rebaseFromBuffer(diskBytes);
      }
      this.diskFingerprint = diskHash;
    }
    // The scrolls the checksum series must cover: everything populated
    // except the series itself (the manifest included).
    const covered = this.lattice
      .populatedCoordinates()
      .filter((coordinate) => !isChecksumCoordinate(coordinate));
    const seriesCount = Math.max(
      1,
      Math.ceil(covered.length / CHECKSUMS_PER_SCROLL),
    );
    // Manifest first (only when its text actually changes), so checksums
    // are computed over the manifest's final bytes.
    const manifestText = JSON.stringify({
      format: PHEXT_VFS_FORMAT,
      version: PHEXT_VFS_VERSION,
      chunkSize: this.chunkSize,
      checksumScrolls: seriesCount,
      scrolls: covered.length,
    } satisfies Manifest);
    if (this.lattice.readScroll(MANIFEST_COORDINATE) !== manifestText) {
      this.lattice.writeScroll(MANIFEST_COORDINATE, manifestText);
    }
    const sums: Record<string, string> = {};
    for (const coordinate of covered) {
      const bytes = this.lattice.readScrollBytes(coordinate);
      if (bytes !== undefined) sums[formatCoordinate(coordinate)] = sha256Hex(bytes);
    }
    const keys = Object.keys(sums).sort();
    for (let i = 0; i < seriesCount; i++) {
      const slice: Record<string, string> = {};
      for (const key of keys.slice(i * CHECKSUMS_PER_SCROLL, (i + 1) * CHECKSUMS_PER_SCROLL)) {
        slice[key] = sums[key];
      }
      const text = JSON.stringify(slice);
      if (this.lattice.readScroll(checksumCoordinate(i)) !== text) {
        this.lattice.writeScroll(checksumCoordinate(i), text);
      }
    }
    // Drop any series scrolls beyond the current count (shrunk tree).
    for (const coordinate of this.lattice.populatedCoordinates()) {
      if (
        isChecksumCoordinate(coordinate) &&
        coordinate[8] - 2 >= seriesCount
      ) {
        this.lattice.deleteScroll(coordinate);
      }
    }
    if (!this.lattice.isDirty()) return;
    if (existsSync(this.filePath)) copyFileSync(this.filePath, `${this.filePath}.bak`);
    this.lattice.saveToFile(this.filePath);
    try {
      this.diskFingerprint = sha256Hex(readFileSync(this.filePath));
    } catch {
      // The save landed; a fingerprint that cannot be refreshed only
      // costs a rebase check on the next flush, never correctness.
      this.diskFingerprint = undefined;
    }
  }

  /** Flush and close. Further operations throw ECLOSED. */
  close(): void {
    if (this.isClosed) return;
    this.flush();
    this.isClosed = true;
  }

  // ------------------------------------------------------------- internals

  private assertOpen(): void {
    if (this.isClosed) {
      throw new PhextVfsError("ECLOSED", `PhextVFS is closed: ${this.filePath}`);
    }
  }

  private readIndex(library: number, address: readonly number[]): DirIndex {
    const text = this.lattice.readScroll(directoryCoordinate(library, address));
    if (text === undefined) return emptyIndex();
    const parsed = JSON.parse(text) as DirIndex;
    if (parsed.v !== 1 || typeof parsed.entries !== "object" || parsed.entries === null) {
      throw new PhextVfsError(
        "EINTEGRITY",
        `Malformed directory index at ${formatCoordinate(directoryCoordinate(library, address))}`,
      );
    }
    return parsed;
  }

  private writeIndex(library: number, address: readonly number[], index: DirIndex): void {
    this.lattice.writeScroll(directoryCoordinate(library, address), JSON.stringify(index));
  }

  private writeManifest(checksumScrolls: number, scrolls: number): void {
    const manifest: Manifest = {
      format: PHEXT_VFS_FORMAT,
      version: PHEXT_VFS_VERSION,
      chunkSize: this.chunkSize,
      checksumScrolls,
      scrolls,
    };
    this.lattice.writeScroll(MANIFEST_COORDINATE, JSON.stringify(manifest));
  }

  private readFileEntry(node: Extract<ResolvedNode, { type: "file" }>): Buffer {
    const fileAddress = [...node.parentAddress, node.entry.slot];
    const parts: Buffer[] = [];
    for (let i = 1; i <= node.entry.chunks; i++) {
      const text = this.lattice.readScroll(chunkCoordinate(node.library, fileAddress, i));
      if (text === undefined) {
        throw new PhextVfsError(
          "EINTEGRITY",
          `Missing chunk ${i} of ${node.entryName} at ` +
            formatCoordinate(chunkCoordinate(node.library, fileAddress, i)),
        );
      }
      parts.push(
        node.entry.format === "binary"
          ? Buffer.from(text, "base64")
          : Buffer.from(text, "utf8"),
      );
    }
    const bytes = Buffer.concat(parts);
    if (bytes.length !== node.entry.size) {
      throw new PhextVfsError(
        "EINTEGRITY",
        `Size mismatch for ${node.entryName}: index says ${node.entry.size}, chunks hold ${bytes.length}`,
      );
    }
    return bytes;
  }

  private deleteChunks(library: number, fileAddress: number[], chunks: number): void {
    for (let i = 1; i <= chunks; i++) {
      this.lattice.deleteScroll(chunkCoordinate(library, fileAddress, i));
    }
  }

  /**
   * Resolve a path to its node. Structural entries win at every level;
   * folding is consulted only at the depth-5 directory. Undefined when
   * the path does not exist.
   */
  resolve(path: string): ResolvedNode | undefined {
    const { library, rel, mutableHome } = dispatch(path);
    if (mutableHome) {
      return { type: "directory", library, address: [], virtual: false };
    }
    let address: number[] = [];
    for (let i = 0; i < rel.length; i++) {
      if (address.length >= STRUCTURAL_DIR_LIMIT) {
        const index = this.readIndex(library, address);
        if (i === rel.length - 1) {
          // One component left at the depth cap: a structural file, or a
          // folded directory marker with this exact name.
          const entry = index.entries[rel[i]];
          if (entry !== undefined && !entry.hashed && entry.kind === "file") {
            return {
              type: "file",
              library,
              parentAddress: address,
              entryName: rel[i],
              entry,
            };
          }
          if (entry !== undefined && entry.hashed && entry.kind === "dir") {
            return {
              type: "directory",
              library,
              address,
              virtual: true,
              foldAncestor: address,
              foldSuffix: rel[i],
            };
          }
          const childPrefix = `${rel[i]}/`;
          if (Object.keys(index.entries).some((name) => name.startsWith(childPrefix))) {
            return {
              type: "directory",
              library,
              address,
              virtual: true,
              foldAncestor: address,
              foldSuffix: rel[i],
            };
          }
          return undefined;
        }
        // Folded territory: the rest of the path is one suffix.
        const suffix = rel.slice(i).join("/");
        const entry = index.entries[suffix];
        if (entry !== undefined && entry.hashed) {
          if (entry.kind === "file") {
            return {
              type: "file",
              library,
              parentAddress: address,
              entryName: suffix,
              entry,
            };
          }
          return {
            type: "directory",
            library,
            address,
            virtual: true,
            foldAncestor: address,
            foldSuffix: suffix,
          };
        }
        const prefix = `${suffix}/`;
        if (Object.keys(index.entries).some((name) => name.startsWith(prefix))) {
          return {
            type: "directory",
            library,
            address,
            virtual: true,
            foldAncestor: address,
            foldSuffix: suffix,
          };
        }
        return undefined;
      }
      const index = this.readIndex(library, address);
      const entry = index.entries[rel[i]];
      if (entry === undefined || entry.hashed) return undefined;
      const isLast = i === rel.length - 1;
      if (isLast) {
        if (entry.kind === "file") {
          return {
            type: "file",
            library,
            parentAddress: address,
            entryName: rel[i],
            entry,
          };
        }
        return {
          type: "directory",
          library,
          address: [...address, entry.slot],
          virtual: false,
        };
      }
      if (entry.kind !== "dir") return undefined;
      address = [...address, entry.slot];
    }
    return { type: "directory", library, address, virtual: false };
  }

  private resolveOrThrow(path: string): ResolvedNode {
    const node = this.resolve(path);
    if (node === undefined) {
      throw new PhextVfsError("ENOENT", `No such file or directory: ${path}`);
    }
    return node;
  }

  /**
   * Ensure the parent directory of a file/dir at `relDirs` exists,
   * creating structural directories down to the depth cap. Returns the
   * parent address, plus the folded suffix when the parent itself sits
   * beyond the cap.
   */
  private ensureParent(
    library: number,
    relDirs: string[],
  ): { library: number; address: number[]; foldSuffix?: string } {
    let address: number[] = [];
    for (let i = 0; i < relDirs.length; i++) {
      if (address.length >= STRUCTURAL_DIR_LIMIT) {
        return { library, address, foldSuffix: relDirs.slice(i).join("/") };
      }
      const index = this.readIndex(library, address);
      const entry = index.entries[relDirs[i]];
      if (entry !== undefined) {
        if (entry.kind !== "dir" || entry.hashed) {
          throw new PhextVfsError(
            "ENOTDIR",
            `Path component is not a directory: ${relDirs[i]}`,
          );
        }
        address = [...address, entry.slot];
        continue;
      }
      const slot = allocateSlot(index);
      index.entries[relDirs[i]] = { kind: "dir", slot };
      this.writeIndex(library, address, index);
      address = [...address, slot];
      this.writeIndex(library, address, emptyIndex());
    }
    return { library, address };
  }

  private listStratumRoot(library: number): PhextVfsDirEntry[] {
    return this.listStructural(library, []);
  }

  private listStructural(library: number, address: number[]): PhextVfsDirEntry[] {
    const index = this.readIndex(library, address);
    const out = new Map<string, PhextVfsDirEntry>();
    for (const [name, entry] of Object.entries(index.entries)) {
      if (entry.hashed) {
        const [head] = name.split("/");
        if (head !== undefined && !out.has(head)) {
          out.set(head, { name: head, type: "directory" });
        }
      } else {
        out.set(name, {
          name,
          type: entry.kind === "dir" ? "directory" : "file",
        });
      }
    }
    return [...out.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  private listFolded(
    library: number,
    ancestor: number[],
    suffix: string,
  ): PhextVfsDirEntry[] {
    const index = this.readIndex(library, ancestor);
    const prefix = `${suffix}/`;
    const out = new Map<string, PhextVfsDirEntry>();
    for (const [name, entry] of Object.entries(index.entries)) {
      if (!name.startsWith(prefix)) continue;
      const rest = name.slice(prefix.length);
      const [head, ...tail] = rest.split("/");
      if (head === undefined || out.has(head)) continue;
      out.set(head, {
        name: head,
        type: tail.length > 0 || entry.kind === "dir" ? "directory" : "file",
      });
    }
    return [...out.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  /** Verify every populated scroll against the L9 checksum series. */
  private verifyIntegrity(manifest: Manifest): void {
    const expected = new Map<string, string>();
    for (let i = 0; i < manifest.checksumScrolls; i++) {
      const text = this.lattice.readScroll(checksumCoordinate(i));
      if (text === undefined) {
        throw new PhextVfsIntegrityError([
          {
            coordinate: formatCoordinate(checksumCoordinate(i)),
            reason: "checksum scroll missing",
          },
        ]);
      }
      for (const [coordinate, sum] of Object.entries(
        JSON.parse(text) as Record<string, string>,
      )) {
        expected.set(coordinate, sum);
      }
    }
    const pathByCoordinate = this.buildPathMap();
    const mismatches: PhextVfsMismatch[] = [];
    for (const coordinate of this.lattice.populatedCoordinates()) {
      const key = formatCoordinate(coordinate);
      if (isChecksumCoordinate(coordinate)) continue;
      const recorded = expected.get(key);
      if (recorded === undefined) {
        mismatches.push({
          coordinate: key,
          path: pathByCoordinate.get(key),
          reason: "scroll not recorded in the L9 index",
        });
        continue;
      }
      const bytes = this.lattice.readScrollBytes(coordinate);
      if (bytes === undefined || sha256Hex(bytes) !== recorded) {
        mismatches.push({
          coordinate: key,
          path: pathByCoordinate.get(key),
          reason: "checksum mismatch",
        });
      }
      expected.delete(key);
    }
    for (const coordinate of expected.keys()) {
      mismatches.push({
        coordinate,
        path: pathByCoordinate.get(coordinate),
        reason: "scroll recorded in the L9 index is missing",
      });
    }
    if (mismatches.length > 0) throw new PhextVfsIntegrityError(mismatches);
  }

  /** Walk every stratum's directories, mapping content coordinates to paths. */
  private buildPathMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const library of [
      VFS_STRATA.documents,
      VFS_STRATA.pairJournals,
      VFS_STRATA.knowledge,
      VFS_STRATA.history,
      VFS_STRATA.services,
      VFS_STRATA.assets,
      VFS_STRATA.control,
    ]) {
      const prefix = stratumPrefix(library);
      const walk = (address: number[], rel: string[]): void => {
        const dirPath = prefix + rel.join("/");
        map.set(
          formatCoordinate(directoryCoordinate(library, address)),
          rel.length === 0 ? prefix.replace(/\/$/, "") || "/" : dirPath,
        );
        const index = this.readIndex(library, address);
        for (const [name, entry] of Object.entries(index.entries)) {
          if (entry.kind === "file") {
            const fileAddress = [...address, entry.slot];
            for (let i = 1; i <= entry.chunks; i++) {
              map.set(
                formatCoordinate(chunkCoordinate(library, fileAddress, i)),
                prefix + [...rel, name].join("/"),
              );
            }
          } else if (!entry.hashed) {
            walk([...address, entry.slot], [...rel, name]);
          } else {
            map.set(
              formatCoordinate(directoryCoordinate(library, [...address, entry.slot])),
              prefix + [...rel, name].join("/"),
            );
          }
        }
      };
      walk([], []);
    }
    return map;
  }

}

function emptyIndex(): DirIndex {
  return { v: 1, nextSlot: FIRST_SLOT, entries: {} };
}

/**
 * Allocate the next child slot in a directory from its persisted
 * high-water mark (raised past any slot currently in use): a slot, once
 * assigned, is never reused, even after the entry is unlinked — a stale
 * coordinate can never silently come to mean a different node.
 */
function allocateSlot(index: DirIndex): number {
  let maxInUse = FIRST_SLOT - 1;
  for (const entry of Object.values(index.entries)) {
    if (entry.slot > maxInUse) maxInUse = entry.slot;
  }
  const slot = Math.max(index.nextSlot ?? FIRST_SLOT, maxInUse + 1, FIRST_SLOT);
  index.nextSlot = slot + 1;
  return slot;
}

function assertTextPayload(bytes: Buffer, path: string): void {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PhextVfsError(
      "EINVAL",
      `${path} is not valid UTF-8; write it with format: "binary" instead`,
    );
  }
  for (const byte of bytes) {
    if (BREAK_BYTES.has(byte)) {
      throw new PhextVfsError(
        "EINVAL",
        `${path} contains a phext dimension break byte (0x${byte.toString(16)}); ` +
          `write it with format: "binary" instead`,
      );
    }
  }
}

/**
 * Encode caller-named slices as chunk texts: the slices must partition
 * the file bytes exactly, and each slice is encoded with the standard
 * text chunker (so an oversize slice sub-splits at codepoint
 * boundaries, but a slice boundary is always a scroll boundary).
 */
function encodeSlices(
  bytes: Buffer,
  slices: readonly Buffer[],
  format: PhextVfsFileFormat,
  chunkSize: number,
  path: string,
): string[] {
  if (format !== "text") {
    throw new PhextVfsError("EINVAL", `Sliced writes are text-only: ${path}`);
  }
  if (!Buffer.concat(slices.map((slice) => Buffer.from(slice))).equals(bytes)) {
    throw new PhextVfsError("EINVAL", `Slices do not partition the file bytes: ${path}`);
  }
  return slices.flatMap((slice) => encodeChunks(slice, "text", chunkSize));
}

function encodeChunks(
  bytes: Buffer,
  format: PhextVfsFileFormat,
  chunkSize: number,
): string[] {
  if (bytes.length === 0) return [];
  if (format === "binary") {
    const rawSize = Math.max(3, 3 * Math.floor(chunkSize / 4));
    const texts: string[] = [];
    for (let start = 0; start < bytes.length; start += rawSize) {
      texts.push(bytes.subarray(start, start + rawSize).toString("base64"));
    }
    return texts;
  }
  return splitUtf8Chunks(bytes, chunkSize).map((chunk) => chunk.toString("utf8"));
}

function readManifest(lattice: PhextLattice): Manifest | undefined {
  const text = lattice.readScroll(MANIFEST_COORDINATE);
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text) as Manifest;
    if (parsed.format !== PHEXT_VFS_FORMAT) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function mergeDirEntries(lists: PhextVfsDirEntry[][]): PhextVfsDirEntry[] {
  const out = new Map<string, PhextVfsDirEntry>();
  for (const list of lists) {
    for (const entry of list) {
      if (!out.has(entry.name)) out.set(entry.name, entry);
    }
  }
  return [...out.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The cross-process flush mutex: a token file in the system temp
 * directory (the stage-C gates flock fallback's shape), keyed by the
 * phext's absolute path, held only across flush's fingerprint-check +
 * rebase + save section. The holder's pid is the token content; a dead
 * holder's token is recovered by the next contender, so a crashed
 * flusher cannot wedge the file. Synchronous, because flush() is.
 */
function acquireFlushMutex(filePath: string): () => void {
  const key = createHash("sha256")
    .update(resolvePath(filePath))
    .digest("hex")
    .slice(0, 32);
  const lockPath = join(tmpdir(), `mutable-phext-flush-${key}.lock`);
  const deadline = Date.now() + 30000;
  const spin = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      try {
        writeSync(fd, `${process.pid}\n`);
      } finally {
        closeSync(fd);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          if (parseInt(readFileSync(lockPath, "utf8"), 10) === process.pid) {
            unlinkSync(lockPath);
          }
        } catch {
          /* token already gone or replaced — leave the holder's alone */
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    try {
      const pid = parseInt(readFileSync(lockPath, "utf8"), 10);
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && !pidAlive(pid)) {
        unlinkSync(lockPath);
        continue;
      }
    } catch {
      /* token vanished mid-check — retry the create */
      continue;
    }
    if (Date.now() > deadline) {
      throw new PhextVfsError(
        "ELOCKED",
        `Timed out waiting for the PhextVFS flush lock: ${filePath}`,
      );
    }
    Atomics.wait(spin, 0, 0, 5);
  }
}
