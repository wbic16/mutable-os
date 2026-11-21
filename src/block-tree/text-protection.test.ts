// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {decodeBlockTree} from './codecs';
import {CanonicalRepository} from './repository';
import {TreeCommands} from './commands';
import {NativeTextProtection} from './text-protection';
const setup=()=>{
 const repository=new CanonicalRepository(decodeBlockTree({id:'doc',type:'document-block',children:[{id:'source',type:'standoff-editor-block',text:'Source text'},{id:'ordinary',type:'standoff-editor-block',text:'Editable'}]}).state),protection=new NativeTextProtection(repository),state=repository.readState();
 const root=state.placements[state.rootPlacementKey].contentKey,source=state.contents[root].children[0],ordinary=state.contents[root].children[1];
 const commands=new TreeCommands(repository,k=>state.placements[k]?k:undefined,k=>{if(protection.isProtected(state.placements[k]?.contentKey))throw Error('Base content is protected');});
 return {repository,protection,commands,state,root,source,ordinary};
};
it('protects canonical aliases and rejects mixed/structural writes atomically while annotations remain independent',()=>{
 const f=setup(),{commands:c,repository:r,protection:p,state:s,source}=f;
 const alias=c.transclude(source,{kind:'at',parentKey:s.rootPlacementKey,index:2});const release=p.protect(s.placements[source].contentKey);
 const revision=r.state.revision,notify=vi.fn(),stop=r.subscribeChanges(notify);
 expect(()=>c.replaceInlineRange(alias,0,1,'X')).toThrow(/protected/);
 expect(()=>c.replaceAcrossBlocks([{placementKey:source,start:0,end:1},{placementKey:f.ordinary,start:0,end:1}],'x')).toThrow(/protected/);
 expect(()=>c.structuralTransaction('Mixed',()=>{c.setPayloadField(alias,'standoffProperties',[{id:'mark',type:'style/bold',start:0,end:3}]);c.replaceInlineRange(alias,0,1,'X');})).toThrow(/protected/);
 expect(()=>r.commit('Delete canonical source',[{kind:'remove-content',key:s.placements[source].contentKey}])).toThrow(/protected/);
 expect(r.state.revision).toBe(revision);expect(notify).not.toHaveBeenCalled();
 c.setPayloadField(alias,'standoffProperties',[{id:'mark',type:'style/bold',start:0,end:3}]);
 const props=()=>s.contents[s.placements[source].contentKey].payload.standoffProperties as any[];
 c.editStandoffProperty(source,0,props()[0],{start:0,end:5});expect(props()[0].end).toBe(5);
 c.editStandoffProperty(alias,0,props()[0],'delete');expect(props()[0].isDeleted).toBe(true);r.undo();expect(props()[0].isDeleted).not.toBe(true);r.redo();expect(props()[0].isDeleted).toBe(true);
 release();c.replaceInlineRange(source,0,1,'X');stop();p.dispose();
});
it('keeps unrelated typing bounded with and without protected content',()=>{
 const f=setup(),{repository:r,protection:p,commands:c,state:s}=f,snapshot=vi.spyOn(r,'snapshot');
 const run=()=>{const start=performance.now();for(let i=0;i<100;i++){c.replaceInlineRange(f.ordinary,0,0,'x');c.replaceInlineRange(f.ordinary,0,1,'');}return performance.now()-start;};
 const baseline=run();p.protect(s.placements[f.source].contentKey);const indexed=p.diagnostics.indexed,before=p.diagnostics.checked,protectedMs=run();
 expect(snapshot).not.toHaveBeenCalled();expect(p.diagnostics.indexed).toBe(indexed);expect(p.diagnostics.checked-before).toBeLessThanOrEqual(600);console.log(JSON.stringify({protectionBenchmark:{edits:200,baselineMs:baseline,withProtectedSourceMs:protectedMs,indexedDuringTyping:0,snapshots:0}}));p.dispose();
});
