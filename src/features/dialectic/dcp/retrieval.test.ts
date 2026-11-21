// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {workspaceFixture} from './workspace.fixture';
import {nativeDocumentSession} from '../../../persistence/native-session';
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();});
it('same-Symposium semantic candidates get fresh handles only after current native source resolution',async()=>{
 vi.stubGlobal('AbortSignal',{any:(signals:AbortSignal[])=>signals[0],timeout:()=>new AbortController().signal});
 const f=workspaceFixture();clean.push(()=>f.dispose());f.addHuman('A vessel can survive complete replacement.');const s=f.open(),native=nativeDocumentSession(f.editor);
 vi.spyOn(native,'isDirty').mockReturnValue(false);vi.spyOn(native,'knowledgeEvidence').mockReturnValue({location:{folder:'.',filename:'symposium.ink'},byteHash:'saved',pending:false} as any);
 const inventory=await s.tool({id:'inventory',tool:'list_text_blocks',arguments:{limit:10,cursor:null,contributionId:null,participantId:null,fromOrdinal:null}});const block=inventory.items[0];
 const data={results:[{text:'A vessel can survive complete replacement.',source:{resourceId:f.owner,sourceHash:'saved',spans:[{resourceId:f.owner,blockGuid:block.blockId,chunkStart:0,chunkEnd:42}]}},{text:'Foreign',source:{resourceId:'foreign',sourceHash:'saved',spans:[{resourceId:'foreign',blockGuid:block.blockId,chunkStart:0,chunkEnd:7}]}}]};
 const fetcher=vi.fn(async(_url:any,init:any)=>{expect(JSON.parse(init.body).resourceId).toBe(f.owner);return new Response(JSON.stringify({Success:true,Data:data}));});vi.stubGlobal('fetch',fetcher);
 const result=await s.tool({id:'semantic',tool:'search_symposium',arguments:{query:'identity continuity',limit:5}});expect(result.items).toHaveLength(1);const handle=result.items[0].handle;expect(s.handles.get(handle)?.resourceId).toBe(f.owner);expect((await s.tool({id:'read',tool:'read_source',arguments:{handle}})).text).toContain('vessel');
 const another=f.open();expect((await another.source(handle)).status).toBe('unauthorized');
});
it('unsaved Symposium stays on live native discovery and sends no embedding query',async()=>{
 const f=workspaceFixture();clean.push(()=>f.dispose());f.addHuman('An unsaved thought.');const native=nativeDocumentSession(f.editor);vi.spyOn(native,'isDirty').mockReturnValue(true);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const s=f.open();const result=await s.tool({id:'search',tool:'search_symposium',arguments:{query:'unsaved',limit:5}});expect(result.items).toHaveLength(1);expect(fetcher).not.toHaveBeenCalled();expect(result.semanticStatus).toContain('Unsaved');
});
