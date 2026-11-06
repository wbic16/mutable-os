#!/usr/bin/env node
/**
 * Benchmark: existing phext codec vs the lattice engine.
 *
 * Compares the per-operation cost models on two corpora — the bundled
 * CYOA phext (4.6 MB) and a synthetic ~48 MB phext generated
 * deterministically below:
 *
 *   codec:   every operation starts from parsePhext (a full O(file)
 *            dead-reckoning pass), and saving is serializePhext.
 *   lattice: fromBuffer pays one O(file) index scan at open; after that
 *            a scroll read is a hash lookup + span slice, and an edit +
 *            reconstruction never re-parses.
 *
 * The TypeScript sources are bundled with the repo's esbuild into a
 * temp dir so this script runs under plain node:
 *
 *   node scripts/bench-phext-lattice.mjs
 */
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "phext-bench-"));

const SCROLL = 0x17;
const SECTION = 0x18;
const CHAPTER = 0x19;
const BOOK = 0x1a;

/** mulberry32: small deterministic PRNG for the synthetic corpus. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS =
  "phext scroll coordinate lattice cavern mutable knowledge archive " +
  "the of and a in is you that it he was for on are as with his they i";

/** Build a deterministic ~`targetBytes` phext with realistic structure. */
function syntheticPhext(targetBytes) {
  const random = prng(0x5eed);
  const words = WORDS.split(" ");
  const parts = [];
  let size = 0;
  let scrolls = 0;
  while (size < targetBytes) {
    const wordCount = 400 + Math.floor(random() * 400); // ~2.4–4.8 KB
    const text = Array.from(
      { length: wordCount },
      () => words[Math.floor(random() * words.length)],
    ).join(" ");
    parts.push(Buffer.from(text, "utf8"));
    size += text.length;
    scrolls++;
    // Break upward periodically; component values stay small, as in
    // real phexts (CYOA coordinates run to ~20 per arm).
    if (scrolls % 2000 === 0) parts.push(Buffer.from([BOOK]));
    else if (scrolls % 400 === 0) parts.push(Buffer.from([CHAPTER]));
    else if (scrolls % 50 === 0) parts.push(Buffer.from([SECTION]));
    else parts.push(Buffer.from([SCROLL]));
    size += 1;
  }
  return Buffer.concat(parts);
}

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timeSync(fn, runs = 3) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

const fmt = (ms) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms >= 1 ? `${ms.toFixed(1)} ms` : `${(ms * 1000).toFixed(0)} µs`;

async function main() {
  await build({
    entryPoints: [
      join(repoRoot, "src/phext/lattice.ts"),
      join(repoRoot, "src/phext/codec.ts"),
      join(repoRoot, "src/phext/coordinate.ts"),
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: work,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
  });
  const { PhextLattice } = await import(join(work, "lattice.mjs"));
  const { parsePhext, serializePhext } = await import(join(work, "codec.mjs"));
  const { formatCoordinate } = await import(join(work, "coordinate.mjs"));

  const corpora = [
    {
      name: "CYOA (bundled)",
      bytes: readFileSync(
        join(repoRoot, "src/assets/hosted/phext/choose-your-own-adventure.phext"),
      ),
    },
    { name: "synthetic", bytes: syntheticPhext(48 * 1024 * 1024) },
  ];

  for (const corpus of corpora) {
    const { bytes } = corpus;
    const lattice = PhextLattice.fromBuffer(bytes);
    const populated = lattice.populatedCoordinates();
    const mid = populated[Math.floor(populated.length / 2)];
    const midKey = formatCoordinate(mid);
    const text = bytes.toString("utf8");

    const decodeMs = timeSync(() => bytes.toString("utf8"), 1);
    const parseMs = timeSync(() => parsePhext(text));
    const parsed = parsePhext(text);
    const codecReadMs = timeSync(() => {
      const all = parsePhext(text);
      return all.find((s) => formatCoordinate(s.coordinate) === midKey);
    });
    const serializeMs = timeSync(() => serializePhext(parsed));
    const indexMs = timeSync(() => PhextLattice.fromBuffer(bytes));
    const readAvgMs =
      timeSync(() => {
        for (let i = 0; i < 1000; i++) lattice.readScroll(mid);
      }, 3) / 1000;
    const editRebuildMs = timeSync(() => {
      const fresh = PhextLattice.fromBuffer(bytes);
      fresh.writeScroll(mid, "edited scroll content for the benchmark");
      fresh.toPhextBytes();
    }, 1);
    const editSaveMs = timeSync(() => {
      const fresh = PhextLattice.fromBuffer(bytes);
      fresh.writeScroll(mid, "edited scroll content for the benchmark");
      fresh.saveToFile(join(work, "saved.phext"));
    }, 1);

    console.log(
      `\n== ${corpus.name}: ${(bytes.length / 1048576).toFixed(1)} MiB, ` +
        `${populated.length} populated scrolls, mid = ${midKey}`,
    );
    console.log(`  codec    decode (Buffer→string)      ${fmt(decodeMs)}`);
    console.log(`  codec    parsePhext                  ${fmt(parseMs)}`);
    console.log(`  codec    read one scroll (parse+find) ${fmt(codecReadMs)}`);
    console.log(`  codec    serializePhext              ${fmt(serializeMs)}`);
    console.log(`  lattice  index build (once, at open) ${fmt(indexMs)}`);
    console.log(`  lattice  readScroll (after open)     ${fmt(readAvgMs)}`);
    console.log(`  lattice  edit 1 scroll + rebuild     ${fmt(editRebuildMs)}`);
    console.log(`  lattice  edit 1 scroll + save        ${fmt(editSaveMs)}`);
  }

  rmSync(work, { recursive: true, force: true });
}

await main();
