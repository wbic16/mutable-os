import {afterEach,expect,it,vi} from 'vitest';
import {createRoot,createSignal} from 'solid-js';
import {createConversationTitle} from './conversation-title';
import {parseConversationTitle} from './title-contract';
const cleanup:Array<()=>void>=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
function setup(){
 const [current,setCurrent]=createSignal({id:'doc',firstId:'first',title:'New conversation'}),[idle,setIdle]=createSignal(true),[ready,setReady]=createSignal(true),[enabled,setEnabled]=createSignal(true);
 let resolve!:(title:string)=>void,reject!:(error:unknown)=>void;
 const generate=vi.fn((_text:string,_signal:AbortSignal)=>new Promise<string>((a,b)=>{resolve=a;reject=b;})),apply=vi.fn();
 const service=createRoot(dispose=>{cleanup.push(dispose);return createConversationTitle({current,idle,ready,enabled,generate,apply});});cleanup.push(()=>service.dispose());
 return {service,generate,apply,setCurrent,setIdle,setReady,setEnabled,resolve:(title:string)=>resolve(title),reject:()=>reject(Error('failed'))};
}
it('generates a bounded utility once and waits for native admission to be idle',async()=>{
 const f=setup();f.service.request('a'.repeat(5000));expect(f.generate).toHaveBeenCalledTimes(1);expect(f.generate.mock.calls[0][0]).toHaveLength(4000);
 f.setIdle(false);f.resolve('Historical interpretations');await Promise.resolve();expect(f.apply).not.toHaveBeenCalled();
 f.setIdle(true);expect(f.apply).toHaveBeenCalledWith('doc','Historical interpretations');f.service.request('again');expect(f.generate).toHaveBeenCalledTimes(1);
});
it.each(['rename','switch','undo','disable','dispose'])('rejects a late title after %s',async action=>{
 const f=setup();f.service.request('First contribution');const signal=f.generate.mock.calls[0][1];
 if(action==='rename')f.setCurrent({id:'doc',firstId:'first',title:'My own title'});
 if(action==='switch')f.setCurrent({id:'other',firstId:'other-first',title:'New conversation'});
 if(action==='undo')f.setCurrent({id:'doc',firstId:'new-first',title:'New conversation'});
 if(action==='disable')f.setEnabled(false);if(action==='dispose')f.service.dispose();
 expect(signal.aborted).toBe(true);f.resolve('Unwanted replacement');await Promise.resolve();expect(f.apply).not.toHaveBeenCalled();
});
it('waits for credentials and does not retry a failed utility automatically',async()=>{
 const f=setup();f.setReady(false);f.service.request('First');expect(f.generate).not.toHaveBeenCalled();f.setReady(true);expect(f.generate).toHaveBeenCalledTimes(1);
 f.reject();await vi.waitFor(()=>expect(f.service.notice()).toContain('unavailable'));f.service.request('First');expect(f.generate).toHaveBeenCalledTimes(1);expect(f.apply).not.toHaveBeenCalled();
});
it('preserves a user-chosen title and rejects malformed title results',()=>{
 const f=setup();f.setCurrent({id:'doc',firstId:'first',title:'Chosen title'});f.service.request('First');expect(f.generate).not.toHaveBeenCalled();
 for(const value of [{title:''},{title:'a\nb'},{title:'x'.repeat(121)},{title:'Title',commands:[]},null])expect(()=>parseConversationTitle(value)).toThrow();
});
