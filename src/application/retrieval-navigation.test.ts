import {it,expect,vi,afterEach} from 'vitest';
import {VaultKnowledge} from './vault-knowledge';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('delegates exact source coordinates to verified native Open/reveal and refuses dirty live targets',async()=>{
 let dirty=false;const native:any={isDirty:()=>dirty,knowledgeEvidence:()=>({location:{folder:'.',filename:'study.ink'},byteHash:'hash',pending:false})};
 const host:any={guard:()=>{},activateSaved:vi.fn(async(_target,_passage,_evidence,current)=>{expect(current()).toBe(true);})};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:true,Data:{currency:'verified-saved-projection'}}))));
 const k=new VaultKnowledge({} as any,native,host),hit={stamp:'stamp',text:'A😀 continuity',source:{vaultGuid:'v',resourceId:'r',rootBlockId:'root',sourceHash:'hash',extractionProfile:'mutable-saved-sql-v3:'+JSON.stringify({version:1,opaqueTypes:[]}),path:'study.ink',spans:[{resourceId:'r',blockGuid:'b',start:4,end:16,coordinate:'cell',chunkStart:0,chunkEnd:14}]}};
 await k.activateRetrieval(hit,()=>true);expect(host.activateSaved).toHaveBeenCalledWith(expect.objectContaining({documentId:'r',blockId:'root'}),{blockId:'b',start:4,end:16,coordinate:'cell'},expect.objectContaining({byteHash:'hash',policy:JSON.stringify({version:1,opaqueTypes:[]}),location:{folder:'.',filename:'study.ink'}}),expect.any(Function),'A😀 continuity');
 dirty=true;await expect(k.activateRetrieval(hit,()=>true)).rejects.toThrow();expect(host.activateSaved).toHaveBeenCalledTimes(1);
});
