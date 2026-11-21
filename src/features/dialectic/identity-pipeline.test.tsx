// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {createSignal} from 'solid-js';
import {SemanticsWorkspace} from './semantics-view';
import {DialecticReferences} from './references';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {registerApplicationViews} from '../../application/features';
import {registerStandaloneEntityService} from '../../application/entity-service';
import {ScopedEntities} from '../../application/scoped-entities';
import {openSemanticServices} from '../../application/semantic-services';
import {IdentityPipeline} from './identity-pipeline';
import type {EntityAuthorityState} from '../../application/entity-authority-resolution';
import type {DialecticController} from './controller';
vi.mock('../../application/semantic-services',()=>({openSemanticServices:vi.fn()}));
const clean:(()=>void)[]=[];beforeEach(()=>{Element.prototype.scrollTo=vi.fn();});afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.innerHTML='';});
function fixture(invalidEnrichment=false,workspace=false){
 const resourceId=crypto.randomUUID(),editor=new ReactiveEditor({id:resourceId,type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'Draft'}]},{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,authorityCache:workspace}});registerApplicationViews(editor);clean.push(()=>editor.dispose());
 const view=editor.createView('pipeline-test'),root=view.node(view.state.rootKey)!,scoped=new ScopedEntities(editor,root.key,resourceId);clean.push(()=>scoped.dispose());
 const definition=scoped.prepare({name:workspace?'Bologna':'Leonardo',typename:workspace?'Place':'Person',description:workspace?'City visited by Michelangelo':'Artist',aliases:[]},{actor:'ai'});if(invalidEnrichment)definition.metadata.scopedEntity.entity.attributes={enrichment:{dates:[{type:'birth',startYear:2000,startMonth:13}]}} as any;scoped.commit({[definition.id]:definition});
 const reader={historyScope:vi.fn(async()=>'/vault'),scopeIdentity:vi.fn(async()=>'vault'),get:vi.fn(async()=>undefined),search:vi.fn(async()=>({candidates:[],diagnostics:[],complete:true,current:()=>{}})),dispose:vi.fn()};clean.push(registerStandaloneEntityService(editor,()=>reader as any));
 const preview={sourceFingerprint:'source',aliasSignature:'aliases',entity:null,association:null,claims:[],relationships:[],complete:true};
 const receipt={entity:{id:'authentic',name:'Leonardo',revision:0,aliases:[]},association:{guid:'association',entityGuid:'authentic',revision:0,sourceFingerprint:'source'}};
 const service={vaultGuid:'vault',execute:vi.fn(async(request:any)=>request.op==='identity-preview'?preview:receipt),dispose:vi.fn(),audit:{outcome:vi.fn()}};vi.mocked(openSemanticServices).mockResolvedValue(service as any);
 const [workspaceUi,setWorkspaceUi]=createSignal({section:'entities',search:'',sort:'name',selected:definition.id,detail:'details',graph:false});
 const refs=workspace?new DialecticReferences(editor,view,root.key):undefined;if(refs)clean.push(()=>refs.dispose());
 const [authorityStates,setAuthorityStates]=createSignal<Record<string,EntityAuthorityState>>({});
 const [authorityResolver,setAuthorityResolver]=createSignal({states:authorityStates,resolve:vi.fn(async()=>{})});
 const c={workspaceUi,setWorkspaceUi,inspection:()=>undefined,rows:()=>[],busy:()=>false,editor,root:()=>root,resourceId:()=>resourceId,semanticInventory:vi.fn(()=>refs?.workspaceInventory()??{definitions:[],properties:[]}),get authorityResolution(){return authorityResolver();}} as unknown as DialecticController;
 const host=document.body.appendChild(document.createElement('div')),close=vi.fn();clean.push(render(()=>workspace?<SemanticsWorkspace c={c} active/>:<IdentityPipeline c={c} entityId={definition.id} close={close}/>,host));
 const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('.pipeline-host button')].find(b=>b.textContent?.trim()===label)!;
 return {editor,view,root,scoped,definition,reader,service,c,button,close,setAuthorityStates,setAuthorityResolver,current:()=>scoped.registry()[definition.id]};
}
it('does no source reads, full snapshots, inventories, scans or network work for ordinary typing with a live Pipeline',async()=>{
 const f=fixture();await vi.waitFor(()=>expect(f.button('No Matching Identity')?.disabled).toBe(false));const reads=vi.spyOn(f.scoped,'registry'),snapshot=vi.spyOn(f.editor.repository,'snapshot'),allRegistryReads=vi.spyOn(ScopedEntities.prototype,'registry');const requests=f.service.execute.mock.calls.length,queries=f.reader.search.mock.calls.length,inventory=vi.mocked(f.c.semanticInventory).mock.calls.length;
 const values=Object.values;let scans=0;vi.spyOn(Object,'values').mockImplementation((o:any)=>{if(o===f.editor.repository.state.contents||o===f.editor.repository.state.placements)scans++;return values(o);});
 const text=Object.values(f.view.state.nodes).find(n=>n.payload.id==='text')!;for(let i=0;i<30;i++)f.editor.commands.replaceInlineRange(text.key,0,0,'x');
 expect(reads).not.toHaveBeenCalled();expect(allRegistryReads).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(scans).toBe(0);expect(f.service.execute.mock.calls.length).toBe(requests);expect(f.reader.search.mock.calls.length).toBe(queries);expect(vi.mocked(f.c.semanticInventory).mock.calls.length).toBe(inventory);
});
it('commits only association metadata locally, preserving identity and native Undo without a full snapshot',async()=>{
 const f=fixture();await vi.waitFor(()=>expect(f.button('No Matching Identity')?.disabled).toBe(false));f.button('No Matching Identity').click();await vi.waitFor(()=>expect(f.button('Confirm Import')?.disabled).toBe(false));const original=structuredClone(f.current()),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 f.button('Confirm Import').click();await vi.waitFor(()=>expect(f.button('Done')).toBeTruthy());expect(snapshot).not.toHaveBeenCalled();expect(f.current().metadata.scopedEntity.entity).toEqual(original.metadata.scopedEntity.entity);expect(f.current().metadata.scopedEntity.identityAssociation).toMatchObject({entityId:'authentic',method:'user-confirmed'});
 f.editor.repository.undo();expect(f.current().metadata.scopedEntity.identityAssociation).toBeUndefined();f.editor.repository.redo();expect(f.current().metadata.scopedEntity.identityAssociation.entityId).toBe('authentic');expect(f.service.execute.mock.calls.filter(([r])=>r.op==='identity-commit')).toHaveLength(1);
});
it('blocks a commit after the source identity changes and keeps the old selection visible for review',async()=>{
 const f=fixture();await vi.waitFor(()=>expect(f.button('No Matching Identity')?.disabled).toBe(false));f.button('No Matching Identity').click();await vi.waitFor(()=>expect(f.button('Confirm Import')?.disabled).toBe(false));
 const next=structuredClone(f.current());next.metadata.scopedEntity.entity.name='Another person';f.scoped.commit({[next.id]:next});expect(document.querySelector('.pipeline-source-error')?.textContent).toContain('Source Entity changed');expect(f.button('Confirm Import')).toBeUndefined();expect(f.service.execute.mock.calls.filter(([r])=>r.op==='identity-commit')).toHaveLength(0);
});
it('shows unsupported source data as a closable error without crashing the originating workspace',async()=>{
 const f=fixture(true);expect(document.querySelector('.pipeline-host')?.textContent).toContain('Invalid date month');f.button('Close').click();expect(f.close).toHaveBeenCalledOnce();expect(f.service.execute).not.toHaveBeenCalled();
});

it('opens the full Pipeline from Bologna details with authority tools enabled, then reconciles without text selection',async()=>{
 const f=fixture(false,true),overlay=vi.spyOn(f.editor.overlays,'open');
 const details=document.querySelector('.semantics-detail')!;
 expect(details.textContent).not.toContain('Review authority identity…');
 expect(details.textContent!.indexOf('Resolve Entity Identity…')).toBeLessThan(details.textContent!.indexOf('Key information'));
 const canonical={id:'bologna-sql',name:'Bologna',typename:'Place',description:'Existing SQL description',revision:2,aliases:[]};
 f.reader.get.mockResolvedValue(canonical as any);
 f.reader.search.mockResolvedValue({candidates:[{id:canonical.id,name:canonical.name,evidence:[]}],diagnostics:[],complete:true,current:()=>{}} as any);
 f.service.execute.mockImplementation(async(request:any)=>request.op==='identity-preview'?{sourceFingerprint:'source',aliasSignature:'aliases',entity:canonical,association:null,claims:[],relationships:[],complete:true}:{entity:{...canonical,description:f.definition.metadata.scopedEntity.entity.description},association:{guid:'association',entityGuid:canonical.id,revision:0,sourceFingerprint:'source'}} as any);
 [...details.querySelectorAll('button')].find(b=>b.textContent==='Resolve Entity Identity…')!.click();
 await vi.waitFor(()=>expect(document.querySelectorAll('.pipeline-pipe:not([hidden])')).toHaveLength(3));
 const input=document.querySelector<HTMLInputElement>('[aria-label="Search authentic Entities"]')!;
 input.value='Bolog';input.dispatchEvent(new Event('input',{bubbles:true}));
 input.value='Bologna';input.dispatchEvent(new Event('input',{bubbles:true}));
 await vi.waitFor(()=>expect(document.querySelector('.pipeline-search-results button')).toBeTruthy());
 (document.querySelector('.pipeline-search-results button') as HTMLButtonElement).click();
 await vi.waitFor(()=>expect(f.button('Use Selected Identity')?.disabled).toBe(false));f.button('Use Selected Identity').click();
 await vi.waitFor(()=>expect(f.button('Same Identity')?.disabled).toBe(false));f.button('Same Identity').click();
 await vi.waitFor(()=>expect(f.button('Confirm Reconciliation')?.disabled).toBe(false));
 const description=[...document.querySelectorAll<HTMLLabelElement>('.pipeline-pipe-active label')].find(e=>e.textContent?.startsWith('Description'))!.querySelector('select')!;
 description.value='import';description.dispatchEvent(new Event('change',{bubbles:true}));
 expect(f.service.execute.mock.calls.filter(([r])=>r.op==='identity-commit')).toHaveLength(0);
 f.button('Confirm Reconciliation').click();await vi.waitFor(()=>expect(f.button('Done')).toBeTruthy());
 expect(f.service.execute.mock.calls.filter(([r])=>r.op==='identity-commit').map(([r])=>r)).toEqual([expect.objectContaining({targetId:canonical.id,source:expect.objectContaining({entityId:f.definition.id,name:'Bologna'}),choices:expect.objectContaining({description:'import'}),confirmation:true})]);
 expect(f.current().metadata.scopedEntity.identityAssociation.entityId).toBe(canonical.id);
 expect(details.querySelector('[aria-label="Database identity link"]')?.textContent).toContain('Linked to database Entity');
 expect(document.querySelector('.semantics-identity-badge')?.textContent).toBe('Linked to database');
 expect(overlay).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Link Entity Reference"]')).toBeNull();
});

it('revalidates the displayed link before opening Cardex and reports unavailable targets in place',async()=>{
 const f=fixture(false,true),next=structuredClone(f.current());next.metadata.scopedEntity.identityAssociation={method:'user-confirmed',entityId:'bologna-sql',vaultId:'vault',vault:'/vault'};f.scoped.commit({[next.id]:next});
 const execute=vi.spyOn(f.editor.commandRegistry,'execute').mockResolvedValue(undefined),open=()=>[...document.querySelectorAll<HTMLButtonElement>('.semantics-detail button')].find(b=>b.textContent==='Open linked Entity')!;
 f.setAuthorityStates({[next.id]:{status:'unavailable',message:'The reviewed authentic Entity is unavailable'}});open().click();await vi.waitFor(()=>expect(document.querySelector('.semantics-identity-status [role="alert"]')?.textContent).toContain('unavailable'));expect(execute).not.toHaveBeenCalled();
 f.setAuthorityStates({[next.id]:{status:'linked',canonical:{id:'bologna-sql',name:'Bologna',revision:0,aliases:[]}}});open().click();await vi.waitFor(()=>expect(execute).toHaveBeenCalledWith('cardex.entity.open',{targetKey:f.root.key,args:{id:'bologna-sql',vault:'/vault'}}));
 expect(f.c.authorityResolution.resolve).toHaveBeenCalledTimes(3);
 const inventory=vi.mocked(f.c.semanticInventory).mock.calls.length,reads=vi.spyOn(ScopedEntities.prototype,'registry'),snapshot=vi.spyOn(f.editor.repository,'snapshot'),requests=f.reader.get.mock.calls.length;
 const text=Object.values(f.view.state.nodes).find(n=>n.payload.id==='text')!;for(let i=0;i<30;i++)f.editor.commands.replaceInlineRange(text.key,0,0,'x');
 expect(reads).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(vi.mocked(f.c.semanticInventory).mock.calls.length).toBe(inventory);expect(f.reader.get.mock.calls.length).toBe(requests);
 for(let i=0;i<30;i++)f.editor.repository.undo();
 f.editor.repository.undo();expect(document.querySelector('.semantics-detail')?.textContent).toContain('Database link has not yet been checked.');expect(document.querySelector('.semantics-identity-badge')).toBeNull();
});

it('a retained Semantics panel reads the current Conversation resolver instead of capturing an earlier runtime',()=>{
 const f=fixture(false,true),next=structuredClone(f.current());next.metadata.scopedEntity.identityAssociation={method:'user-confirmed',entityId:'bologna-sql',vaultId:'vault'};f.scoped.commit({[next.id]:next});
 const panel=document.querySelector('.semantics-detail');
 f.setAuthorityStates({[next.id]:{status:'linked',canonical:{id:'bologna-sql',name:'Earlier runtime name',revision:0,aliases:[]}}});expect(panel?.textContent).toContain('Earlier runtime name');
 f.setAuthorityResolver({states:()=>({[next.id]:{status:'linked',canonical:{id:'bologna-sql',name:'Current runtime Bologna',revision:1,aliases:[]}}}),resolve:vi.fn(async()=>{})});
 expect(document.querySelector('.semantics-detail')).toBe(panel);expect(panel?.textContent).toContain('Current runtime Bologna');expect(panel?.textContent).not.toContain('Earlier runtime name');
});
