// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRoot, createComputed } from 'solid-js';
import { ReactiveEditor } from '../reactive-editor/editor';
import { convertTei } from '../interchange/tei/convert';
import { captureNative, nativeBytes, admitNative } from '../persistence/native-resource';
import { decodeBlockTree } from '../block-tree/codecs';
import { nativeDocumentSession } from '../persistence/native-session';
import { resourceOwner } from '../block-tree/resource-identity';
import type { JsonObject } from '../block-tree/types';
const cleanup: (()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
function setup() {
 const dto=convertTei('<TEI><text><p><persName ref="#missing">Alice</persName></p><p>Unrelated</p></text></TEI>').document;
 const editor=new ReactiveEditor({type:'workspace-block',id:'workspace',children:[dto,{type:'document-block',id:'unrelated',children:[{type:'standoff-editor-block',text:'z'.repeat(4000)}]}]});
 cleanup.push(()=>editor.dispose());const view=editor.createView();
 const node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&Array.isArray(n.payload.standoffProperties)&&n.payload.standoffProperties.length)!;
 return {editor,view,node,property:(node.payload.standoffProperties as JsonObject[])[0]};
}
it('resolves mounted semantic annotations and rebased ranges without repository enumeration',()=>{
 const {editor,view,node,property}=setup(),state=editor.repository.readState();
 const tables=new Set([state.contents,state.placements,editor.repository.state.contents,editor.repository.state.placements]);
 const values=Object.values;let scans=0;
 vi.spyOn(Object,'values').mockImplementation((table:any)=>{if(tables.has(table))scans++;return values(table);});
 const snapshot=vi.spyOn(editor.repository,'snapshot'),rebuild=vi.spyOn(editor.repository as any,'rebuildReferences'),project=vi.spyOn(view as any,'build');
 for(let i=0;i<100;i++)expect((editor.linkedAnnotations.resolve(property,node.contentKey).metadata as JsonObject)?.role).toBe('tei/person-name');
 editor.commands.replaceInlineRange(node.key,1,1,'x');editor.repository.undo();editor.repository.redo();
 for(let i=0;i<100;i++)expect((editor.linkedAnnotations.resolve(property,node.contentKey).metadata as JsonObject)?.role).toBe('tei/person-name');
 expect(scans).toBe(0);expect(snapshot).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();expect(project).not.toHaveBeenCalled();
});
it('observes shared definition edits and Undo without stale cached annotation values',()=>{
 const {editor,node,property}=setup();let resolved:JsonObject|undefined;
 createRoot(dispose=>{cleanup.push(dispose);createComputed(()=>{resolved=editor.linkedAnnotations.resolve(property,node.contentKey);});});
 expect((resolved?.metadata as JsonObject)?.role).toBe('tei/person-name');
 const owner=resourceOwner(editor.repository.readState(),node.contentKey)!;
 const definitions=owner.payload.linkedAnnotations as Record<string,JsonObject>,id=String(property.annotationId);
 editor.repository.commit('Edit shared value',[{kind:'put-content',record:{...owner,payload:{...owner.payload,linkedAnnotations:{...definitions,[id]:{...definitions[id],value:'Reviewed',metadata:{role:'reviewed-name'}}}}}}]);
 expect(resolved?.value).toBe('Reviewed');expect((resolved?.metadata as JsonObject)?.role).toBe('reviewed-name');
 editor.repository.undo();expect((resolved?.metadata as JsonObject)?.role).toBe('tei/person-name');expect(resolved?.value).toBeUndefined();
});
it('shares headless ownership evidence across annotation lookups while retaining identity ambiguity checks',()=>{
 const dto=convertTei('<TEI><p>'+Array.from({length:100},()=>'<persName ref="#missing">Name</persName>').join('')+'</p></TEI>').document;
 const state=decodeBlockTree(dto).state,values=Object.values;let scans=0;
 vi.spyOn(Object,'values').mockImplementation((table:any)=>{if(table===state.contents)scans++;return values(table);});
 const text=values(state.contents).find(c=>c.viewType==='standoff-editor-block')!;
 for(let i=0;i<100;i++)expect(resourceOwner(state,text.key)?.payload.id).toBe(dto.id);
 expect(scans).toBe(1);
 const root=resourceOwner(state,text.key)!;state.contents.duplicate={...root,key:'duplicate'};state.revision++;
 expect(()=>resourceOwner(state,text.key)).toThrow(/Ambiguous/);
});
it('admits one bulk operation with native validation, reversible history and preserved references',()=>{
 const dto=convertTei('<TEI><p><persName ref="#missing">Alice</persName></p></TEI>').document;
 const bytes=nativeBytes(captureNative(decodeBlockTree(dto).state,dto.id));
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]});cleanup.push(()=>editor.dispose());
 const bank=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='bank')!;
 const commit=vi.spyOn(editor.repository,'commit');admitNative(editor.repository,bytes,bank.key);
 expect(commit.mock.calls.at(-1)?.[1]).toHaveLength(1);expect(commit.mock.calls.at(-1)?.[1][0].kind).toBe('record-batch');
 expect(nativeBytes(captureNative(editor.repository.readState(),dto.id))).toEqual(bytes);
 editor.repository.undo();expect(editor.repository.readState().contents[bank.key].children).toHaveLength(0);
 editor.repository.redo();expect(nativeBytes(captureNative(editor.repository.readState(),dto.id))).toEqual(bytes);
});
it('keeps ambiguous resource identities unresolved and refreshes maintained evidence after identity edits and Undo',()=>{
 const definition={id:'shared',type:'tei/semantic',value:'First'};
 const editor=new ReactiveEditor({type:'workspace-block',id:'w',children:[
  {type:'document-block',id:'same',linkedAnnotations:{shared:definition},children:[{id:'text',type:'standoff-editor-block',text:'Alice',standoffProperties:[{id:'mention',type:'tei/semantic',annotationId:'shared',start:0,end:4}]}]},
  {type:'document-block',id:'same',children:[]},
 ]});cleanup.push(()=>editor.dispose());
 const state=editor.repository.readState(),text=Object.values(state.contents).find(c=>c.payload.id==='text')!,property=(text.payload.standoffProperties as JsonObject[])[0];
 let value:unknown;createRoot(dispose=>{cleanup.push(dispose);createComputed(()=>{value=editor.linkedAnnotations.resolve(property,text.key).value;});});
 expect(value).toBeUndefined();const other=Object.values(state.contents).find(c=>c.viewType==='document-block'&&!c.children.length)!;
 editor.repository.commit('Disambiguate identity',[{kind:'put-content',record:{...other,payload:{...other.payload,id:'different'}}}]);
 expect(value).toBe('First');editor.repository.undo();expect(value).toBeUndefined();
});

it('validates an unsaved candidate without cloning the unrelated workspace',()=>{
 const {editor,node}=setup(),state=editor.repository.readState(),owner=resourceOwner(state,node.contentKey)!;
 const id=String(owner.payload.id),before=nativeBytes(captureNative(state,id));
 const snapshot=vi.spyOn(editor.repository,'snapshot'),session=nativeDocumentSession(editor);
 session.trackCandidate(id);
 expect(snapshot).not.toHaveBeenCalled();expect(session.isCandidate(id)).toBe(true);expect(session.isDirty(id)).toBe(true);
 expect(nativeBytes(captureNative(editor.repository.readState(),id))).toEqual(before);
});

it('resolves the new owner after placement-only retargeting and Undo',()=>{
 const editor=new ReactiveEditor({type:'workspace-block',id:'w',children:['A','B'].map(id=>({
  type:'document-block',id,linkedAnnotations:{shared:{id:'shared',type:'tei/semantic',value:id}},
  children:[{type:'standoff-editor-block',id:'text-'+id,text:id,standoffProperties:[{id:'p-'+id,type:'tei/semantic',annotationId:'shared',start:0,end:0}]}],
 }))});cleanup.push(()=>editor.dispose());
 const state=editor.repository.readState(),a=Object.values(state.contents).find(c=>c.payload.id==='text-A')!,b=Object.values(state.contents).find(c=>c.payload.id==='text-B')!;
 const pa=state.placements[[...editor.repository.ownedPlacementKeys(a.key)][0]],pb=state.placements[[...editor.repository.ownedPlacementKeys(b.key)][0]];
 const property=(a.payload.standoffProperties as JsonObject[])[0];let value:unknown;
 createRoot(dispose=>{cleanup.push(dispose);createComputed(()=>{value=editor.linkedAnnotations.resolve(property,a.key).value;});});
 expect(value).toBe('A');
 editor.repository.commit('Swap owned edges',[{kind:'put-placement',record:{...pa,contentKey:b.key}},{kind:'put-placement',record:{...pb,contentKey:a.key}}]);
 expect(value).toBe('B');editor.repository.undo();expect(value).toBe('A');editor.repository.redo();expect(value).toBe('B');
});
