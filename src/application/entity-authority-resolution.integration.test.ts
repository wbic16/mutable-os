// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerApplicationViews} from './features';
import {registerStandaloneEntityService} from './entity-service';
import {ScopedEntities} from './scoped-entities';
import {createEntityAuthorityResolution} from './entity-authority-resolution';
import {authorityDetails,searchAuthority} from '../features/autocomplete/authorities';
import type {AuthorityRecord,EntityService} from '../feature-api/entities';
vi.mock('../features/autocomplete/authorities',()=>({authorityDetails:vi.fn(),searchAuthority:vi.fn()}));
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());vi.resetAllMocks();});
const record:AuthorityRecord={provider:'wikidata',id:'Q762',name:'Leonardo da Vinci',description:'Italian Renaissance artist and engineer',aliases:['Leonardo'],url:'https://www.wikidata.org/wiki/Q762',retrievedAt:'2026-11-16T00:00:00Z',typeIds:['Q5'],classifications:['human','artist']};
function fixture(authorityCache=true){
 const resourceId=crypto.randomUUID(),editor=new ReactiveEditor({id:resourceId,type:'document-block',children:[]},{features:{authorityCache,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});registerApplicationViews(editor);clean.push(()=>editor.dispose());
 const view=editor.createView('authority-test'),root=view.node(view.state.rootKey)!,scoped=new ScopedEntities(editor,root.key,resourceId);clean.push(()=>scoped.dispose());
 const definition=scoped.prepare({name:record.name,typename:'Person',description:record.description,aliases:[]},{actor:'ai',participantId:'agent'});scoped.commit({[definition.id]:definition},'Introduce local Entity');
 const canonical={id:crypto.randomUUID(),name:record.name,revision:1,aliases:[]},service={historyScope:vi.fn(async()=>'/vault'),scopeIdentity:vi.fn(async()=>'vault-id'),authorityLookup:vi.fn(async()=>canonical),create:vi.fn(),dispose:vi.fn()};
 clean.push(registerStandaloneEntityService(editor,()=>service as unknown as EntityService));
 let allowed=true;const resolver=createRoot(dispose=>{clean.push(dispose);return createEntityAuthorityResolution(editor,()=>root.key,()=>resourceId,()=>allowed);});
 vi.mocked(searchAuthority).mockResolvedValue([record]);vi.mocked(authorityDetails).mockResolvedValue(record);
 return {editor,scoped,definition,service,resolver,current:()=>scoped.registry()[definition.id],suspend:()=>{allowed=false;resolver.suspend();}};
}
it('records only a verified native association, supports Undo and reuses the live mapping offline across Documents',async()=>{
 const f=fixture();await f.resolver.resolve(f.current());
 expect(f.resolver.states()[f.definition.id].status).toBe('linked');expect(f.current().id).toBe(f.definition.id);expect(f.current().metadata.scopedEntity.entity.attributes.canonicalAssociation.entityId).toBe((await f.service.authorityLookup()).id);expect(f.service.create).not.toHaveBeenCalled();
 f.editor.repository.undo();expect(f.current().metadata.scopedEntity.entity.attributes?.canonicalAssociation).toBeUndefined();f.editor.repository.redo();
 vi.mocked(authorityDetails).mockRejectedValue(Error('offline'));vi.mocked(searchAuthority).mockClear();f.service.authorityLookup.mockResolvedValue({...(await f.service.authorityLookup()),name:'Renamed canonical Entity'});
 await f.resolver.resolve(f.current());expect(searchAuthority).not.toHaveBeenCalled();expect(f.resolver.states()[f.definition.id].canonical?.name).toBe('Renamed canonical Entity');
 const other=fixture();vi.mocked(authorityDetails).mockResolvedValue(record);await other.resolver.resolve(other.current());expect(other.resolver.states()[other.definition.id].status).toBe('linked');expect(other.service.create).not.toHaveBeenCalled();
});
it('keeps ambiguous identities local and refuses associations with deleted canonical targets',async()=>{
 const f=fixture(),revision=f.editor.repository.state.revision;vi.mocked(authorityDetails).mockResolvedValue({...record,typeIds:['Q515']});await f.resolver.resolve(f.current());expect(f.resolver.states()[f.definition.id].status).toBe('ambiguous');expect(f.editor.repository.state.revision).toBe(revision);expect(f.service.authorityLookup).not.toHaveBeenCalled();
 vi.mocked(authorityDetails).mockResolvedValue(record);f.service.authorityLookup.mockResolvedValue({...await f.service.authorityLookup(),deletedUtc:'2026-11-16'} as any);await f.resolver.resolve(f.current());expect(f.resolver.states()[f.definition.id].status).toBe('verified');expect(f.current().metadata.scopedEntity.entity.attributes?.canonicalAssociation).toBeUndefined();expect(f.service.create).not.toHaveBeenCalled();
});
it('rejects late metadata after a local edit or suspended admission',async()=>{
 const f=fixture();let finish!:(r:AuthorityRecord)=>void;vi.mocked(authorityDetails).mockImplementation(()=>new Promise(r=>finish=r));
 const resolving=f.resolver.resolve(f.current());await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 const edited=structuredClone(f.current());edited.metadata.scopedEntity.entity.description='A changed identity';f.scoped.commit({[edited.id]:edited},'Edit identity');const revision=f.editor.repository.state.revision;finish(record);await resolving;expect(f.editor.repository.state.revision).toBe(revision);expect(f.service.authorityLookup).not.toHaveBeenCalled();
 const pending=f.resolver.resolve(f.current());await Promise.resolve();f.suspend();finish(record);await pending;expect(f.editor.repository.state.revision).toBe(revision);
});
it('resolves a user-confirmed identity without external authorities or persistent mutations',async()=>{
 const f=fixture(),get=vi.fn(async()=>({id:'authentic',name:'Reviewed identity',revision:0,aliases:[]}));Object.assign(f.service,{get});
 const next=structuredClone(f.current());next.metadata.scopedEntity.identityAssociation={version:1,method:'user-confirmed',vaultId:'vault-id',entityId:'authentic'};f.scoped.commit({[next.id]:next});
 const revision=f.editor.repository.state.revision;await f.resolver.resolve(f.current());expect(f.resolver.states()[next.id]).toMatchObject({status:'linked',canonical:{id:'authentic'}});expect(searchAuthority).not.toHaveBeenCalled();expect(authorityDetails).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);expect(f.current().id).toBe(f.definition.id);
 f.service.scopeIdentity.mockResolvedValue('other-vault');await f.resolver.resolve(f.current());expect(f.resolver.states()[next.id].status).toBe('unavailable');
});
it('manual association works with authority lookup disabled and Undo clears the displayed mapping',async()=>{
 const f=fixture(false);Object.assign(f.service,{get:vi.fn(async()=>({id:'authentic',name:'Reviewed',revision:0,aliases:[]}))});
 const next=structuredClone(f.current());next.metadata.scopedEntity.identityAssociation={version:1,method:'user-confirmed',vaultId:'vault-id',entityId:'authentic'};f.scoped.commit({[next.id]:next});await f.resolver.resolve(f.current());expect(f.resolver.states()[next.id].status).toBe('linked');
 f.editor.repository.undo();f.resolver.observe([f.current()]);await vi.waitFor(()=>expect(f.resolver.states()[next.id].status).toBe('unresolved'));expect(searchAuthority).not.toHaveBeenCalled();expect(authorityDetails).not.toHaveBeenCalled();
});

it('recovers an exact database association without a local marker, authority lookup, dirtying or snapshots',async()=>{
 const f=fixture(false),link={method:'user-confirmed' as const,vaultId:'vault-id',vault:'.',sourceResourceId:f.scoped.resourceId,sourceEntityId:f.definition.id,entityId:'authentic',associationId:'link',revision:0};
 const lookup=vi.fn(async()=>({link,entity:{id:'authentic',name:'Bologna',revision:1,aliases:[]}}));Object.assign(f.service,{documentAssociation:lookup});
 const revision=f.editor.repository.state.revision,snapshot=vi.spyOn(f.editor.repository,'snapshot');await f.resolver.resolve(f.current());
 expect(f.resolver.states()[f.definition.id]).toMatchObject({status:'linked',databaseChecked:true,databaseLink:link,canonical:{id:'authentic'}});
 expect(f.current().metadata.scopedEntity.identityAssociation).toBeUndefined();expect(f.editor.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();expect(searchAuthority).not.toHaveBeenCalled();expect(authorityDetails).not.toHaveBeenCalled();
 expect(lookup).toHaveBeenCalledWith({resourceId:f.scoped.resourceId,entityId:f.definition.id},expect.any(AbortSignal));
});
it('does not publish late recovered associations and distinguishes failed lookup from no association',async()=>{
 const f=fixture(false);let finish!:(v:any)=>void;const lookup=vi.fn(()=>new Promise<any>(r=>finish=r));Object.assign(f.service,{documentAssociation:lookup});
 const pending=f.resolver.resolve(f.current());await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));f.suspend();finish({link:{sourceResourceId:f.scoped.resourceId,sourceEntityId:f.definition.id},entity:{id:'target'}});await pending;expect(f.resolver.states()[f.definition.id].status).not.toBe('linked');
 const other=fixture(false);Object.assign(other.service,{documentAssociation:vi.fn(async()=>{throw Error('Database unavailable');})});await other.resolver.resolve(other.current());expect(other.resolver.states()[other.definition.id]).toMatchObject({status:'unavailable',databaseChecked:false});
 Object.assign(other.service,{documentAssociation:vi.fn(async()=>({}))});await other.resolver.resolve(other.current());expect(other.resolver.states()[other.definition.id]).toMatchObject({status:'unresolved',databaseChecked:true});
});
it('reports a missing Cavern as an unavailable link check instead of an unhandled selection error',async()=>{
 const f=fixture(false);const unregister=registerStandaloneEntityService(f.editor,()=>{throw Error('Open a vault first');});clean.push(unregister);
 await expect(f.resolver.resolve(f.current())).resolves.toBeUndefined();expect(f.resolver.states()[f.definition.id]).toMatchObject({status:'unavailable',databaseChecked:false,message:expect.stringContaining('Open a vault first')});
});
