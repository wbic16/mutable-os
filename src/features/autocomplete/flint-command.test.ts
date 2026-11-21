import {afterEach,expect,it,vi} from 'vitest';
import {flintCommand} from './flint-command';
import {invocation,type CompletionCandidate} from './model';
import {CompletionSession,type CompletionHost} from './session';

const source={nodeKey:'n',contentKey:'c',placementKey:'p',viewId:'v',version:0,start:0,end:0,literal:'',inline:true};
afterEach(()=>vi.useRealTimers());
it('recognizes Flint and its explicit Document parameter without treating malformed options as open',()=>{
 expect(flintCommand('flint')).toEqual({kind:'open'});
 expect(flintCommand('/Flint OPEN')).toEqual({kind:'open'});
 expect(flintCommand('flint open --doc')).toEqual({kind:'document',query:''});
 expect(flintCommand('flint open --doc Court of Milan')).toEqual({kind:'document',query:'Court of Milan'});
 expect(flintCommand('flint open --doc "Court of Milan"')).toEqual({kind:'document',query:'Court of Milan'});
 expect(flintCommand('flint open --doc "Court')).toEqual({kind:'document',query:'Court'});
 expect(flintCommand('flint open --doctor')).toEqual({kind:'incomplete'});
 expect(flintCommand('flint open --docx title')).toEqual({kind:'incomplete'});
 expect(flintCommand('flintstone')).toBeUndefined();
 const text='prose /flint open --doc Notes (draft) [Milan] @ court',cells=[...text];
 expect(invocation(cells.length,i=>cells[i])).toMatchObject({kind:'command',start:6,input:'flint open --doc Notes (draft) [Milan] @ court'});
});
function setup(){
 vi.useFakeTimers();let finish!:(rows:CompletionCandidate[])=>void;
 const load=vi.fn((_signal:AbortSignal)=>new Promise<CompletionCandidate[]>(resolve=>finish=resolve));
 const host:CompletionHost={historyScope:async()=>'',documentEntities:()=>[],documents:async()=>[],commands:()=>[{id:'flint.open',name:'flint open',reason:''}],valid:()=>true,commit:()=>{},reference:async()=>{},command:vi.fn(),dismiss:vi.fn(),commandArguments:query=>{const parsed=flintCommand(query);return parsed?.kind==='document'?{key:'documents',query:parsed.query,load}:undefined;}};
 const session=new CompletionSession(host,source,'command','flint open --doc');
 return {host,session,load,finish:(rows:CompletionCandidate[])=>finish(rows)};
}
it('loads one argument pool per invocation, filters the newest query and never falls back to plain open',async()=>{
 const f=setup();expect(f.load).not.toHaveBeenCalled();expect(f.session.state.rows).toEqual([]);
 await vi.advanceTimersByTimeAsync(151);expect(f.load).toHaveBeenCalledTimes(1);
 f.session.input('flint open --doc Milan');await vi.advanceTimersByTimeAsync(151);
 expect(f.load).toHaveBeenCalledTimes(1);expect(f.load.mock.calls[0][0].aborted).toBe(false);
 f.finish([{id:'milan',name:'Court of Milan',reason:'vault/milan.ink'},{id:'rome',name:'Rome',reason:'vault/rome.ink'}]);await vi.advanceTimersByTimeAsync(0);
 expect(f.session.state.rows.map(r=>r.id)).toEqual(['milan']);
 f.session.input('flint open --doc missing');await vi.advanceTimersByTimeAsync(151);expect(f.session.state.rows).toEqual([]);
 await f.session.choose();expect(f.host.command).not.toHaveBeenCalled();
 f.session.input('flint open --doc Rome');await vi.advanceTimersByTimeAsync(151);expect(f.session.state.rows.map(r=>r.id)).toEqual(['rome']);expect(f.load).toHaveBeenCalledTimes(1);
 f.session.dispose();expect(f.load.mock.calls[0][0].aborted).toBe(true);
});
it('cancels unpublished argument results when Scry closes',async()=>{
 const f=setup();await vi.advanceTimersByTimeAsync(151);f.session.close();f.finish([{id:'late',name:'Late',reason:''}]);await vi.advanceTimersByTimeAsync(0);
 expect(f.session.state.rows).toEqual([]);expect(f.host.command).not.toHaveBeenCalled();expect(f.load.mock.calls[0][0].aborted).toBe(true);
});
it('awaits navigation, prevents duplicate execution and retains errors for retry',async()=>{
 const f=setup();let fail!:(error:Error)=>void;vi.mocked(f.host.command).mockImplementation(()=>new Promise((_resolve,reject)=>fail=reject));
 f.session.input('flint open');const action=f.session.choose();expect(f.session.state.pending).toBe(true);await f.session.choose();expect(f.host.command).toHaveBeenCalledTimes(1);expect(f.host.dismiss).not.toHaveBeenCalled();
 fail(Error('Selected Document changed'));await action;expect(f.session.alive).toBe(true);expect(f.session.state.error).toBe('Error: Selected Document changed');expect(f.session.state.pending).toBe(false);f.session.dispose();
});
