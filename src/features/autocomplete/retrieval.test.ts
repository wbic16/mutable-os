import {it,expect,vi,afterEach} from 'vitest';
import {CompletionSession,type CompletionHost} from './session';
const source={nodeKey:'n',contentKey:'c',placementKey:'p',viewId:'v',version:0,start:0,end:0,literal:'',inline:false};
afterEach(()=>vi.useRealTimers());
it('publishes lexical first, delays embeddings, preserves selected identity, and rejects obsolete results',async()=>{
 vi.useFakeTimers();let finish:(v:any)=>void=()=>{};const calls:any[]=[];
 const host:CompletionHost={historyScope:async()=>'',documentEntities:()=>[],documents:async()=>[],commands:()=>[],valid:()=>true,commit:()=>{},reference:async()=>{},command:()=>{},dismiss:()=>{},passages:async(query,strategy,signal)=>{calls.push({query,strategy,signal});if(strategy==='lexical')return {rows:[{id:'lex',name:'Lexical',reason:''}],status:'Saved coverage'};return new Promise(r=>{finish=r;});}};
 const session=new CompletionSession(host,source,'block','gravity');await vi.advanceTimersByTimeAsync(151);expect(session.state.rows.map(r=>r.id)).toEqual(['lex']);expect(calls).toHaveLength(1);session.select('lex');
 await vi.advanceTimersByTimeAsync(450);expect(calls).toHaveLength(2);finish({rows:[{id:'sem',name:'Related',reason:''},{id:'lex',name:'Duplicate',reason:''}],status:'Partial semantic coverage'});await vi.advanceTimersByTimeAsync(0);expect(session.state.rows.map(r=>r.id)).toEqual(['lex','sem']);expect(session.state.selected).toBe('lex');
 session.input('old');await vi.advanceTimersByTimeAsync(601);const old=finish;session.input('new');expect(calls.at(-1).signal.aborted).toBe(true);old({rows:[{id:'obsolete',name:'Old',reason:''}],status:''});await vi.advanceTimersByTimeAsync(151);expect(session.state.rows.some(r=>r.id==='obsolete')).toBe(false);session.dispose();
});
it('query refusal leaves lexical results and does not affect ordinary Entity modes',async()=>{
 vi.useFakeTimers();const host:any={historyScope:async()=>'',documentEntities:()=>[],documents:async()=>[],commands:()=>[],valid:()=>true,dismiss:()=>{},passages:vi.fn(async(_q:string,s:string)=>{if(s==='hybrid')throw Error('Query authorisation required');return {rows:[{id:'one',name:'Result',reason:''}],status:'Saved'};})};
 const s=new CompletionSession(host,source,'block','query');await vi.advanceTimersByTimeAsync(601);expect(s.state.rows).toHaveLength(1);expect(s.state.retrievalStatus).toContain('Lexical results retained');s.dispose();const e=new CompletionSession(host,source,'entity','name');await vi.advanceTimersByTimeAsync(1000);expect(host.passages).toHaveBeenCalledTimes(2);e.dispose();
});
