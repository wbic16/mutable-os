import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseCoordinate } from "./coordinate";
import {
  PhextVFS,
  PhextVfsError,
  PhextVfsIntegrityError,
} from "./vfs";

const dir = mkdtempSync(join(tmpdir(), "phext-vfs-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let counter = 0;
function freshPath(): string {
  return join(dir, `cavern-${counter++}.phext`);
}

/** Every byte value, eight times over — decidedly not UTF-8. */
function binaryBlob(): Buffer {
  const blob = Buffer.alloc(256 * 8);
  for (let i = 0; i < blob.length; i++) blob[i] = i % 256;
  return blob;
}

interface Fixture {
  path: string;
  data: Buffer | string;
  options?: { format?: "text" | "binary" };
}

function cavernFixture(): Fixture[] {
  const longText = Array.from({ length: 200 }, (_, i) =>
    `paragraph ${i}: the quick brown fox — ünïcodé, 中文, 🦊 — jumps.\n`,
  ).join("");
  return [
    { path: "/welcome.ink", data: '{"format":"mutable-document","version":1}' },
    { path: "/docs/note.ink", data: longText },
    { path: "/docs/deep/nested.md", data: "# Notes\n\nSome *markdown*.\n" },
    {
      path: "/.mutable-pair-abc123/receipt.json",
      data: '{"version":1,"resourceId":"r1","generation":3}',
    },
    {
      path: "/.mutable-pair-abc123/3/intent.json",
      data: '{"generation":3,"staged":true}',
    },
    { path: "/.memory/document-deadbeef/record-1.json", data: '{"seq":1}' },
    { path: "/.memory/document-deadbeef/record-2.json", data: '{"seq":2}' },
    { path: "/.mutable/ledger.jsonl", data: '{"claim":1}\n{"claim":2}\n' },
    { path: "/.mutable/jobs/job-1/state.json", data: '{"state":"done"}' },
    {
      path: "/.mutable/publications/sites/site-a/index.json",
      data: '{"site":"a"}',
    },
    {
      path: "/.mutable/assets/blob.bin",
      data: binaryBlob(),
      options: { format: "binary" },
    },
    { path: "/empty.txt", data: "" },
    { path: "/a/b/c/d/e/f/g/deep.txt", data: "beyond the structural cap" },
  ];
}

function asBuffer(fixture: Fixture): Buffer {
  return typeof fixture.data === "string"
    ? Buffer.from(fixture.data, "utf8")
    : fixture.data;
}

describe("PhextVFS round-trip (a Cavern-shaped tree)", () => {
  it("flush + reopen reproduces every file byte-for-byte, listings equal", () => {
    const path = freshPath();
    const fixtures = cavernFixture();
    const vfs = PhextVFS.create(path, { chunkSize: 64 });
    for (const fixture of fixtures) {
      vfs.writeFile(fixture.path, fixture.data, fixture.options);
    }
    vfs.flush();
    vfs.close();

    // A fresh open has no prior state: everything below is resolved by
    // walking index scrolls from the stratum roots.
    const reopened = PhextVFS.open(path, { chunkSize: 64 });
    for (const fixture of fixtures) {
      expect(
        reopened.readFile(fixture.path).equals(asBuffer(fixture)),
        fixture.path,
      ).toBe(true);
      const stat = reopened.stat(fixture.path);
      expect(stat?.type).toBe("file");
      expect(stat?.size).toBe(asBuffer(fixture).length);
    }
    expect(reopened.listDir("/").map((e) => e.name)).toEqual(
      expect.arrayContaining([
        "welcome.ink",
        "docs",
        "empty.txt",
        ".mutable",
        ".memory",
        ".mutable-pair-abc123",
      ]),
    );
    expect(reopened.listDir("/docs").map((e) => e.name)).toEqual([
      "deep",
      "note.ink",
    ]);
    expect(reopened.listDir("/.mutable").map((e) => e.name)).toEqual([
      "assets",
      "jobs",
      "ledger.jsonl",
      "publications",
    ]);
    expect(reopened.listDir("/a/b/c/d/e").map((e) => e.name)).toEqual(["f"]);
    expect(reopened.listDir("/a/b/c/d/e/f/g").map((e) => e.name)).toEqual([
      "deep.txt",
    ]);
    expect(reopened.stat("/a/b/c/d/e/f")?.type).toBe("directory");
    expect(reopened.stat("/nope.txt")).toBeUndefined();
    reopened.close();
  });

  it("browsing is reading index scrolls: the /docs index is one JSON scroll", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path, { chunkSize: 64 });
    vfs.writeFile("/docs/note.ink", "hello");
    vfs.close();

    const reopened = PhextVFS.open(path);
    const stat = reopened.stat("/docs");
    expect(stat?.type).toBe("directory");
    const indexText = reopened.lattice.readScroll(
      parseCoordinate(stat!.coordinate),
    );
    const index = JSON.parse(indexText!) as {
      entries: Record<string, { kind: string }>;
    };
    expect(index.entries["note.ink"].kind).toBe("file");
    reopened.close();
  });

  it("uses 64 KB chunks by default", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path);
    vfs.writeFile("/big.txt", Buffer.alloc(200 * 1024, "a"));
    expect(vfs.stat("/big.txt")?.chunks).toBe(4);
    vfs.close();
  });
});

describe("PhextVFS mutation semantics", () => {
  it("append crosses chunk boundaries and creates missing files", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path, { chunkSize: 16 });
    vfs.appendFile("/log.txt", "hello");
    vfs.appendFile("/log.txt", " world, hello phext, hello append");
    expect(vfs.readTextFile("/log.txt")).toBe(
      "hello world, hello phext, hello append",
    );
    vfs.close();
    const reopened = PhextVFS.open(path, { chunkSize: 16 });
    expect(reopened.readTextFile("/log.txt")).toBe(
      "hello world, hello phext, hello append",
    );
    reopened.close();
  });

  it("mkdir / unlink: empty dirs only, freed slots are not reused", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path, { chunkSize: 64 });
    vfs.mkdir("/x/y");
    vfs.writeFile("/x/y/file.txt", "data");
    expect(() => vfs.unlink("/x")).toThrow(/not empty/);
    const before = vfs.stat("/x/y/file.txt")?.coordinate;
    vfs.unlink("/x/y/file.txt");
    expect(vfs.stat("/x/y/file.txt")).toBeUndefined();
    expect(() => vfs.readFile("/x/y/file.txt")).toThrow(/ENOENT|No such/);
    vfs.unlink("/x/y");
    expect(vfs.stat("/x/y")).toBeUndefined();
    // Rewriting the same name lands on a fresh slot (never reused).
    vfs.writeFile("/x/y/file.txt", "data");
    expect(vfs.stat("/x/y/file.txt")?.coordinate).not.toBe(before);
    vfs.close();
  });

  it("rejects invalid writes and paths", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path, { chunkSize: 64 });
    expect(() => vfs.writeFile("/bad.txt", "has a \u0017 break")).toThrow(
      PhextVfsError,
    );
    expect(() =>
      vfs.writeFile("/bad.bin", Buffer.from([0xff, 0xfe, 0x00])),
    ).toThrow(/format: "binary"/);
    vfs.writeFile("/bad.bin", Buffer.from([0xff, 0xfe, 0x00]), {
      format: "binary",
    });
    expect(vfs.readFile("/bad.bin")).toEqual(Buffer.from([0xff, 0xfe, 0x00]));
    vfs.mkdir("/somedir");
    expect(() => vfs.writeFile("/somedir", "x")).toThrow(/EISDIR|directory/);
    expect(() => vfs.readFile("/somedir")).toThrow(/EISDIR|directory/);
    expect(() => vfs.writeFile("/a/../b.txt", "x")).toThrow(/\.\./);
    expect(() => PhextVFS.create(path)).toThrow(/already exists/);
    vfs.close();
    expect(() => vfs.readFile("/bad.bin")).toThrow(/closed/);
  });

  it("keeps the previous generation at .bak on flush", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path, { chunkSize: 64 });
    vfs.writeFile("/note.txt", "generation one");
    vfs.flush();
    const generation1 = readFileSync(path);
    vfs.writeFile("/note.txt", "generation two, changed");
    vfs.flush();
    expect(existsSync(`${path}.bak`)).toBe(true);
    expect(readFileSync(`${path}.bak`).equals(generation1)).toBe(true);
    expect(readFileSync(path).equals(generation1)).toBe(false);
    vfs.close();
  });
});

describe("PhextVFS integrity (L9 checksums)", () => {
  it("locates a flipped byte to its scroll and path; verify:false opens anyway", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path, { chunkSize: 64 });
    vfs.writeFile("/needle.txt", "INTEGRITY-NEEDLE-0123456789abcdef");
    vfs.writeFile("/other.txt", "untouched");
    vfs.close();

    const raw = readFileSync(path);
    const at = raw.indexOf("INTEGRITY-NEEDLE");
    expect(at).toBeGreaterThan(0);
    raw[at + 3] = raw[at + 3] ^ 0x20; // flip one letter's case: content only
    writeFileSync(path, raw);

    let caught: unknown;
    try {
      PhextVFS.open(path);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PhextVfsIntegrityError);
    const integrity = caught as PhextVfsIntegrityError;
    expect(integrity.mismatches).toHaveLength(1);
    expect(integrity.mismatches[0].path).toBe("/needle.txt");
    expect(integrity.mismatches[0].reason).toMatch(/checksum mismatch/);

    const lax = PhextVFS.open(path, { verify: false });
    expect(lax.readTextFile("/other.txt")).toBe("untouched");
    lax.close();
  });

  it("a non-VFS phext is refused", () => {
    const path = freshPath();
    writeFileSync(path, "just a scroll\u0017another scroll");
    expect(() => PhextVFS.open(path)).toThrow(/Not a PhextVFS file/);
  });

  it("two instances over one file keep each other's strata across flushes", () => {
    const path = freshPath();
    const a = PhextVFS.create(path);
    a.writeFile("/doc.txt", "from a");
    a.flush();
    // A second instance opens the same file (the knowledge worker's
    // relationship to the lifecycle's instance in Phase 4).
    const b = PhextVFS.open(path);
    // Disjoint writes, interleaved flushes: neither may lose the
    // other's generation.
    b.writeFile("/.mutable/entities/e1.json", '{"guid":"e1"}');
    b.flush();
    a.writeFile("/other.txt", "a again");
    a.flush();
    b.writeFile("/.mutable/entities/e2.json", '{"guid":"e2"}');
    b.flush();
    a.close();
    b.close();

    const cold = PhextVFS.open(path);
    expect(cold.readTextFile("/doc.txt")).toBe("from a");
    expect(cold.readTextFile("/other.txt")).toBe("a again");
    expect(cold.readTextFile("/.mutable/entities/e1.json")).toBe('{"guid":"e1"}');
    expect(cold.readTextFile("/.mutable/entities/e2.json")).toBe('{"guid":"e2"}');
    cold.close();
  });

  it("an instance refuses to adopt a foreign non-VFS generation at flush", () => {
    const path = freshPath();
    const vfs = PhextVFS.create(path);
    vfs.writeFile("/doc.txt", "mine");
    vfs.flush();
    // Another writer replaces the file with something that is not a
    // PhextVFS generation at all.
    writeFileSync(path, "just a scroll\u0017another scroll");
    vfs.writeFile("/more.txt", "more");
    expect(() => vfs.flush()).toThrow(/not a PhextVFS file/);
    // close() attempts a final flush and refuses the same generation.
    expect(() => vfs.close()).toThrow(/not a PhextVFS file/);
  });
});
