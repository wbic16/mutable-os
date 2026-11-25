import assert from "node:assert/strict";
import {it,expect,vi} from "vitest";
import {CanonicalRepository} from "./repository";
import {TreeCommands} from "./commands";
import {AnnotationIdentities} from "../runtime/annotation-identities";
import {observeCellWork} from "./cell-diagnostics";
import {ResidentCells} from "./resident-cells";
import type {ContentRecord, JsonObject, RepositoryState} from "./types";

const initial = "A🌿é אבג ".repeat(12);
function state(): RepositoryState {
  const p:ContentRecord={key:"p",viewType:"standoff-editor-block",payload:{id:"p",standoffProperties:[
    {id:"same",start:4,end:9,type:"style/bold"},{id:"same",start:4,end:9,type:"style/italics"},
    {start:0,end:-1,isZeroWidth:true,affinity:"before",unknown:{x:[7]}}]},
    children:[],ownedRelations:{},opaqueRelations:{},inlineContent:[],wireChildren:"omitted",wireRelation:"omitted",
    compactInline:{version:1,spans:[{kind:"text",text:initial}]},inlineKind:"standoff",revision:0,inlineRevision:0};
  return {contents:{p},placements:{pk:{key:"pk",contentKey:"p",kind:"owned"}},rootPlacementKey:"pk",revision:0};
}
const make=(enabled:boolean)=>{
  const repo=new CanonicalRepository(state(),{compactCanonicalText:true,residentCellBoundaries:enabled});
  const commands=new TreeCommands(repo,k=>k),identities=new AnnotationIdentities(repo),ids=identities.acquire("p");
  return {repo,commands,ids,read:()=>repo.readState().contents.p};
};

it("replays 10,000 seeded commands against numeric commits with exact historical topology",()=>{
  const hot=make(true),cold=make(false),both=[hot,cold],leases=[hot.repo.acquireResidentCells("p")];
  let seed=0x5a11ce;
  const pick=(n:number)=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n;};
  const retained:Array<{old:ContentRecord; oracle:ContentRecord}>=[];
  const counts=Array(16).fill(0);
  let iteration=0;
  const pending:ContentRecord[]=[];
  hot.repo.subscribeChanges(change=>{if(iteration%53===0)pending.push(change.previousContents.get("p")!);});
  cold.repo.subscribeChanges(change=>{if(iteration%53===0)retained.push({old:pending.shift()!,oracle:structuredClone(change.previousContents.get("p")!)});});
  const tokens=["Q","🌿","é","漢","abcd","👩‍💻"," "];
  for(;iteration<10000;iteration++){
    const previous=cold.read(), txt=previous.compactInline!.spans[0], n=txt?.kind==="text"?Array.from(txt.text).length:0;
    const at=pick(n+1), end=at+pick(Math.min(18,n-at)+1), token=tokens[pick(tokens.length)];
    const operation=n>220?5:pick(16);
    counts[operation]++;
    const replace=(a:number,b:number,s:string)=>both.forEach(t=>t.commands.replaceInlineRange("pk",a,b,s));
    if(operation<=1)replace(at,at,token);
    else if(operation===2)replace(Math.max(0,at-1),at,"");
    else if(operation===3)replace(at,Math.min(n,at+1),"");
    else if(operation===4)replace(at,end,token);
    else if(operation===5)replace(n>220?0:at,n>220?Math.floor(n/2):end,"");
    else if(operation===6)replace(at,end,token.repeat(15));
    else if(operation<=10){
      const props=structuredClone(previous.payload.standoffProperties as JsonObject[]);
      const origins:(number|null)[]=props.map((_,i)=>i);
      if(operation<=8 || !props.length){
        const point=operation===8||!n;
        const start=point?at:Math.min(at,n-1);
        props.push({...(iteration%3?{id:"duplicate"}:{}),type:"qualification",start,
          end:point?start-pick(2):Math.max(start,end-1),...(point?{isZeroWidth:true,affinity:pick(2)?"before":"after"}:{}),
          extension:{nested:[iteration,"🌱"]}});
        origins.push(null);
      }else {const i=pick(props.length);if(operation===9){props.splice(i,1);origins.splice(i,1);}else props[i].extension={edited:iteration};}
      for(const t of both)t.commands.setPayloadField("pk","standoffProperties",props,undefined,origins);
    }else if(operation===11)both.forEach(t=>t.repo.undo());
    else if(operation===12)both.forEach(t=>t.repo.redo());
    else if(operation===13){
      if(leases.length && (leases.length===2||pick(2)))leases.pop()!();else leases.push(hot.repo.acquireResidentCells("p"));
    }else if(operation===14){
      for(const t of both)t.commands.transaction("compose",()=>{
        t.commands.replaceInlineRange("pk",at,end,"🌲");t.commands.replaceInlineRange("pk",at,at,"x");
      });
    }else{
      // Redo through both histories before branching again.
      for(const t of both){t.repo.undo();t.repo.undo();t.repo.redo();t.repo.redo();}
    }
    assert.deepEqual(hot.read(),cold.read(),`record at ${iteration}, operation ${operation}`);
    assert.deepEqual(hot.ids.keys(),cold.ids.keys(),`instance identity at ${iteration}`);
    const live=hot.repo.residentAnnotations("p");
    if(live)assert.deepEqual(live,cold.read().payload.standoffProperties);
  }
  leases.forEach(fn=>fn());
  assert.ok(counts.every(n=>n>100));assert.ok(retained.length>100);
  for(const {old,oracle} of retained)assert.deepEqual(old,oracle);
  console.log(JSON.stringify({seed:"5a11ce",commands:iteration,operationCounts:counts,checkedHistoricalRecords:retained.length}));
},120000);

it("bounds insertion work and detaches stale plans on rebind and lease loss",()=>{
  const t=make(true),release=t.repo.acquireResidentCells("p"),{counts,stop}=observeCellWork();
  try {
    const snapshot=vi.spyOn(t.repo,"snapshot").mockImplementation(()=>{throw Error("snapshot on typing");});
    t.commands.replaceInlineRange("pk",1,1,"x");
    const before={...counts}, n=Array.from(initial).length+1;
    t.commands.replaceInlineRange("pk",5,5,"🍏".repeat(32));
    expect(counts.suffixWrites-before.suffixWrites).toBe(n-5);
    for(const k of ["endpointVisits","retargets","survivorListReads","numericExports","hydrations"] as const)expect(counts[k]).toBe(before[k]);
    expect(counts.splices-before.splices).toBe(1);expect(snapshot).not.toHaveBeenCalled();
    const sequence=ResidentCells.open(t.read())!,plan=sequence.plan(1,2,"a")!;
    const other=ResidentCells.open(t.read(),sequence)!;
    expect(()=>plan.apply()).toThrow("Stale");expect(other.current.text).toContain("🍏");
    const revision=t.repo.state.revision,current=structuredClone(t.read());
    const veto=t.repo.beforeCommit(()=>{release();});
    expect(()=>t.commands.replaceInlineRange("pk",2,4,"lost")).toThrow("Stale");
    expect(t.repo.state.revision).toBe(revision);expect(t.read()).toEqual(current);veto();
    t.repo.undo();expect(t.read().compactInline!.spans).toEqual([{kind:"text",text:"Ax"+initial.slice(1)}]);
    snapshot.mockRestore();
  }finally{stop();release();}
});

it("rejects an obsolete repository preimage after a guard commits a different valid edit",()=>{
  const {repo,commands,read}=make(true),release=repo.acquireResidentCells("p");
  commands.replaceInlineRange("pk",0,0,"a");
  const before=structuredClone(read()),revision=repo.state.revision;
  const stop=repo.beforeCommit(()=>{stop();commands.replaceInlineRange("pk",2,2,"newer");});
  expect(()=>commands.replaceInlineRange("pk",0,4,"obsolete")).toThrow("Stale");
  expect(repo.state.revision).toBe(revision+1);
  expect(read().compactInline!.spans).toEqual([{kind:"text",text:"aAnewer"+initial.slice(1)}]);
  repo.undo();expect(read().payload).toEqual(before.payload);
  expect(read().compactInline).toEqual(before.compactInline);
  release();
});

it("rejects unsupported shapes before allocating canonical characters",()=>{
  const c=state().contents.p;
  c.compactInline={version:1,spans:[{kind:"text",text:"🍏".repeat(10000)}]};
  const d=observeCellWork();
  try{
    for(const p of [{start:0,end:16000},{isZeroWidth:true,start:2,end:5},{start:3.5,end:4}]){
      c.payload.standoffProperties=[p];
      expect(ResidentCells.open(c)).toBeUndefined();
    }
    expect(d.counts.allocations).toBe(0);
  }finally{d.stop();}
});
