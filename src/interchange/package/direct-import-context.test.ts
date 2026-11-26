// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {materializeFragment} from '../materialize';
import {documentFragment} from '../document-import';
import {emptyFragment,validateFragment} from '../fragment';
import {pdfBlock} from '../../pdf/block';
import {PDF_BLOCK,type PdfCapture} from '../../pdf/model';
import {resourceOwner} from '../../block-tree/resource-identity';
import {captureAssets,resourceSnapshots} from './resources';
import {validatePackageData} from './data';
import {assetKey} from '../managed-asset';
import {directImportCaptures,stampDirectImportContext} from './native';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {restoreArchivedResource} from '../../runtime/archived-resources';

/** Post-admission shape: pdfFile mints the capture with a pending Cavern and
 * importNew's admit() rewrites the asset to the destination Cavern before the
 * fragment is wrapped, so the harvested capture must already look like this. */
const asset={kind:'managed' as const,cavernId:'cavern-x',assetId:'sha256:'+'a'.repeat(64)};
const capture:PdfCapture={version:1,kind:'pdf',snapshotId:'snapshot-1',identityId:'identity-1',entityId:'entity-1',resourceId:'resource-1',sourceUrl:'paper.pdf',endpoint:'local-file',retrievedAt:'2026-11-26T00:00:00.000Z',asset,inspection:{kind:'pdf-inspection',pages:2,label:'Paper',version:'1.7'}};

/** Mirrors importNew's non-native branch: pdfBlock fragment, document wrap,
 * provenance stamp, then the operations 'materialize' call itself. */
function importedNative(){
 const wrapped=documentFragment(pdfBlock(capture).fragment,'Paper','paper.pdf');
 (wrapped.blocks.at(-1)!.data.metadata as any).interchange.provenance={version:1,filename:'paper.pdf',format:'pdf',byteHash:'a'.repeat(64)};
 return {wrapped,native:materializeFragment(wrapped,{},new Map())};
}

describe('direct import package context',()=>{
 it('stamps an isolated context that Restore can read back',()=>{
  const {wrapped,native}=importedNative();
  const captures=directImportCaptures(wrapped);
  expect(captures).toHaveLength(1);expect(captures[0].snapshotId).toBe(capture.snapshotId);expect(captures[0].asset).toEqual(asset);
  stampDirectImportContext(native,captures,{operation:'import-file',filename:'paper.pdf'});
  const state=native.state;
  const opaque=Object.values(state.contents).find(c=>c.viewType==='mutable/opaque-block'&&(c.payload.original as any)?.type===PDF_BLOCK);
  expect(opaque).toBeDefined();
  // The exact lookup restoreArchivedResource performs (archived-resources.ts).
  const owner=resourceOwner(state,opaque!.key)!;
  expect(owner.viewType).toBe('document-block');
  const contextId=(owner.payload.metadata as any)?.packageContextBlockId;
  const contextRecord=Object.values(state.contents).find(c=>c.payload.id===contextId&&c.definitionOwnerKey===owner.key);
  expect(contextRecord?.viewType).toBe('mutable/package-data-block');
  const context=(contextRecord!.payload as any).packageContext;
  expect(context).toBeDefined();
  expect(()=>validatePackageData(context.data)).not.toThrow();
  expect(context.data.provenance).toMatchObject({operation:'import-file',filename:'paper.pdf'});
  // Restore decodes the snapshot table and pins the retained capture.
  const snapshots=resourceSnapshots(context.data);
  expect(snapshots).toHaveLength(1);expect(snapshots[0].snapshotId).toBe(capture.snapshotId);expect(snapshots[0].asset).toEqual(asset);
  const original=(opaque!.payload.original as any),retained=original.data.pdf??original.data.iiif??original.data.article??original.data.citation;
  expect(snapshots.filter((s:any)=>s.snapshotId===retained.snapshotId||s.parentSnapshotId===retained.snapshotId).some((s:any)=>s.snapshotId===retained.snapshotId)).toBe(true);
  // Every original the capture names is explicitly bound in the context.
  const bound=new Map<string,unknown>(context.assetBindings);
  for(const a of captureAssets(retained))expect(bound.get(assetKey(a))).toEqual(a);
  // The stamp merges into the root metadata instead of replacing it.
  const metadata=owner.payload.metadata as any;
  expect(metadata.title).toBe('Paper');expect(metadata.interchange.provenance).toMatchObject({filename:'paper.pdf'});
 });
 it('harvests nothing when a fragment carries no resource captures',()=>{
  const f=emptyFragment();
  f.blocks.push({localId:'t',type:'plain-text-block',data:{text:'hi'},children:[],relations:{},blockProperties:[]});
  f.placements.push({localId:'e',kind:'owned',target:{kind:'local',object:'block',id:'t'}});
  f.roots.push({placement:'e',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});
  expect(directImportCaptures(validateFragment(f))).toEqual([]);
  // A resource Block whose capture has no snapshot identity cannot anchor a context.
  const g=pdfBlock(capture).fragment;delete (g.blocks[0].data.pdf as any).snapshotId;
  expect(directImportCaptures(g)).toEqual([]);
  // And a materialization the wiring leaves unstamped carries no context.
  const {native}=importedNative();
  expect(Object.values(native.state.contents).some(c=>c.viewType==='mutable/package-data-block')).toBe(false);
  const root=native.state.contents[native.state.placements[native.roots[0]].contentKey];
  expect((root.payload.metadata as any).packageContextBlockId).toBeUndefined();
 });
});

describe('direct import package context through insertion',()=>{
 it('survives the real insertFragment and Restore finds it in the live state',()=>{
  const {wrapped,native}=importedNative();
  const captures=directImportCaptures(wrapped);
  expect(captures).toHaveLength(1);
  stampDirectImportContext(native,captures,{operation:'import-file',filename:'paper.pdf'});
  const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]});
  try{
   // Insert into the workspace object bank exactly as importNew does.
   const state0=editor.repository.readState(),workspace=state0.contents[state0.placements[state0.rootPlacementKey].contentKey];
   const banks=workspace.children.filter(k=>state0.contents[state0.placements[k].contentKey].viewType==='workspace-object-bank-block');
   expect(banks).toHaveLength(1);
   editor.commands.insertFragment(native,{kind:'at',parentKey:banks[0],index:state0.contents[state0.placements[banks[0]].contentKey].children.length},{commandId:'interchange.import-new',subjects:[]});
   const state=editor.repository.readState();
   const opaque=Object.values(state.contents).find(c=>c.viewType==='mutable/opaque-block'&&(c.payload.original as any)?.type===PDF_BLOCK);
   expect(opaque).toBeDefined();
   // The stamped context record must keep its definition ownership across
   // insertion: Restore finds it by payload id AND definitionOwnerKey.
   const owner=resourceOwner(state,opaque!.key)!;
   expect(owner.viewType).toBe('document-block');
   const contextId=(owner.payload.metadata as any)?.packageContextBlockId;
   const contextRecord=Object.values(state.contents).find(c=>c.payload.id===contextId&&c.definitionOwnerKey===owner.key);
   expect(contextRecord?.viewType).toBe('mutable/package-data-block');
   expect((contextRecord!.payload as any).packageContext).toBeDefined();
   // The real Restore, driven through the editor's own repository/commands.
   const view=editor.createView('test');
   const node=Object.values(view.state.nodes).find(n=>n.viewType==='mutable/opaque-block')!;
   const stub={features:{crossResourceLoaders:true},repository:editor.repository,commands:editor.commands,node:(k:string)=>editor.node(k as any),readAssetContext:()=>({cavernId:'cavern-x',session:'session-1'})} as any;
   expect(()=>restoreArchivedResource(stub,node.key)).not.toThrow();
   const restored=Object.values(editor.repository.readState().contents).find(c=>c.viewType===PDF_BLOCK);
   expect(restored).toBeDefined();
   expect((restored!.payload as any).archive?.snapshots).toHaveLength(1);
   expect((restored!.payload as any).archive.snapshots[0].snapshotId).toBe(capture.snapshotId);
  } finally { editor.dispose(); }
 });
});
