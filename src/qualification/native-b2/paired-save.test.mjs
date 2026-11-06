// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { admitNative, captureNative, nativeText, decodeNative, nativeBytes } from "../native-b1/resource";
import { exportMarkdown, admitMarkdown } from "./markdown";
import { enrollPair, ResourcePair } from "./coordinator";
import { ManagedPair, hash } from "./managed-pair.mjs";
import { promises as vfs } from "../../../server/phext-fs.mjs";
import { testCavern } from "../../knowledge-sqlite/phext-test-cavern.mjs";
const cleanup = [];
afterEach(async () => { for (const f of cleanup.splice(0).reverse()) await f(); });
async function host(input = "artifacts/flint-b1.2/rich.mutable.json") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mutable-b2-")); cleanup.push(() => fs.rm(root, { recursive: true, force: true })); const cavern = testCavern(root); cleanup.push(() => cavern.close()); // phext: the pair lives in a Cavern
  const editor = new ReactiveEditor({ id: "workspace", type: "workspace-block", children: [{ id: "bank", type: "workspace-object-bank-block", children: [] }] }); cleanup.push(() => editor.dispose());
  const bank = Object.values(editor.repository.state.contents).find(c => c.payload.id === "bank").key;
  const data = await fs.readFile(input), resourceId = decodeNative(data).resourceId;
  const admitted = admitNative(editor.repository, data, bank);
  const options = { root, resourceId, nativeName: "document.mutable.json", markdownName: "document.md" };
  const store = new ManagedPair(options), pair = enrollPair(editor.repository, resourceId, store, () => [], true);
  const capture = () => captureNative(editor.repository.snapshot(), resourceId);
  const edit = (text = "New text ") => {
    const content = Object.values(editor.repository.state.contents).find(c => c.viewType === "standoff-editor-block");
    const placement = Object.values(editor.repository.state.placements).find(p => p.contentKey === content.key);
    editor.commands.replaceInlineRange(placement.key, 0, 0, text);
  };
  return { root, editor, bank, resourceId, admitted, options, store, pair, capture, edit, cavern, native: () => vfs.readFile(store.file("native")), markdown: () => vfs.readFile(store.file("markdown")) };
}
const pause = () => { let release; const wait = new Promise(resolve => { release = resolve; }); return { wait, release }; };
const generation = f => { const r = f.capture(), projection = exportMarkdown(r); return { resourceId: f.resourceId, generation: crypto.randomUUID(), native: nativeText(r), markdown: projection.text, profile: projection.profile, targets: [], diagnostics: projection.diagnostics }; };

it("writes a rich same-generation pair without simplifying native semantics; zero views suffice", async () => {
  const f = await host(), before = nativeText(f.capture()), expected = exportMarkdown(f.capture());
  expect(f.editor.projections.size).toBe(0);
  expect(await f.pair.save()).toMatchObject({ phase: "saved", dirty: false });
  expect((await f.native()).toString()).toBe(before); expect((await f.markdown()).toString()).toBe(expected.text);
  expect(nativeText(decodeNative(await f.native()))).toBe(before); expect(expected.diagnostics.length).toBeGreaterThan(0);
  expect(enrollPair(f.editor.repository, f.resourceId, f.store)).toBe(f.pair);
  expect(() => enrollPair(f.editor.repository, f.resourceId, new ManagedPair(f.options))).toThrow("already enrolled");
  if (process.env.B2_ARTIFACTS) {
    await fs.mkdir(process.env.B2_ARTIFACTS, { recursive: true });
    await fs.writeFile(path.join(process.env.B2_ARTIFACTS, "rich.mutable.json"), before);
    await fs.writeFile(path.join(process.env.B2_ARTIFACTS, "rich.md"), expected.text);
    await fs.writeFile(path.join(process.env.B2_ARTIFACTS, "degradation.json"), JSON.stringify(expected.diagnostics, null, 2));
  }
});
it("captures once for two occurrences, survives their closure, and keeps newer edits dirty", async () => {
  const f = await host(), a = f.editor.createView("a", f.admitted.placementKey), b = f.editor.createView("b", f.admitted.placementKey), before = nativeText(f.capture());
  const entered = pause(), resume = pause(); f.store.fault = async stage => { if (stage === "before-native") { entered.release(); await resume.wait; } };
  const saved = f.pair.save(); expect(f.pair.save()).toBe(saved); await entered.wait;
  f.edit("While saving "); f.editor.disposeView(a); f.editor.disposeView(b); resume.release();
  expect(await saved).toMatchObject({ phase: "saved", dirty: true }); expect((await f.native()).toString()).toBe(before);
  expect((await f.markdown()).toString()).not.toContain("While saving"); expect(nativeText(f.capture())).toContain("While saving");
  expect(await f.pair.save()).toMatchObject({ phase: "saved", dirty: false }); expect((await f.markdown()).toString()).toContain("While saving");
});
it("freezes the export locator mapping along with canonical content", async () => {
  const f = await host(); let targets = [{ documentId: "resource-b", blockId: "b", title: "B", path: "B-before" }];
  const g = generation(f); const immutablePair = new ResourcePair(f.editor.repository, f.resourceId, { async save(captured) { targets[0].path = "B-after"; expect(captured.targets[0].path).toBe("B-before"); expect(Object.isFrozen(captured)).toBe(true); return { phase: "saved", generation: captured.generation }; }, recover: async () => ({ phase: "failed" }) }, () => targets, true);
  expect((await immutablePair.save()).phase).toBe("saved"); expect(g.native).toBe(nativeText(f.capture()));
});
it("native encoding failure publishes nothing", async () => {
  const f = await host(), root = f.editor.repository.state.placements[f.admitted.placementKey].contentKey;
  f.editor.repository.commit("Bad runtime value", [{ kind: "put-content", record: { ...f.editor.repository.readState().contents[root], payload: { ...f.editor.repository.readState().contents[root].payload, bad: new Map() } } }]);
  expect(await f.pair.save()).toMatchObject({ phase: "failed", dirty: true }); expect(await vfs.readdir(f.root)).toEqual([]);
});
it.each(["before-native", "before-markdown", "before-receipt", "after-receipt"])("recovers exact frozen generation after %s interruption", async stage => {
  const f = await host(), before = nativeText(f.capture()); f.store.fault = async at => { if (at === stage) throw Error("interrupted"); };
  const failed = await f.pair.save();
  expect(failed.phase).toBe(stage === "before-native" ? "failed" : stage === "before-markdown" ? "canonical-saved-markdown-pending" : "confirmation-pending");
  f.edit("Later "); expect((await f.pair.save()).error).toContain("pending generation");
  const restarted = new ManagedPair(f.options), result = await restarted.recover();
  expect(result).toMatchObject({ phase: "saved", generation: failed.generation, native: before });
  expect((await f.native()).toString()).toBe(before); expect((await f.markdown()).toString()).toBe(exportMarkdown(decodeNative(new TextEncoder().encode(before))).text);
  f.store.fault = async () => {}; expect(await f.pair.recover()).toMatchObject({ phase: "saved", dirty: true });
});
it("preflight blocks unknown/external Markdown; explicit Keep Mutable preserves the accepted bytes", async () => {
  const f = await host(); await vfs.writeFile(f.store.file("markdown"), "outside edit\n");
  expect(await f.pair.save()).toMatchObject({ phase: "failed", conflict: true }); expect(await vfs.stat(f.store.file("native")).catch(() => null)).toBeNull();
  const comparison = await f.store.compare(exportMarkdown(f.capture()).text);
  expect(comparison.external).toBe("outside edit\n");
  const imported = admitMarkdown(f.editor.repository, f.bank, comparison.external); expect(imported.resourceId).not.toBe(f.resourceId);
  expect((await f.pair.save(comparison.externalHash)).phase).toBe("saved");
  const receipt = await f.store.receipt(); expect((await vfs.readFile(path.join(f.store.home, receipt.generation, "markdown.previous"))).toString()).toBe("outside edit\n");
});
it("an accepted external hash does not authorize a later edit", async () => {
  const f = await host(); await vfs.writeFile(f.store.file("markdown"), "first"); const comparison = await f.store.compare("");
  await vfs.writeFile(f.store.file("markdown"), "later");
  expect(await f.pair.save(comparison.externalHash)).toMatchObject({ phase: "failed", conflict: true }); expect((await f.markdown()).toString()).toBe("later");
});
it.each(["native", "markdown"])("preserves raced %s bytes displaced between preflight and publication", async kind => {
  const f = await host(); await f.pair.save(); f.edit();
  f.store.fault = async stage => { if (stage === `before-${kind}`) await vfs.writeFile(f.store.file(kind), `external-${kind}`); };
  const result = await f.pair.save(); expect(result.conflict).toBe(true); expect(result.phase).not.toBe("saved");
  expect((await vfs.readFile(path.join(f.store.home, result.generation, `${kind}.previous`))).toString()).toBe(`external-${kind}`);
  expect((await new ManagedPair(f.options).recover()).conflict).toBe(true);
});
it("a path recreated during publication wins; it is never overwritten", async () => {
  const f = await host(); await f.pair.save(); f.edit();
  f.store.fault = async stage => { if (stage === "publish-markdown") await vfs.writeFile(f.store.file("markdown"), "new outside inode", { flag: "wx" }); };
  const result = await f.pair.save(); expect(result).toMatchObject({ phase: "canonical-saved-markdown-pending", conflict: true });
  expect((await f.markdown()).toString()).toBe("new outside inode");
});
it("detects modification of newly published output and never confirms it", async () => {
  const f = await host(); f.store.fault = async stage => { if (stage === "after-markdown") await vfs.writeFile(f.store.file("markdown"), "changed after publish"); };
  expect(await f.pair.save()).toMatchObject({ phase: "canonical-saved-markdown-pending", conflict: true });
  expect(await readReceipt(f)).toBeUndefined();
});
async function readReceipt(f) { return f.store.receipt(); }
it("serializes cooperating writers and rejects stale completion attribution", async () => {
  const f = await host(), entered = pause(), resume = pause(); f.store.fault = async stage => { if (stage === "before-native") { entered.release(); await resume.wait; } };
  const saving = f.pair.save(); await entered.wait;
  expect(await new ManagedPair(f.options).save(generation(f))).toMatchObject({ phase: "failed", conflict: true }); resume.release(); expect((await saving).phase).toBe("saved");
  const stale = new ResourcePair(f.editor.repository, f.resourceId, { save: async () => ({ phase: "saved", generation: "wrong" }), recover: async () => ({ phase: "failed" }) }, () => []);
  expect(await stale.save()).toMatchObject({ phase: "failed", error: "Stale save completion", dirty: true });
  stale.adapter.recover = async () => ({ phase: "saved", generation: "another-wrong-generation", native: nativeText(f.capture()) });
  expect(await stale.recover()).toMatchObject({ phase: "failed", error: "Stale save completion", dirty: true });
  expect(stale.dirty).toBe(true);
});
it("owned dependencies must be located; A's pair never recursively generates B Markdown", async () => {
  const f = await host("artifacts/flint-b1.2/a.mutable.json"); expect((await f.pair.save()).error).toContain("Required owned resource unavailable");
  const bPath = path.join(f.root, "b.mutable.json"); await vfs.writeFile(bPath, await fs.readFile("artifacts/flint-b1.2/b.mutable.json")); f.store.locations.set("resource-b", bPath);
  expect((await f.pair.save()).phase).toBe("saved"); expect(await vfs.stat(path.join(f.root, "b.md")).catch(() => null)).toBeNull();
  f.edit(); f.store.fault = async stage => { if (stage === "after-native") await vfs.unlink(bPath); };
  expect((await f.pair.save()).phase).not.toBe("saved");
});
it("changed recovery staging or corrupt native data never triggers Markdown reconstruction", async () => {
  const f = await host(); f.store.fault = async stage => { if (stage === "before-markdown") throw Error("pause"); };
  const pending = await f.pair.save(); await vfs.writeFile(path.join(f.store.home, pending.generation, "native"), "corrupt");
  expect(await new ManagedPair(f.options).recover()).toMatchObject({ conflict: true, error: "Captured generation bytes changed" });
  expect(nativeText(decodeNative(await f.native()))).toBe(nativeText(f.capture()));
});

it.each(["after-native", "after-markdown", "after-receipt"])("recovers after actual writer-process death at %s with the OS lock released", async stage => {
  const { spawn, execFile } = await import("node:child_process"), { promisify } = await import("node:util");
  const f = await host(), buildDir = await fs.mkdtemp(path.join(process.cwd(), ".b2-crash-")); cleanup.push(() => fs.rm(buildDir, { recursive: true, force: true }));
  const script = path.join(buildDir, "worker.mjs"), request = path.join(buildDir, "request.json");
  await fs.writeFile(request, JSON.stringify({ options: f.options, generation: generation(f), stage }));
  const entry = path.join(buildDir, "entry.mjs");
  await fs.writeFile(entry, `import {ManagedPair} from ${JSON.stringify(path.join(process.cwd(), 'src/qualification/native-b2/managed-pair.mjs'))}; import {readFileSync} from 'node:fs'; import {PhextVFS} from ${JSON.stringify(path.join(process.cwd(), 'dist/src/phext/vfs.js'))}; import {registerPhextFs} from ${JSON.stringify(path.join(process.cwd(), 'dist/server/phext-fs.mjs'))}; const r=JSON.parse(readFileSync(process.argv[2],'utf8')); const vfs=await PhextVFS.open(r.options.root+'/cavern.phext'); registerPhextFs({root:r.options.root,vfs}); const store=new ManagedPair({...r.options,fault:async stage=>{if(stage===r.stage)process.kill(process.pid,'SIGKILL')}}); await store.save(r.generation);`);
  await promisify(execFile)(process.execPath, ["--input-type=module", "-e", "import {build} from 'esbuild'; await build({entryPoints:[process.argv[1]],bundle:true,platform:'node',format:'esm',external:['fs-ext'],outfile:process.argv[2],logLevel:'silent'})", entry, script], { cwd: process.cwd() });
  const exited = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, request], { stdio: ["ignore", "ignore", "pipe"] }); let errors = "";
    child.stderr.on("data", data => errors += data); child.on("error", reject); child.on("exit", (code, signal) => resolve({ code, signal, errors }));
  });
  expect(exited).toMatchObject({ code: null, signal: "SIGKILL", errors: "" }); await f.cavern.flush(); // phext: rebase this instance onto the dead writer's flushed generation before recovering
  const result = await new ManagedPair(f.options).recover(); expect(result.phase).toBe("saved");
  expect((await f.native()).toString()).toBe(nativeText(f.capture())); expect((await f.markdown()).toString()).toBe(exportMarkdown(f.capture()).text);
});
it("receipt interruption followed by an outside edit remains conflicted; native still admits independently", async () => {
  const f = await host(); f.store.fault = async stage => { if (stage === "after-receipt") await vfs.writeFile(f.store.file("markdown"), "outside after receipt"); };
  expect(await f.pair.save()).toMatchObject({ phase: "canonical-saved-markdown-pending", conflict: true });
  expect((await new ManagedPair(f.options).recover()).phase).not.toBe("saved");
  expect(decodeNative(await f.native()).resourceId).toBe(f.resourceId);
  const original = nativeText(f.capture()); admitMarkdown(f.editor.repository, f.bank, (await f.markdown()).toString());
  expect(nativeText(f.capture())).toBe(original); expect((await f.markdown()).toString()).toBe("outside after receipt");
});
