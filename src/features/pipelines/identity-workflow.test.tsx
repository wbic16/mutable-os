// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import {createIdentityWorkflow,identityKeys,ReconcileController} from './identity-workflow';
import {EntitySearchController,createEntitySearchPipe,type VaultEntityReference} from './entity-search';
import {PipelineCarousel} from './carousel';
import {PipelineRun,dataKey,occurrence,type PipeController} from './runtime';
import type {IdentitySource,IdentityPreview,IdentityReceipt,IdentityCommit} from './identity-service';
beforeEach(()=>{Element.prototype.scrollTo=vi.fn();});
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());document.body.innerHTML='';});
const source:IdentitySource={resourceId:'document',entityId:'local',revision:0,name:'Leonardo',typename:'Person',description:'Artist',aliases:['Leo'],enrichment:{subtypes:['Artist']},provenance:null};
function fixture(){
 const canonical={id:'canonical',revision:1,name:'Leonardo da Vinci',typename:'Person',description:'Curated',aliases:[]};
 let preview:IdentityPreview={sourceFingerprint:'fingerprint',association:null,entity:canonical as any,aliasSignature:'aliases',claims:[],relationships:[],complete:true};
 const receipt:IdentityReceipt={entity:canonical,association:{guid:'association',entityGuid:canonical.id,revision:0,sourceFingerprint:'fingerprint',sourceResourceGuid:source.resourceId,sourceEntityGuid:source.entityId}};
 const reader={get:vi.fn(async()=>canonical),search:vi.fn(async()=>({candidates:[{id:canonical.id,name:canonical.name,evidence:[]}],diagnostics:[],complete:true,current:()=>{}}))};
 const service={vaultId:'vault',preview:vi.fn(async()=>preview),commit:vi.fn(async(_request:IdentityCommit,_signal?:AbortSignal)=>receipt),outcome:vi.fn(async(_operationId:string)=>({status:'committed' as const,result:receipt}))};
 const context={service,search:reader,check:vi.fn(),unsupported:['Document Claim requires semantic conversion.'],linked:vi.fn()};
 const workflow=createRoot(dispose=>{clean.push(dispose);return createIdentityWorkflow(source,context);});clean.push(()=>workflow.run.dispose());
 return {...workflow,reader,service,context,receipt,setPreview:(p:Partial<IdentityPreview>)=>{preview={...preview,...p};}};
}
const ready=async(run:PipelineRun,id=run.active())=>vi.waitFor(()=>expect(run.info(id).status).not.toBe('busy'));
async function compare(f:ReturnType<typeof fixture>){await ready(f.run);await f.run.controller<EntitySearchController>('search')!.select('canonical');await f.run.execute('select');await ready(f.run);expect(f.run.active()).toBe('compare');}
async function review(f:ReturnType<typeof fixture>){await compare(f);await f.run.execute('confirm');await ready(f.run);expect(f.run.active()).toBe('reconcile');}
it('runs the matched route read-only until final confirmation, then publishes an audited receipt',async()=>{
 const f=fixture();await review(f);expect(f.service.commit).not.toHaveBeenCalled();expect(f.context.linked).not.toHaveBeenCalled();expect(f.run.value(identityKeys.source)?.entityId).toBe('local');
 await f.run.execute('commit');expect(f.run.state()).toBe('completed');expect(f.service.commit).toHaveBeenCalledTimes(1);expect(f.context.linked).toHaveBeenCalledWith(f.receipt);expect(f.run.value(identityKeys.receipt)).toEqual(f.receipt);
});
it('makes no-match a normal branch and creates a fresh canonical identity; cancellation writes nothing',async()=>{
 const cancelled=fixture();await ready(cancelled.run);cancelled.run.cancel();expect(cancelled.service.commit).not.toHaveBeenCalled();
 const f=fixture();f.setPreview({entity:null});await ready(f.run);await f.run.execute('none');await ready(f.run);expect(f.run.path().map(p=>p.id)).toEqual(['search','import']);await f.run.execute('commit');expect(f.run.state()).toBe('completed');expect(f.service.commit.mock.calls[0][0]).toMatchObject({expectedTargetRevision:null,source:{entityId:'local'}});expect((f.service.commit.mock.calls[0] as any)[0].targetId).not.toBe('local');
});
it('retains mounted panel DOM, queries, selections, scroll and local choices across navigation and expansion',async()=>{
 const f=fixture(),host=document.createElement('div');document.body.append(host);clean.push(render(()=><PipelineCarousel {...f} close={()=>{}}/>,host));
 await review(f);const search=f.run.controller<EntitySearchController>('search')!,reviewer=f.run.controller<ReconcileController>('reconcile')!;reviewer.choose('description','both');
 const bodies=host.querySelectorAll('.pipeline-body'),searchInput=host.querySelector('input')!,body=bodies[0];body.scrollTop=47;
 f.run.navigate('search');expect(search.query()).toBe('Leonardo');expect(search.selected()?.id).toBe('canonical');expect(host.querySelector('input')).toBe(searchInput);expect(body.scrollTop).toBe(47);
 f.run.navigate('reconcile');expect(reviewer.choices().description).toBe('both');const expand=host.querySelector('.pipeline-pipe-active [aria-label="Expand Pipe"]') as HTMLButtonElement;expand.click();expect(host.querySelector('.pipeline-carousel')?.classList.contains('pipeline-expanded')).toBe(true);
 f.run.navigate('search');expect(host.querySelector('.pipeline-carousel')?.classList.contains('pipeline-expanded')).toBe(false);expect(host.querySelector('input')).toBe(searchInput);
 search.input('Michelangelo');expect(f.run.value(identityKeys.entity)).toBeUndefined();expect(f.run.info('reconcile').stale).toBe(true);expect(f.run.actions('reconcile')).toEqual([]);
});
it('requires a new identity comparison when canonical values change before reconciliation',async()=>{
 const f=fixture();await compare(f);await f.run.execute('confirm');await ready(f.run);f.setPreview({aliasSignature:'different'});await f.run.execute('refresh');await ready(f.run);expect(f.run.info('reconcile').error).toMatch(/comparison changed/);expect(f.run.actions().find(a=>a.id==='commit')?.enabled).toBe(false);expect(f.service.commit).not.toHaveBeenCalled();
});
it('recovers a lost response using its operation receipt without dispatching a second commit',async()=>{
 const f=fixture();await review(f);f.service.commit.mockRejectedValueOnce(Error('Connection lost'));await f.run.execute('commit');expect(f.run.guard()).toMatch(/recovery/);expect(f.run.cancel()).toBe(false);expect(f.run.navigate('search')).toBe(false);
 await f.run.execute('recover');expect(f.run.state()).toBe('completed');expect(f.service.commit).toHaveBeenCalledTimes(1);expect(f.service.outcome).toHaveBeenCalledWith((f.service.commit.mock.calls[0] as any)[0].operationId);
});
it('keeps a known database commit recoverable after Document failure and permits explicit acknowledgement',async()=>{
 const f=fixture();await review(f);f.context.linked.mockImplementation(()=>{throw Error('Document closed');});await f.run.execute('commit');expect(f.run.guard()).toBeTruthy();expect(f.run.actions().map(a=>a.id)).toEqual(['recover','acknowledge']);await f.run.execute('acknowledge');expect(f.run.state()).toBe('completed');expect(f.service.commit).toHaveBeenCalledTimes(1);
});
it('the unchanged ESS definition also binds only a query in a selected-text consumer',async()=>{
 const f=fixture(),textRange=dataKey('selectedTextRange',v=>v as {documentId:string;nodeKey:string;start:number;end:number;version:number}),selected=dataKey<VaultEntityReference>('chosen',v=>v as VaultEntityReference);let consumed:any;
 const reference={id:'reference',title:'Reference',create(input:any):PipeController<any,{}>{consumed=input;return {status:()=> 'ready',actions:()=>[],update:()=>{},execute:()=>({})};}};
 const run=createRoot(dispose=>{clean.push(dispose);return new PipelineRun({id:'reference-text',version:1,title:'Reference selected text',start:'ess',pipes:[occurrence(createEntitySearchPipe(f.reader,'vault'),{id:'ess',label:'Find',requires:{query:identityKeys.query},produces:{entity:selected}}),occurrence(reference,{id:'reference',label:'Review reference',requires:{range:textRange,entity:selected},produces:{}})],connectors:[{from:'ess',outcome:'selected',to:'reference'}]},[{key:identityKeys.query,value:'Leonardo'},{key:textRange,value:{documentId:'other-document',nodeKey:'text',start:2,end:10,version:7}}]);});clean.push(()=>run.dispose());
 await ready(run);await run.controller<EntitySearchController>('ess')!.select('canonical');await run.execute('select');expect(consumed).toMatchObject({range:{documentId:'other-document',start:2,version:7},entity:{entityId:'canonical',vaultId:'vault'}});expect(Object.keys(run.definition.pipes[0].requires)).toEqual(['query']);
});
it('previews supplied images without importing them or coupling the Pipe to an editor',async()=>{
 const f=fixture(),release=vi.fn();Object.assign(f.context,{bindImage:vi.fn((_e:any,publish:(s:string)=>void)=>{publish('data:image/png;base64,AA==');return release;})});const host=document.createElement('div');document.body.append(host);const stop=render(()=><PipelineCarousel {...f} close={()=>{}}/>,host);clean.push(stop);
 await compare(f);expect(host.querySelectorAll('.pipeline-compare img')).toHaveLength(2);expect(f.service.commit).not.toHaveBeenCalled();stop();expect(release).toHaveBeenCalledTimes(2);
});
it('a confirmed non-commit releases the recovery barrier and requires a fresh explicit confirmation',async()=>{
 const f=fixture();await review(f);f.service.commit.mockRejectedValueOnce(Error('request lost'));f.service.outcome.mockResolvedValueOnce({status:'not-committed'} as any);await f.run.execute('commit');await f.run.execute('recover');expect(f.run.guard()).toBeUndefined();expect(f.run.state()).toBe('running');expect(f.service.commit).toHaveBeenCalledTimes(1);await f.run.execute('commit');expect(f.service.commit).toHaveBeenCalledTimes(2);expect(f.service.commit.mock.calls[0][0].operationId).not.toBe(f.service.commit.mock.calls[1][0].operationId);
});
