// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {createPackage,openPackage,nativeInventory} from './format';
import {packageFragment,materializePackage} from './native';
import {decodeBlockTree} from '../../block-tree/codecs';
import {captureNative,nativeBytes} from '../../persistence/native-resource';
import {pdfFixture} from '../../pdf/fixtures';
import {hash,unpackZip,packZip,bytes} from './archive';
import {resourceAssets} from './resources';
const context=(snapshot:any)=>({data:{kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[{name:'SourceSnapshot',classification:'canonical',columns:['guid','attributes'],rows:[[['text',snapshot.snapshotId],['text',JSON.stringify(snapshot)]]]}],provenance:{},selection:{},unresolved:[],excluded:[]} as any,schema:{kind:'mutable-knowledge-schema',version:1,tables:[{name:'SourceSnapshot',columns:[{name:'guid'},{name:'attributes'}]}]}});
it('reports the Vault boundary for contribution attachments instead of claiming a self-contained package',()=>{
 const state=decodeBlockTree({id:'doc',type:'document-block',children:[{id:'contribution',type:'container-block',metadata:{dialectic:{kind:'contribution',attachments:[{asset:{kind:'managed',cavernId:'source',assetId:'sha256:'+'a'.repeat(64)}}]}}}]}).state;
 expect(nativeInventory(captureNative(state,'doc')).unresolvedAssets).toEqual([{blockId:'contribution',reason:expect.stringContaining('Dialectic attachment references require the original Vault')}]);
});
it('preserves PDF/JSON original closure and exact source rows while imports allocate new occurrence identities and stay inactive',async()=>{
 const pdf=pdfFixture(),reference={kind:'managed' as const,cavernId:'source',assetId:'sha256:'+await hash(pdf)},snapshot={version:1,kind:'pdf',snapshotId:'snapshot',resourceId:'resource',entityId:'entity',asset:reference,inspection:{pages:2,label:'PDF',kind:'pdf-inspection'}};
 const state=decodeBlockTree({id:'doc',type:'document-block',children:[{id:'occurrence',type:'mutable/pdf-document-block',pdf:snapshot,blockProperties:[{id:'note',type:'mutable/resource-annotation',value:'Authored note',anchor:{kind:'pdf-page',snapshotId:'snapshot'}}]}]}).state;
 const original=captureNative(state,'doc'),c=context(snapshot),archive=await createPackage(nativeBytes(original),{resourceId:'doc',cavernId:'source'},c.data,c.schema,[{reference,mediaType:'application/pdf',bytes:pdf}]),loaded=await openPackage(archive);
 expect(loaded.manifest.profile).toBe('mutable-inkpkg-resources-v1');expect(Array.from(loaded.assets[0].bytes)).toEqual(Array.from(pdf));expect(loaded.data).toEqual(c.data);expect(resourceAssets(loaded.data)).toEqual([reference]);
 const native=materializePackage(packageFragment(loaded.snapshot,'source'),'destination',[],{...c,source:loaded.manifest.source,assetBindings:[['source/'+reference.assetId,{...reference,cavernId:'destination'}]]});
 const occurrence=Object.values(native.state.contents).find(c=>(c.payload.original as any)?.type==='mutable/pdf-document-block')!;
 expect(occurrence.viewType).toBe('mutable/opaque-block');expect(occurrence.payload.id).not.toBe('occurrence');expect((occurrence.payload.blockProperties as any[])[0].type).toBe('mutable/opaque-block-property');expect((occurrence.payload.blockProperties as any[])[0].id).not.toBe('note');expect(nativeInventory(captureNative(native.state,String(native.state.contents[native.state.placements[native.roots[0]].contentKey].payload.id))).assets[0].cavernId).toBe('destination');
});
it('records partial snapshot closure and rejects unreferenced originals or mismatched original hashes',async()=>{
 const json=bytes('{"rights":"Retain attribution"}'),reference={kind:'managed' as const,cavernId:'source',assetId:'sha256:'+await hash(json)},snapshot={version:1,kind:'iiif-canvas',snapshotId:'info',asset:reference},c=context(snapshot),doc=captureNative(decodeBlockTree({id:'doc',type:'document-block',children:[]}).state,'doc');
 const included=await createPackage(nativeBytes(doc),{resourceId:'doc'},c.data,c.schema,[{reference,mediaType:'application/json',bytes:json}]);expect(Array.from((await openPackage(included)).assets[0].bytes)).toEqual(Array.from(json));
 const missing=await createPackage(nativeBytes(doc),{resourceId:'doc'},c.data,c.schema,[]);expect((await openPackage(missing)).manifest.boundaries).toContain('Missing retained original: source/'+reference.assetId);
 await expect(createPackage(nativeBytes(doc),{resourceId:'doc'},c.data,c.schema,[{reference:{...reference,assetId:'sha256:'+'a'.repeat(64)},mediaType:'application/json',bytes:json}])).rejects.toThrow('integrity');
 const m=unpackZip(included),manifest=JSON.parse(new TextDecoder().decode(m.get('manifest.json')));manifest.profile='mutable-inkpkg-passive-v1';m.set('manifest.json',bytes(JSON.stringify(manifest)));await expect(openPackage(packZip(Object.fromEntries(m)))).rejects.toThrow('Invalid package original');
});
it('keeps reconstruction envelopes and local bindings through re-export of an inactive imported resource',async()=>{
 const original=pdfFixture(),ref={kind:'managed' as const,cavernId:'a',assetId:'sha256:'+await hash(original)},s={version:1,kind:'pdf',snapshotId:'snapshot',resourceId:'resource',asset:ref},c=context(s),doc=captureNative(decodeBlockTree({id:'doc',type:'document-block',children:[{id:'pdf',type:'mutable/pdf-document-block',pdf:s}]}).state,'doc');
 const first=materializePackage(packageFragment(doc,'a'),'b',[],{...c,source:{},assetBindings:[['a/'+ref.assetId,{...ref,cavernId:'b'}]]}),root=first.state.contents[first.state.placements[first.roots[0]].contentKey];const snapshot=captureNative(first.state,String(root.payload.id));expect(nativeInventory(snapshot).assets.every(a=>a.cavernId==='b')).toBe(true);
 const empty={data:{...c.data,tables:[]},schema:{kind:'mutable-knowledge-schema',version:1,tables:[]},source:{}};
 const archive=await createPackage(nativeBytes(snapshot),{resourceId:String(root.payload.id),cavernId:'b'},empty.data,empty.schema,[{reference:{...ref,cavernId:'b'},mediaType:'application/pdf',bytes:original}]);const loaded=await openPackage(archive),second=materializePackage(packageFragment(loaded.snapshot,'b'),'c',[],{...empty,assetBindings:[['b/'+ref.assetId,{...ref,cavernId:'c'}]]});
 const opaque=Object.values(second.state.contents).find(c=>(c.payload.original as any)?.type==='mutable/pdf-document-block')!,retained=(opaque.payload.original as any).data.archive;expect(retained.snapshots[0]).toEqual(s);expect(retained.bindings).toEqual([['a/'+ref.assetId,{...ref,cavernId:'c'}]]);expect(opaque.viewType).toBe('mutable/opaque-block');
});
