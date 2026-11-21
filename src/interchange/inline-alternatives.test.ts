import { expect, it, vi } from 'vitest';
import { decodeBlockTree } from '../block-tree/codecs';
import { CanonicalRepository } from '../block-tree/repository';
import { TreeCommands } from '../block-tree/commands';
import { contentLength, inlineText } from '../block-tree/inline-sequence';
import { alternativeSlots } from '../block-tree/inline-alternative';
import { serializeSelection, fragmentText, plainFragment } from './serializer';
import { materializeFragment } from './materialize';
import { exportClipboard, importClipboard, NATIVE_MIME } from './transport';
import { validateFragment } from './fragment';
import { captureNative, nativeBytes, nativeText, decodeNative, parseNativeEnvelope } from '../persistence/native-resource';
import { INLINE_ALTERNATIVES_CAPABILITY } from './capabilities';
import type { ExistingBlockDto } from '../block-tree/types';

const text=(id:string,value:string):ExistingBlockDto=>({id,type:'standoff-editor-block',inlineAtoms:value?[{kind:'text',text:value}]:[]});
const host=(id:string,nested=false):ExistingBlockDto=>({ ...text(id,''),inlineAtoms:[{kind:'text',text:'L'},{kind:'alternative',properties:{version:1,id:id+'-slot',readings:['inline-reading:'+id+'a','inline-reading:'+id+'b'],metadata:{witnesses:['#w','#w'],responsibility:'#r'}}},{kind:'text',text:'R'}],relation:{['inline-reading:'+id+'a']:nested?host(id+'nested'): {...text(id+'a','rich😀'),standoffProperties:[{id:id+'bold',type:'style/bold',start:0,end:3},{id:id+'point',type:'tei/milestone',start:5,end:4,isZeroWidth:true}]},['inline-reading:'+id+'b']:text(id+'b','')}});
function setup(children:ExistingBlockDto[]=[host('host',true),text('other','target')],id='doc'){
 const repo=new CanonicalRepository(decodeBlockTree({id,type:'document-block',children}).state),commands=new TreeCommands(repo,k=>k);
 const content=(id:string)=>Object.values(repo.readState().contents).find(c=>c.payload.id===id)!;
 const placement=(id:string)=>Object.values(repo.readState().placements).find(p=>p.contentKey===content(id).key)!.key;
 const save=()=>nativeText(captureNative(repo.readState(),id));
 return {repo,commands,content,placement,save};
}
const copy=(f:ReturnType<typeof setup>,id='host',start=0,end=3)=>serializeSelection(f.repo.readState(),[{placementKey:f.placement(id),start,end}],{resourceId:'doc'});
const paste=(f:ReturnType<typeof setup>,fragment:ReturnType<typeof copy>,id='other',start=1,end=start)=>f.commands.insertMutableText([{segments:[{placementKey:f.placement(id),start,end}],fragment:materializeFragment(fragment),slices:fragment.roots}]);
it('copies all nested/empty readings without source edits, then pastes fresh ownership in one undoable compact transaction',()=>{
 const f=setup(),before=f.save(),fragment=copy(f),snapshot=vi.spyOn(f.repo,'snapshot'),changed=vi.fn();f.repo.subscribeChanges(changed);
 expect(fragment.blocks).toHaveLength(5);expect(f.save()).toBe(before);expect(fragment.requiredCapabilities).toEqual([INLINE_ALTERNATIVES_CAPABILITY]);
 const oldIds=new Set(Object.values(f.repo.readState().contents).map(c=>c.payload.id));paste(f,fragment);
 expect(changed).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();expect(alternativeSlots(f.content('other'))).toHaveLength(1);
 expect(inlineText(f.content('other').compactInline!.spans)).toBe('tL\ufffcRarget');
 const after=f.save();expect(after).toContain('#w');expect(Object.values(f.repo.readState().contents).filter(c=>!oldIds.has(c.payload.id))).toHaveLength(4);
 expect(Object.values(f.repo.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);
 f.repo.undo();expect(f.save()).toBe(before);f.repo.redo();expect(f.save()).toBe(after);
 expect(nativeText(decodeNative(nativeBytes(captureNative(f.repo.readState(),'doc')),undefined,true))).toBe(after);
});
it('copies several slots across Documents and repeatedly into the same host with fresh identities',()=>{
 const source=setup([host('host'),host('second')]),dest=setup([text('other','x')],'destination');
 const fragment=copy(source);paste(dest,fragment);paste(dest,fragment);expect(alternativeSlots(dest.content('other'))).toHaveLength(2);
 const slots=alternativeSlots(dest.content('other'));expect(new Set(slots.map(s=>s.properties.id)).size).toBe(2);expect(Object.keys(dest.content('other').ownedRelations)).toHaveLength(4);expect(()=>dest.save()).not.toThrow();
 const multi=serializeSelection(source.repo.readState(),['host','second'].map(id=>({placementKey:source.placement(id),start:0,end:3})));paste(dest,multi);expect(()=>dest.save()).not.toThrow();
});
it('uses the occurrence-selected reading externally and retains all readings in native transport',()=>{
 const f=setup();const fragment=serializeSelection(f.repo.readState(),[{placementKey:f.placement('host'),start:0,end:3}],{},false,undefined,()=>1);
 const out=exportClipboard(fragment);expect(out['text/plain']).toBe('LR');expect(importClipboard(out).fragment).toEqual(fragment);
 const carrier={...out};delete carrier[NATIVE_MIME];expect(importClipboard(carrier).fragment).toEqual(fragment);
 expect(fragmentText(fragment)).toBe('LR');expect(f.save()).toContain('rich😀');
 const styled=exportClipboard(copy(f));expect(styled['text/html']).toContain('<strong>rich</strong>😀');const htmlOnly={...styled};delete htmlOnly[NATIVE_MIME];expect(importClipboard(htmlOnly).fragment).toEqual(copy(f));
 expect(()=>importClipboard({...carrier,'text/plain':'changed'})).toThrow(/no longer matches/);
 const bad=structuredClone(fragment);(bad.blocks[0].inline!.atoms[1] as any).properties.version=99;
 expect(()=>importClipboard({...out,[NATIVE_MIME]:JSON.stringify(bad)})).toThrow(/No lossy fallback/);
 expect(()=>validateFragment(bad)).toThrow();expect(importClipboard(out,true).fragment?.blocks).toHaveLength(1);
});
it.each([[false,true],[true,false],[true,true]])('joins adjacent ordinary/slot paragraphs %j with exact Undo', (left,right)=>{
 const f=setup([left?host('left'):text('left',''),right?host('right'):text('right','ordinary')]);const before=f.save(),at=contentLength(f.content('left'));
 expect(f.commands.joinStandoff(f.placement('left'),f.placement('right'))).toBe(at);expect(alternativeSlots(f.content('left'))).toHaveLength(Number(left)+Number(right));expect(()=>f.save()).not.toThrow();
 const after=f.save();f.repo.undo();expect(f.save()).toBe(before);f.repo.redo();expect(f.save()).toBe(after);
});
it('replaces a cross-paragraph region including slots and transfers surviving suffix ownership',()=>{
 const f=setup([host('a',true),host('b')]),before=f.save();f.commands.replaceAcrossBlocks([{placementKey:f.placement('a'),start:1,end:3},{placementKey:f.placement('b'),start:0,end:1}],'X\nY');
 expect(()=>f.save()).not.toThrow();expect(Object.values(f.repo.readState().contents).filter(c=>alternativeSlots(c).length)).toHaveLength(1);
 f.repo.undo();expect(f.save()).toBe(before);f.repo.redo();expect(()=>f.save()).not.toThrow();
});
it('rejects shared reading ownership and failed insertion without publication',()=>{
 const f=setup(),fragment=copy(f),before=f.save();const malformed=structuredClone(fragment),atom=malformed.blocks[0].inline!.atoms[1] as any;atom.properties.readings.push(atom.properties.readings[0]);expect(()=>validateFragment(malformed)).toThrow();
 const prepared=materializeFragment(fragment),child=Object.values(prepared.state.contents).find(c=>c.compactInline&&!alternativeSlots(c).length)!;child.children.push('missing');
 expect(()=>f.commands.insertMutableText([{segments:[{placementKey:f.placement('other'),start:0,end:0}],fragment:prepared,slices:fragment.roots}])).toThrow();expect(f.save()).toBe(before);
});
it('declares native capability without changing old documents and admits M4 files',()=>{
 const f=setup(),bytes=nativeBytes(captureNative(f.repo.readState(),'doc')),envelope=parseNativeEnvelope(bytes);expect(envelope.requiredCapabilities).toEqual([INLINE_ALTERNATIVES_CAPABILITY]);
 expect(()=>parseNativeEnvelope(bytes,new Set())).toThrow(/Unsupported native capability/);
 delete envelope.requiredCapabilities;expect(()=>decodeNative(new TextEncoder().encode(JSON.stringify(envelope)),undefined,true)).not.toThrow();
 const old=setup([text('other','old')]);expect(parseNativeEnvelope(nativeBytes(captureNative(old.repo.readState(),'doc'))).requiredCapabilities).toBeUndefined();
});

it('preserves TEI witnesses, local Entity definitions and remaps semantic pointers into a non-TEI Document',async()=>{
 const {convertTei}=await import('./tei/convert'),{encodeTeiNative}=await import('./tei/compact-native'),{resourceToRepository}=await import('../history/durable-core');
 const xml='<TEI><teiHeader><listPerson><person xml:id="alice"><persName>Alice</persName></person></listPerson></teiHeader><text><p xml:id="host">Before <app xml:id="app"><lem><persName ref="#alice">Alice</persName><subst><del>x</del><add>y</add></subst></lem><rdg wit="#w #w" resp="#alice"><pb n="2"/></rdg></app> after</p></text></TEI>';
 const r=decodeNative(encodeTeiNative(convertTei(xml).document).bytes,undefined,true),state=resourceToRepository(r),host=Object.values(state.contents).find(c=>(c.payload.metadata as any)?.sourceId==='host')!,pk=Object.values(state.placements).find(p=>p.contentKey===host.key)!.key;
 const fragment=serializeSelection(state,[{placementKey:pk,start:0,end:contentLength(host)}],{resourceId:r.resourceId}),dest=setup([text('other','x')],'dest');paste(dest,fragment);
 const native=captureNative(dest.repo.readState(),'dest'),root=Object.values(native.contents).find(c=>c.viewType==='document-block')!,defs=root.payload.linkedAnnotations as Record<string,any>;
 expect(Object.values(defs).some(d=>d.type==='mutable/gloss'&&d.value==='entity: Alice')).toBe(true);
 const slot=alternativeSlots(dest.content('other'))[0];expect(defs[(slot.properties.metadata as any).tei.annotationId]).toBeTruthy();
 const editorial=Object.values(defs).filter(d=>d.metadata?.parentEditorialId);expect(editorial.length).toBeGreaterThanOrEqual(2);editorial.forEach(d=>expect(defs[d.metadata.parentEditorialId]?.type).toBe('tei/editorial'));
 const mentions=Object.values(defs).filter(d=>d.metadata?.references);expect(mentions.length).toBeGreaterThan(0);
 for(const d of mentions)for(const ref of d.metadata.references)for(const token of ref.tokens)if(token.state==='resolved'&&token.target?.kind==='definition')expect(defs[token.target.id]).toBeTruthy();
 expect(dest.save()).toContain('#w #w');expect(dest.save()).not.toContain('mutable/opaque-property');
});
it('retains managed images beside slots and in inactive readings without foreign asset rebinding',()=>{
 const dto=host('host'),asset={kind:'managed',cavernId:'one',assetId:'sha256:'+'a'.repeat(64)};
 (dto.inlineAtoms as any[]).push({kind:'image',properties:{asset,alt:'map',src:'',status:'ready'}});
 (dto.relation!['inline-reading:hostb'] as ExistingBlockDto).inlineAtoms=[{kind:'image',properties:{asset,alt:'inactive',src:'',status:'ready'}}];
 const f=setup([dto]),fragment=copy(f,'host',0,4);expect(fragment.embeds).toHaveLength(2);
 const before=f.save();expect(()=>f.commands.copy(f.placement('host'),{kind:'after',anchorKey:f.placement('host')})).toThrow(/native clipboard/);expect(f.save()).toBe(before);
 const same=materializeFragment(fragment,{cavernId:'one'},new Map([['one/'+asset.assetId,asset.assetId]]));
 const foreign=materializeFragment(fragment,{cavernId:'two'});expect(Object.values(foreign.state.contents).flatMap(c=>c.compactInline?.spans??[]).filter(a=>a.kind==='image').every(a=>(a as any).properties.original)).toBe(true);
 expect(JSON.stringify(foreign)).toContain(asset.assetId);expect(()=>validateFragment(fragment)).not.toThrow();expect(Object.values(same.state.contents).flatMap(c=>c.compactInline?.spans??[]).filter(a=>a.kind==='image').every(a=>(a as any).properties.status==='ready')).toBe(true);expect(Object.values(same.state.contents).some(c=>c.viewType==='text-cell')).toBe(false);
});
it('rejects slot identity conflicts, mode joins and non-reading attachments before publication',()=>{
 for(const kind of ['collision','mode','attachment']){
  const a=host('a'),b=host('b');if(kind==='collision')((b.inlineAtoms as any[])[1].properties).id='a-slot';
  if(kind==='mode')b.mode='tei/verse-line';if(kind==='attachment')b.relation!['rightMargin']={id:'margin',type:'right-margin-block'};
  const f=setup([a,b]),before=f.save();expect(()=>f.commands.joinStandoff(f.placement('a'),f.placement('b'))).toThrow();expect(f.save()).toBe(before);
 }
});

it('retains a removed reading definition and its nested closure, with exact cut Undo',()=>{
 const f=setup(),reading=f.content('hostnested');f.repo.commit('Retain reading',[{kind:'put-content',record:{...reading,definitionOwnerKey:f.content('doc').key}}]);
 const before=f.save(),empty=plainFragment('');paste(f,empty,'host',1,2);
 expect(alternativeSlots(f.content('host'))).toHaveLength(0);expect(alternativeSlots(f.content('hostnested'))).toHaveLength(1);expect(f.content('hostnestedb')).toBeTruthy();expect(()=>f.save()).not.toThrow();
 f.repo.undo();expect(f.save()).toBe(before);f.repo.redo();expect(f.content('hostnestedb')).toBeTruthy();
});
it('rebases host annotations across joined slots without changing reading coordinates',()=>{
 const a=host('a'),b=host('b');a.standoffProperties=[{id:'span-a',type:'style/bold',start:0,end:2}];b.standoffProperties=[{id:'span-b',type:'style/italics',start:0,end:2}];
 const f=setup([a,b]),reading=f.content('ba').payload.standoffProperties,before=f.save();f.commands.joinStandoff(f.placement('a'),f.placement('b'));
 expect(f.content('a').payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({id:'span-a',start:0,end:2}),expect.objectContaining({id:'span-b',start:3,end:5})]));expect(f.content('ba').payload.standoffProperties).toEqual(reading);
 f.repo.undo();expect(f.save()).toBe(before);
});
