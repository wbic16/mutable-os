import {it,expect,vi} from 'vitest';
import {decodeBlockTree} from '../block-tree/codecs';
import {CanonicalRepository} from '../block-tree/repository';
import {TreeCommands} from '../block-tree/commands';
import {admitNative,captureNative,decodeNative,nativeText} from './native-resource';
import {inlineSlice,inlineText} from '../block-tree/inline-sequence';
import {resolveFeatureFlags} from '../configuration';
const bytes=(s:string)=>new TextEncoder().encode(s);
const source=(text='A😀é漢 tail')=>bytes(nativeText(captureNative(decodeBlockTree({id:'doc',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text,standoffProperties:[{type:'style/bold',start:1,end:4}]}]}).state,'doc')));
const setup=(compact=true)=>{const state=decodeBlockTree({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block'}]}).state,repo=new CanonicalRepository(state,{compactCanonicalText:compact}),bank=Object.values(state.contents).find(c=>c.payload.id==='bank')!.key;return {repo,bank};};
it('compact native admission and unmounted capture contain zero canonical Cells and preserve native bytes',()=>{
 const input=source(),{repo,bank}=setup();let publications=0;repo.subscribeChanges(()=>publications++);admitNative(repo,input,bank);
 expect(publications).toBe(1);const records=Object.values(repo.readState().contents);expect(records.filter(c=>c.viewType.endsWith('-cell'))).toHaveLength(0);
 expect(records.find(c=>c.payload.id==='p')?.compactInline?.version).toBe(1);
 const saved=nativeText(captureNative(repo.readState(),'doc'));expect(saved).toBe(new TextDecoder().decode(input));expect(nativeText(decodeNative(bytes(saved)))).toBe(saved);
});
it('compact text commits and Undo/Redo use existing history without snapshots or unrelated content reads',()=>{
 const {repo,bank}=setup();admitNative(repo,source(),bank);const c=Object.values(repo.readState().contents).find(c=>c.payload.id==='p')!,pk=[...repo.ownedPlacementKeys(c.key)][0],commands=new TreeCommands(repo,k=>k);
 const before=nativeText(captureNative(repo.readState(),'doc'));const snapshot=vi.spyOn(repo,'snapshot').mockImplementation(()=>{throw Error('full snapshot');});
 const state=repo.readState(),unrelated=Object.values(state.contents).find(c=>c.payload.id==='bank')!;let reads=0;const original=Object.getOwnPropertyDescriptor(unrelated,'payload')!;Object.defineProperty(unrelated,'payload',{configurable:true,get(){reads++;return original.value;}});
 let published=0;repo.subscribeChanges(change=>{published++;expect(change.inlineOwner).toBe(c.key);expect(change.previousContents.size).toBe(1);});
 commands.replaceInlineRange(pk,1,2,'XY');expect(inlineText(repo.readState().contents[c.key].compactInline!.spans)).toBe('AXYé漢 tail');repo.undo();repo.redo();expect(published).toBe(3);expect(reads).toBe(0);expect(snapshot).not.toHaveBeenCalled();Object.defineProperty(unrelated,'payload',original);snapshot.mockRestore();repo.undo();expect(nativeText(captureNative(repo.readState(),'doc'))).toBe(before);
});
it('flag defaults on and explicit opt-out retains legacy native admission',()=>{expect(resolveFeatureFlags({}).compactCanonicalText).toBe(true);const compact=resolveFeatureFlags({features:{compactCanonicalText:false}}).compactCanonicalText;expect(compact).toBe(false);const {repo,bank}=setup(compact);admitNative(repo,source(),bank);expect(Object.values(repo.readState().contents).some(c=>c.viewType==='text-cell')).toBe(true);});
it('rejects persistent enrollment before a compact session admits its first document',async()=>{
 const {createDurableHistorySource}=await import('../history/durable-browser'),{repo}=setup();
 await expect(createDurableHistorySource(repo,{folder:'.',filename:'history.ink'},{resourceId:'doc'})).rejects.toThrow('Persistent compact History enrollment is not yet qualified');
});
it('logical span slices use code points across object boundaries',()=>{const a:any=[{kind:'text',text:'ab😀'},{kind:'image',properties:{alt:'x'}},{kind:'text',text:'éz'}];expect(inlineText(inlineSlice(a,2,6))).toBe('😀\uFFFCé');expect(inlineText(inlineSlice(a,5,7))).toBe('́z');});
it('compact records retain explicit whole-record exact-history semantics and reject mixed preimages',async()=>{
 const {applyExactRecords}=await import('../history/apply-records'),{clone}=await import('../block-tree/clone');
 const {repo,bank}=setup();admitNative(repo,source(),bank);const c=Object.values(repo.readState().contents).find(c=>c.payload.id==='p')!,pk=[...repo.ownedPlacementKeys(c.key)][0],commands=new TreeCommands(repo,k=>k),before=clone(repo.readState());
 let event:any;repo.subscribeHistoryChanges(e=>event=e,e=>{throw e;});commands.replaceInlineRange(pk,1,2,'new');expect(event.contents).toHaveLength(1);expect(event.contents[0].kind).toBe('record-content');expect(event.placements).toHaveLength(0);
 applyExactRecords(before,event);expect(before.contents[c.key]).toEqual(repo.readState().contents[c.key]);
 expect(()=>applyExactRecords(before,event)).toThrow('preimage');
 const version=repo.readState().contents[c.key].inlineRevision;repo.undo();expect(repo.readState().contents[c.key].inlineRevision).toBeGreaterThan(version);repo.redo();expect(repo.readState().contents[c.key].inlineRevision).toBeGreaterThan(version+1);
 const bad={...clone(repo.readState().contents[c.key])};delete bad.compactInline;expect(()=>repo.commit('switch',[{kind:'put-content',record:bad}])).toThrow('fixed at admission');
});
it('unsupported Block modes select legacy at admission and preserve authored data',()=>{
 const state=decodeBlockTree({id:'doc',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'Code retained',mode:'code'}]}).state,input=bytes(nativeText(captureNative(state,'doc'))),{repo,bank}=setup();admitNative(repo,input,bank);
 expect(Object.values(repo.readState().contents).some(c=>c.viewType==='text-cell')).toBe(true);expect(nativeText(captureNative(repo.readState(),'doc'))).toBe(new TextDecoder().decode(input));
});
it('compact zero-width endpoint forms survive insert, split and join without normalization',()=>{
 const s=decodeBlockTree({id:'doc',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'abcd',standoffProperties:[{id:'point-a',type:'tei/milestone',isZeroWidth:true,start:2,end:2},{id:'point-b',type:'tei/milestone',isZeroWidth:true,start:2,end:1}]}]}).state;
 const {repo,bank}=setup();admitNative(repo,bytes(nativeText(captureNative(s,'doc'))),bank);const c=Object.values(repo.readState().contents).find(c=>c.payload.id==='p')!,pk=[...repo.ownedPlacementKeys(c.key)][0],commands=new TreeCommands(repo,k=>k);
 commands.replaceInlineRange(pk,1,1,'X');const right=commands.splitStandoff(pk,2);commands.joinStandoff(pk,right);
 const properties=repo.readState().contents[c.key].payload.standoffProperties as any[];expect(properties.map(p=>[p.start,p.end])).toEqual([[3,3],[3,2]]);
 const revision=repo.state.revision,before=nativeText(captureNative(repo.readState(),'doc'));expect(()=>commands.replaceInlineRange(pk,100,100,'bad')).toThrow();expect(repo.state.revision).toBe(revision);expect(nativeText(captureNative(repo.readState(),'doc'))).toBe(before);
});
it('provisional completion commits compact text and annotations together without canonical Cells',()=>{
 const {repo,bank}=setup();admitNative(repo,source('A name'),bank);const c=Object.values(repo.readState().contents).find(c=>c.payload.id==='p')!,pk=[...repo.ownedPlacementKeys(c.key)][0],commands=new TreeCommands(repo,k=>k),before=nativeText(captureNative(repo.readState(),'doc'));let count=0;repo.subscribeChanges(()=>count++);
 commands.completeProvisionalText(pk,c.inlineRevision,[{start:2,end:6,text:'Name'}],{start:2,end:6,value:'entity',name:'Name'});expect(count).toBe(1);expect(inlineText(repo.readState().contents[c.key].compactInline!.spans)).toBe('A Name');expect((repo.readState().contents[c.key].payload.standoffProperties as any[]).at(-1).value).toBe('entity');expect(Object.values(repo.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);repo.undo();expect(nativeText(captureNative(repo.readState(),'doc'))).toBe(before);
});
