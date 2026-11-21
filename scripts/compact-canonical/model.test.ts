import {it,expect,vi} from 'vitest';
import {CompactDocument,CompactWorkspace,plain,length,cpSlice} from './model';
import {EditingOccurrence,allocations,readonlyRuns} from './presentation';
import {fixture,fixtureBytes,edge} from './fixture';
import {decodeNative,nativeText,captureNative} from '../../src/persistence/native-resource';
import {resourceToRepository} from '../../src/history/durable-core';
import {CanonicalRepository} from '../../src/block-tree/repository';
import {TreeCommands} from '../../src/block-tree/commands';
import {standoffCellStyles} from '../../src/rendering/standoff-styles';
import {graphemeBoundaries} from '../../src/input/graphemes';
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const native=(d:CompactDocument)=>nativeText(decodeNative(new TextEncoder().encode(d.capture())));
function oracle(source=fixtureBytes()){
 const repository=new CanonicalRepository(resourceToRepository(decodeNative(source)),{enforceBlockIdentity:true});
 const commands=new TreeCommands(repository,k=>k);
 const placement=(id:string)=>{const state=repository.readState(),c=Object.values(state.contents).find(c=>c.payload.id===id)!;return Object.values(state.placements).find(p=>p.contentKey===c.key&&p.kind==='owned')!.key;};
 return {repository,commands,placement,capture:()=>nativeText(captureNative(repository.readState(),'experiment-document'))};
}
it('admits complete mixed native semantics with no canonical Cells and stable capture',()=>{const d=new CompactDocument(fixtureBytes());expect(d.metrics.canonicalCells).toBe(0);expect(d.all()).toHaveLength(7);expect(d.capture()).toBe(nativeText(decodeNative(fixtureBytes())));expect(native(d)).toBe(d.capture());});
it('preserves code-point positions while navigation remains grapheme-based',()=>{expect(cpSlice('A😀é漢',1,4)).toBe('😀é');expect(graphemeBoundaries('A😀é漢')).toEqual([0,1,2,4,5]);});
it('differentially checks 60 deterministic replacements including Unicode, images and overlapping properties',()=>{
 const d=new CompactDocument(fixtureBytes()),o=oracle();let seed=42;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let i=0;i<60;i++){const n=length(d.get('a').inline!),start=rand()%(n+1),end=start+rand()%(n-start+1),text=['x','😀','é','漢',''][rand()%5];
  d.replace('a',start,end,text?[{kind:'text',text}]:[]);o.commands.replaceInlineRange(o.placement('a'),start,end,text);expect(d.capture()).toBe(o.capture());
 }
});
it('publishes text and transformed semantics atomically to two occurrences and external consumers',()=>{
 const d=new CompactDocument(fixtureBytes()),a=new EditingOccurrence(d,'a'),b=new EditingOccurrence(d,'a'),ids=a.cells.map(c=>c.key);let calls=0;
 d.subscribe(n=>{calls++;expect(n.ids).toEqual(['a']);expect(a.cells.map(c=>c.text).join('')).toBe(plain(d.get('a').inline!));expect(b.cells.map(c=>c.text).join('')).toBe(plain(d.get('a').inline!));});
 d.replace('a',2,2,[{kind:'text',text:'Z'}]);expect(calls).toBe(1);expect(a.cells[0].key).toBe(ids[0]);expect(a.cells[3].key).toBe(ids[2]);expect(a.cells[2].key).not.toBe(b.cells[2].key);
 a.dispose();b.dispose();
});
it('undo/redo restores native semantics without rolling back revisions or unaffected editing identities',()=>{
 const d=new CompactDocument(fixtureBytes()),a=new EditingOccurrence(d,'a'),before=d.capture(),id=a.cells[0].key,version=d.version('a');
 d.replace('a',2,3,[{kind:'text',text:'XY'}]);const after=d.capture();expect(d.undo()).toBe(true);expect(d.capture()).toBe(before);expect(a.cells[0].key).toBe(id);expect(d.version('a')).toBeGreaterThan(version);expect(d.redo()).toBe(true);expect(d.capture()).toBe(after);a.dispose();
});
it('annotation edits preserve order, duplicate IDs, idless properties and linked ownership',()=>{
 const d=new CompactDocument(fixtureBytes()),o=oracle(),props=[...d.get('a').properties.standoffProperties,{type:'tei/note',start:0,end:1,metadata:{unknown:true}}];
 d.annotations('a',props);o.commands.setPayloadField(o.placement('a'),'standoffProperties',props);expect(d.capture()).toBe(o.capture());
 const before=d.capture(),rev=d.revision;expect(()=>d.annotations('a',[{annotationId:'missing',start:0,end:1}])).toThrow();expect(d.capture()).toBe(before);expect(d.revision).toBe(rev);
});
it('typing does not call capture, enumerate the document, validate globally or allocate unrelated Cells',()=>{
 const d=new CompactDocument(fixtureBytes()),a=new EditingOccurrence(d,'a'),b=new EditingOccurrence(d,'b');const before={...d.metrics},other=b.updates,created=allocations.editingCells;
 const all=vi.spyOn(d,'all').mockImplementation(()=>{throw Error('whole document scan');}),capture=vi.spyOn(d,'capture').mockImplementation(()=>{throw Error('snapshot');});
 d.replace('a',1,1,[{kind:'text',text:'x'}]);expect(d.metrics.fullValidation).toBe(before.fullValidation);expect(d.metrics.blockReads-before.blockReads).toBe(2);expect(d.metrics.changedBlocks-before.changedBlocks).toBe(1);expect(d.metrics.subscriberCalls-before.subscriberCalls).toBe(1);expect(allocations.editingCells-created).toBe(1);expect(b.updates).toBe(other);expect(all).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();a.dispose();b.dispose();
});
it('disposing and reopening regenerates only editing identity from immediately committed canonical data',()=>{const d=new CompactDocument(fixtureBytes()),a=new EditingOccurrence(d,'b'),key=a.cells[0].key;a.dispose();d.replace('b',0,0,[{kind:'text',text:'Q'}]);const b=new EditingOccurrence(d,'b');expect(b.cells[0].text).toBe('Q');expect(b.cells[1].key).not.toBe(key);b.dispose();});
it('rejects stale mutations without any publication',()=>{const d=new CompactDocument(fixtureBytes()),version=d.version('a');d.replace('a',0,0,[{kind:'text',text:'x'}]);const rev=d.revision;expect(()=>d.replace('a',0,0,[{kind:'text',text:'y'}],version)).toThrow('stale');expect(d.revision).toBe(rev);});
it('characterises both point forms without a silent normalization policy',()=>{const f=fixture();f.document.blocks.find(b=>b.id==='b')!.properties.standoffProperties=[{isZeroWidth:true,start:1,end:1},{isZeroWidth:true,start:1,end:0}];const d=new CompactDocument(bytes(f),'legacy'),o=oracle(bytes(f));d.replace('b',0,0,[{kind:'text',text:'x'}]);o.commands.replaceInlineRange(o.placement('b'),0,0,'x');expect(d.capture()).toBe(o.capture());expect(d.get('b').properties.standoffProperties).toMatchObject([{start:2,end:2},{start:1,end:0}]);});
it('splits and joins with atomic history and native ownership, preserving the left alternative',()=>{
 const d=new CompactDocument(fixtureBytes()),before=d.capture(),notices:any[]=[];d.subscribe(n=>notices.push(n));const right=d.split('a',3);expect(plain(d.get('a').inline!)).toBe('A😀e');expect(d.get(right).relations).toBeUndefined();expect(d.get('a').relations!.owned.alternative.target).toMatchObject({blockId:'alt'});expect(native(d)).toBe(d.capture());expect(notices).toHaveLength(1);d.undo();expect(d.capture()).toBe(before);d.redo();d.join('a',right);expect(plain(d.get('a').inline!)).toBe('A😀é漢 \uFFFC tail');expect(native(d)).toBe(d.capture());
});
it('differentially checks split content and annotations, allowing only new authored ID renaming',()=>{
 const d=new CompactDocument(fixtureBytes()),o=oracle();const right=d.split('a',3);o.commands.splitStandoff(o.placement('a'),3);
 const actual=JSON.parse(d.capture()),expected=JSON.parse(o.capture());const shape=(v:any)=>v.document.blocks.filter((b:any)=>b.type==='standoff-editor-block').map((b:any)=>({inline:b.inline,properties:{...b.properties,standoffProperties:b.properties.standoffProperties?.map((p:any,i:number)=>({...p,...typeof p.id==='string'&&p.id!=='duplicate'?{id:'generated-'+i}:{}}))},relations:b.relations?Object.keys(b.relations.owned):[]})).sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 expect(shape(actual)).toEqual(shape(expected));expect(right).not.toBe('a');expect(d.get('page').children!.map(e=>e.target.kind==='local'?e.target.blockId:'external')).toEqual(['a',right,'b','a','mode','neighbour']);
});
it('cross-Block replacement commits once, retains the left attachment and can undo consumed identity',()=>{const f=fixture();f.document.blocks[1].children!.splice(2,1);const d=new CompactDocument(bytes(f)),before=d.capture();let calls=0;d.subscribe(()=>calls++);d.join('a','b',{start:2,end:3,text:'Ω'});expect(calls).toBe(1);expect(plain(d.get('a').inline!)).toBe('A😀Ωond text.');expect(d.has('b')).toBe(false);expect(native(d)).toBe(d.capture());d.undo();expect(d.capture()).toBe(before);});
it('retains conservative mode, adjacency, attached-right and shared-right guards',()=>{const d=new CompactDocument(fixtureBytes());expect(()=>d.split('mode',3)).toThrow('intrinsic');expect(()=>d.join('a','mode')).toThrow();expect(()=>d.join('b','a')).toThrow();});
it('Cell-free runs reuse source-order style precedence and preserve complete semantics',()=>{
 const d=new CompactDocument(fixtureBytes()),before=d.capture(),allocated=allocations.editingCells,b=d.get('a'),result=readonlyRuns(b);let index=0;
 for(const run of result.runs){const n=run.text?[...run.text].length:1;for(let i=0;i<n;i++)expect(run.style).toEqual(standoffCellStyles(index+i,b.properties.standoffProperties));index+=n;}
 expect(index).toBe(length(b.inline!));expect(result.runs.some(r=>r.image?.alt==='blue square')).toBe(true);expect(result.runs.length).toBeLessThan(index);expect(allocations.editingCells).toBe(allocated);expect(d.capture()).toBe(before);expect(result.unsupported).toContain('owned relation presentation / active alternatives');
});
it('reports unsupported visual effects, concealment and points without discarding them',()=>{const d=new CompactDocument(fixtureBytes());d.annotations('b',[{type:'style/show-hide',start:0,end:2},{type:'style/glow',start:1,end:3},{type:'style/bold',start:1,end:0,isZeroWidth:true}]);expect(readonlyRuns(d.get('b')).unsupported).toEqual(['style/show-hide','style/glow','zero-width presentation']);expect(d.get('b').properties.standoffProperties).toHaveLength(3);});
it('workspace rejects identity collisions atomically',()=>{const w=new CompactWorkspace();w.admit(fixtureBytes());expect(()=>w.admit(fixtureBytes())).toThrow('resource collision');const f=fixture();f.resourceId=f.document.resourceId='other';(f.document.blocks[0].properties.metadata as any).documentId='other';expect(()=>w.admit(bytes(f))).toThrow('Block identity collision');expect(w.resources.size).toBe(1);});
const mutations:Array<[string,(f:ReturnType<typeof fixture>)=>void]>=[
 ['owned cycle',f=>f.document.blocks[2].children=[edge('cycle','doc')]],
 ['duplicate owner',f=>f.document.blocks[1].children!.push(edge('second','a'))],
 ['missing owner',f=>f.document.blocks[1].children!.splice(1,1)],
 ['unknown retention',f=>f.definitionOwnerBlockIds=['missing']],
 ['missing linked definition',f=>delete f.document.blocks[0].properties.linkedAnnotations],
 ['empty text atom',f=>f.document.blocks[2].inline![0]={kind:'text',text:''}],
 ['invalid image authored bag',f=>(f.document.blocks[2].inline![1] as any).properties=[]],
 ['invalid image asset link',f=>(f.document.blocks[2].inline![1] as any).properties.externalAsset={format:'codex-external-asset-gate',version:1,target:{}}],
 ['image missing linked definition',f=>(f.document.blocks[2].inline![1] as any).properties.standoffProperties=[{annotationId:'absent'}]],
 ['inline on non-text host',f=>f.document.blocks[2].type='plain-text-block'],
 ['duplicate Block identity',f=>f.document.blocks[3].id='a'],
 ['invalid inline atom kind',f=>(f.document.blocks[2].inline![1] as any).kind='unknown'],
];
for(const [name,mutate]of mutations)it('same native admission rejection: '+name,()=>{const f=fixture();mutate(f);expect(()=>decodeNative(bytes(f))).toThrow();expect(()=>new CompactDocument(bytes(f))).toThrow();});

it('cross-Block replacement differentially matches clipping, duplicate IDs and shared-content rejection',()=>{
 const shared=new CompactDocument(fixtureBytes()),sharedOracle=oracle();expect(()=>shared.join('a','b',{start:2,end:3,text:'Ω'})).toThrow('shared');expect(()=>sharedOracle.commands.replaceAcrossBlocks([{placementKey:sharedOracle.placement('a'),start:2,end:12},{placementKey:sharedOracle.placement('b'),start:0,end:3}],'Ω')).toThrow();
 const f=fixture();f.document.blocks[1].children!.splice(2,1);const d=new CompactDocument(bytes(f)),o=oracle(bytes(f)),n=length(d.get('a').inline!);
 d.join('a','b',{start:2,end:3,text:'Ω'});o.commands.replaceAcrossBlocks([{placementKey:o.placement('a'),start:2,end:n},{placementKey:o.placement('b'),start:0,end:3}],'Ω');
 const normalize=(text:string)=>{const value=JSON.parse(text);for(const b of value.document.blocks)if(b.properties.standoffProperties)b.properties.standoffProperties.forEach((p:any,i:number)=>{if(typeof p.id==='string'&&p.id!=='duplicate')p.id='generated-'+i;});return value;};expect(normalize(d.capture())).toEqual(normalize(o.capture()));
});

for(const affinity of ['before','after'] as const)it('approved point policy preserves both forms with equivalent '+affinity+' rebasing and atomic undo',()=>{
 const f=fixture();f.document.blocks[3].properties.standoffProperties=[{id:'equal',isZeroWidth:true,start:3,end:3,affinity},{id:'empty',isZeroWidth:true,start:3,end:2,affinity}];
 const d=new CompactDocument(bytes(f)),before=d.capture();d.replace('b',3,3,[{kind:'text',text:'😀'}]);let p=d.get('b').properties.standoffProperties;
 expect(p[0].start).toBe(affinity==='after'?4:3);expect(p[1].start).toBe(p[0].start);expect(p[0].end).toBe(p[0].start);expect(p[1].end).toBe(p[1].start-1);expect(native(d)).toBe(d.capture());d.undo();expect(d.capture()).toBe(before);
 d.replace('b',1,5,[]);expect(d.get('b').properties.standoffProperties).toEqual([]);
});
it('approved policy uses the current equal-endpoint oracle while retaining empty-interval storage',()=>{
 const f=fixture();f.document.blocks[3].properties.standoffProperties=[{id:'equal',isZeroWidth:true,start:3,end:3},{id:'empty',isZeroWidth:true,start:3,end:2}];
 const normalized=structuredClone(f);(normalized.document.blocks[3].properties.standoffProperties as any[])[1].end=3;const d=new CompactDocument(bytes(f)),o=oracle(bytes(normalized));
 for(const [start,end,text]of [[0,0,'😀'],[4,4,'XY'],[1,2,''],[0,8,'!']] as const){d.replace('b',start,end,text?[{kind:'text',text}]:[]);o.commands.replaceInlineRange(o.placement('b'),start,end,text);const a=JSON.parse(d.capture()),b=JSON.parse(o.capture());for(const block of a.document.blocks)for(const p of block.properties.standoffProperties??[])if(p.id==='empty')p.end=p.start;expect(a).toEqual(b);}
});
it('split preserves the approved point form on the right while legacy mode records the existing normalization',()=>{
 const f=fixture();f.document.blocks[3].properties.standoffProperties=[{isZeroWidth:true,start:4,end:3,affinity:'after'}];const d=new CompactDocument(bytes(f)),legacy=new CompactDocument(bytes(f),'legacy');const r=d.split('b',3),l=legacy.split('b',3);expect(d.get(r).properties.standoffProperties[0]).toMatchObject({start:1,end:0});expect(legacy.get(l).properties.standoffProperties[0]).toMatchObject({start:1,end:1});
});

it('does not notify 500 unrelated occurrence subscribers during one-Block typing',()=>{const d=new CompactDocument(fixtureBytes());let unrelated=0;const releases=Array.from({length:500},()=>d.subscribe(()=>unrelated++,'b'));const a=new EditingOccurrence(d,'a'),before=d.metrics.subscriberCalls;d.replace('a',1,1,[{kind:'text',text:'x'}]);expect(unrelated).toBe(0);expect(d.metrics.subscriberCalls-before).toBe(1);releases.forEach(f=>f());a.dispose();});
it('keeps canonical records immutable and isolates authored inputs',()=>{const d=new CompactDocument(fixtureBytes());expect(()=>d.get('a').inline!.push({kind:'text',text:'bad'})).toThrow();const props=[{type:'tei/note',start:0,end:1,metadata:{note:'original'}}];d.annotations('b',props);props[0].metadata.note='changed';expect(d.get('b').properties.standoffProperties[0].metadata.note).toBe('original');});
it('agrees on valid retained definitions, reference cycles and explicit unresolved foreign semantics',()=>{
 for(const kind of ['retained','reference-cycle','foreign'] as const){const f=fixture();if(kind==='retained'){f.document.blocks[1].children!.splice(1,1);f.definitionOwnerBlockIds=['b'];}if(kind==='reference-cycle')f.document.blocks[3].children=[edge('self','b','reference')];if(kind==='foreign')f.document.blocks[3].properties.standoffProperties=[{annotationId:'unknown',start:0,end:1,externalDefinition:{format:'codex-external-definition-gate',version:1,target:{kind:'definition',targetId:'unknown',source:{scope:'document',resourceId:'absent'},version:{kind:'unpinned'}}}}];const d=new CompactDocument(bytes(f));expect(d.capture()).toBe(nativeText(decodeNative(bytes(f))));}
});
it('preserves authored native-v2 foreign ownership without binding or dereferencing it',()=>{const f=fixture();f.valueEncoding='codex-authored-value-v1';f.document.version=2;f.document.blocks[1].children!.push({placementId:'foreign',kind:'owned',target:{kind:'external',reference:{kind:'block',targetId:'foreign-root',source:{scope:'document',resourceId:'external-doc'},version:{kind:'unpinned'}}}});expect(new CompactDocument(bytes(f)).capture()).toBe(nativeText(decodeNative(bytes(f))));});
it('invalid inserted objects do not publish, mutate history or disturb live occurrences',()=>{const d=new CompactDocument(fixtureBytes()),a=new EditingOccurrence(d,'a'),before=d.capture(),rev=d.revision,updates=a.updates;expect(()=>d.replace('a',0,0,[{kind:'image',properties:{standoffProperties:[{annotationId:'missing'}]}}])).toThrow();expect(d.revision).toBe(rev);expect(a.updates).toBe(updates);expect(d.capture()).toBe(before);expect(d.undo()).toBe(false);a.dispose();});
it('characterises image-command annotation rebasing as an unqualified integration difference',()=>{const d=new CompactDocument(fixtureBytes()),o=oracle(),image={assetId:'local',src:'data:image/png;base64,',alt:'retained'};d.replace('b',0,0,[{kind:'image',properties:image}]);o.commands.insertInlineImage(o.placement('b'),0,image);expect(d.get('b').properties.standoffProperties[0]).toMatchObject({start:2,end:5});const b=JSON.parse(o.capture()).document.blocks.find((b:any)=>b.id==='b');expect(b.properties.standoffProperties[0]).toMatchObject({start:1,end:4});});

it('differentially preserves every commit and Undo/Redo with ZWJ, CR/LF and combining sequences',()=>{
 const d=new CompactDocument(fixtureBytes()),o=oracle();for(const text of ['👨‍👩‍👧‍👦','\r\n','é','😀','']){d.replace('b',1,2,text?[{kind:'text',text}]:[]);o.commands.replaceInlineRange(o.placement('b'),1,2,text);expect(d.capture()).toBe(o.capture());}
 for(let i=0;i<5;i++){d.undo();o.repository.undo();expect(d.capture()).toBe(o.capture());}for(let i=0;i<5;i++){d.redo();o.repository.redo();expect(d.capture()).toBe(o.capture());}
});
it('constructing and disposing editing projections never commits, captures or creates undo history',()=>{const d=new CompactDocument(fixtureBytes()),before={...d.metrics};const o=new EditingOccurrence(d,'a');o.dispose();expect(d.revision).toBe(0);expect(d.metrics.publications).toBe(before.publications);expect(d.metrics.captures).toBe(before.captures);expect(d.undo()).toBe(false);});

it('matches native capture ordering for retained-definition membership without reordering properties',()=>{const f=fixture();f.definitionOwnerBlockIds=['b','a'];const d=new CompactDocument(bytes(f));expect(d.capture()).toBe(nativeText(decodeNative(bytes(f))));expect(d.get('a').properties.blockProperties.map((p:any)=>p.value)).toEqual(['left','center']);});

for(const at of [0,1,4,5,12])it('typed image insertion follows text boundary policy at '+at,()=>{
 const d=new CompactDocument(fixtureBytes()),o=oracle(),payload={assetId:'local',src:'data:image/png;base64,',alt:'retained',metadata:{unknown:['preserved']}};
 const before=d.capture();d.replace('b',at,at,[{kind:'image',properties:payload}]);o.commands.replaceInlineRange(o.placement('b'),at,at,'x');
 const expected=JSON.parse(o.capture()).document.blocks.find((b:any)=>b.id==='b');
 expect(d.get('b').properties.standoffProperties).toEqual(expected.properties.standoffProperties);
 expect(d.get('b').inline!.find(a=>a.kind==='image')).toEqual({kind:'image',properties:payload});
 const after=d.capture();expect(native(d)).toBe(after);d.undo();expect(d.capture()).toBe(before);d.redo();expect(d.capture()).toBe(after);
});
