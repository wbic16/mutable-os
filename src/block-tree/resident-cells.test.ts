import {expect, it, vi} from "vitest";
import {decodeBlockTree} from "./codecs";
import {TreeCommands} from "./commands";
import {replaceCompact} from "./inline-sequence";
import {CanonicalRepository} from "./repository";
import {ResidentCells} from "./resident-cells";
import type {ContentRecord, JsonObject} from "./types";
import {admitNative, captureNative, nativeText} from "../persistence/native-resource";

function textRecord(text: string, properties: JsonObject[]): ContentRecord {
  return {key: "p", viewType: "standoff-editor-block", payload: {id: "p", standoffProperties: properties},
    children: [], inlineContent: [], ownedRelations: {}, opaqueRelations: {}, wireChildren: "omitted", wireRelation: "omitted",
    inlineRevision: 0, revision: 0, inlineKind: "standoff", compactInline: {version: 1, spans: text ? [{kind: "text", text}] : []}};
}

it("agrees with compact replacement for inclusive ranges, both point forms, affinity and retained historical versions", () => {
  const properties: JsonObject[] = [];
  for (let first = 0; first <= 5; first++) {
    for (let last = first; last < 5; last++) properties.push({start: first, end: last, type: "style/bold", metadata: {a: 1}});
    for (const affinity of [undefined, "after", "before"]) for (const delta of [-1, 0]) {
      properties.push({start: first, end: first + delta, isZeroWidth: true, ...(affinity ? {affinity} : {})});
    }
  }
  for (let start = 0; start <= 5; start++) for (let end = start; end <= 5; end++) for (const text of ["", "🌿", "naïve"]) {
    let record = textRecord("A😀éZ", properties);
    const cells = ResidentCells.open(record)!;
    const saved = cells.current;
    for (const [a,b,value] of [[start,end,text], [0,0,"🙂!"], [0,1,""]] as const) {
      record = replaceCompact(record, a, b, value ? [{kind: "text", text: value}] : []);
      const plan = cells.plan(a,b,value)!;
      expect(plan.after.record().payload).toEqual(record.payload);
      plan.apply();
      expect(cells.annotations()).toEqual(record.payload.standoffProperties);
      expect(cells.current.record().payload).toEqual(record.payload);
    }
    expect(saved.record().payload.standoffProperties).toEqual(properties);
  }
});

it("writes each displaced Cell once per bulk edit and skips unrelated annotations", () => {
  const cells = ResidentCells.open(textRecord("abcdef", Array.from({length: 6}, (_, i) => ({start: i, end: i}))))!;
  const ranges = cells.current.version.ranges;
  const writes = ranges.map(() => 0);
  ranges.forEach((range, i) => {
    let index = range.first.index;
    Object.defineProperty(range.first, "index", {get: () => index, set(value) { writes[i]++; index = value; }});
  });
  const field = vi.spyOn(ranges, "flatMap");
  cells.plan(3,3,"🌿".repeat(20000))!.apply();
  expect(writes).toEqual([0,0,0,1,1,1]);
  cells.plan(3,20003,"")!.apply();
  expect(writes).toEqual([0,0,0,2,2,2]);
  cells.plan(3,3,"")!.apply();
  expect(writes).toEqual([0,0,0,2,2,2]);
  expect(field).not.toHaveBeenCalled();
});

it("shares the edited content across leases and preserves history, vetoes and cold native capture", () => {
  const document = decodeBlockTree({id:"doc",type:"document-block",children:[{id:"p",type:"standoff-editor-block",
    text:"A😀éZ", standoffProperties:[{type:"style/bold",start:1,end:4}]}]}).state;
  const workspace = decodeBlockTree({id:"ws",type:"workspace-block",children:[{id:"bank",type:"workspace-object-bank-block"}]}).state;
  const repo = new CanonicalRepository(workspace,{compactCanonicalText:true});
  const bank = Object.values(workspace.contents).find(c => c.payload.id === "bank")!.key;
  const save = () => nativeText(captureNative(repo.readState(),"doc"));
  const original = nativeText(captureNative(document,"doc"));
  admitNative(repo,new TextEncoder().encode(original),bank);
  const key = Object.values(repo.readState().contents).find(c => c.payload.id === "p")!.key;
  const pk = [...repo.ownedPlacementKeys(key)][0];
  const command = new TreeCommands(repo,k => k);
  const first = repo.acquireResidentCells(key), second = repo.acquireResidentCells(key);
  const snapshot = vi.spyOn(repo,"snapshot").mockImplementation(() => {throw Error("unbounded snapshot");});
  const open = vi.spyOn(ResidentCells, "open");
  const revision = repo.state.revision;
  const veto = repo.beforeCommit(() => {throw Error("veto");});
  expect(() => command.replaceInlineRange(pk,0,1,"x")).toThrow("veto");
  expect(repo.state.revision).toBe(revision);
  expect(save()).toBe(original);
  veto();
  let prior: ContentRecord | undefined;
  const stop = repo.subscribeChanges(c => {prior ??= c.previousContents.get(key);});
  command.replaceInlineRange(pk,0,0,"x");
  const bounds = repo.residentAnnotations(key)![0];
  expect(bounds.start).toBe(2);
  first();
  const firstSave = save();
  const payload = repo.readState().contents[key].payload;
  Object.defineProperty(payload,"standoffProperties",{configurable:true,get(){throw Error("eager range export");}});
  command.replaceInlineRange(pk,0,0,"🌲".repeat(256));
  expect(repo.residentAnnotations(key)![0]).toBe(bounds);
  expect(bounds.start).toBe(258);
  expect(open).toHaveBeenCalledTimes(1);
  expect(prior!.payload.standoffProperties).toEqual([{type:"style/bold",start:1,end:4}]);
  second();
  expect(repo.residentAnnotations(key)).toBeUndefined();
  const final = save();
  repo.undo(); expect(save()).toBe(firstSave);
  repo.undo(); expect(save()).toBe(original);
  repo.redo(); repo.redo(); expect(save()).toBe(final);
  expect(snapshot).not.toHaveBeenCalled();
  stop(); open.mockRestore(); snapshot.mockRestore();
});

it("rebinds newly authored annotations to the surviving Cells and keeps old captures independent", () => {
  const original = textRecord("ab😀d", [{id:"one",start:2,end:3}]);
  const first = ResidentCells.open(original)!;
  first.plan(0,0,"!🌱")!.apply();
  const prior = first.current, endpoint = prior.version.ranges[0].first;
  const authored = prior.record();
  authored.payload.standoffProperties = [{id:"two",start:4,end:4}];
  const rebound = ResidentCells.open(authored, first)!;
  expect(rebound.current.version.ranges[0].first).toBe(endpoint);
  rebound.plan(0,0,"two")!.apply();
  expect(rebound.annotations()[0].start).toBe(7);
  expect(prior.record().payload.standoffProperties).toEqual([{id:"one",start:4,end:5}]);
});

it("reconstructs retained range versions after edits at many distant positions", () => {
  let record = textRecord("ab🌳漢".repeat(32), Array.from({length: 50}, (_, i) => ({
    id: String(i), start: i, end: 127 - i,
  })));
  const cells = ResidentCells.open(record)!;
  const saved: Array<{version: typeof cells.current; expected: unknown}> = [];
  let seed = 17;
  const next = (n: number) => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
  for (let edit = 0; edit < 100; edit++) {
    const length = Array.from(cells.current.text).length, start = next(length + 1);
    const end = Math.min(length, start + next(4)), insert = ["", "A", "🟠🟢", "éxy"][next(4)];
    if (edit % 7 === 0) saved.push({version: cells.current, expected: record.payload.standoffProperties});
    record = replaceCompact(record, start, end, insert ? [{kind:"text",text:insert}] : []);
    cells.plan(start,end,insert)!.apply();
    expect(cells.current.record().compactInline).toEqual(record.compactInline);
    expect(cells.annotations()).toEqual(record.payload.standoffProperties);
  }
  for (const {version, expected} of saved) expect(version.record().payload.standoffProperties).toEqual(expected);
});
