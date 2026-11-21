import {createEffect,createSignal,untrack} from 'solid-js';
import {parseConversationTitle,titleLimits} from './title-contract';
type Identity={id:string;firstId:string;title:string};
type Task=Identity&{text:string;phase:'queued'|'running'|'result';abort?:AbortController;result?:string};
/** Session-only utility work. Applying metadata waits until native response admission is idle. */
export function createConversationTitle(options:{enabled:()=>boolean;ready:()=>boolean;idle:()=>boolean;current:()=>Identity|undefined;generate:(text:string,signal:AbortSignal)=>Promise<string>;apply:(id:string,title:string)=>void}){
 const [task,setTask]=createSignal<Task>(),[notice,setNotice]=createSignal('');
 const attempted=new Set<string>();let alive=true;
 createEffect(()=>{
  const job=task(),current=options.current(),enabled=options.enabled(),ready=options.ready(),idle=options.idle();
  if(!job||!alive)return;
  if(!enabled||!current||current.id!==job.id||current.firstId!==job.firstId||current.title!==job.title){job.abort?.abort();setTask(undefined);return;}
  if(job.phase==='result'&&idle){setTask(undefined);untrack(()=>{try{options.apply(job.id,job.result!);}catch{setNotice('Automatic title could not be applied; your conversation is unchanged.');}});return;}
  if(job.phase!=='queued'||!ready||!idle)return;
  const abort=new AbortController(),running={...job,phase:'running' as const,abort};setTask(running);
  untrack(()=>void options.generate(job.text,abort.signal).then(value=>{
   if(alive&&task()===running&&!abort.signal.aborted)setTask({...running,phase:'result',result:parseConversationTitle({title:value})});
  }).catch(()=>{if(alive&&task()===running){setTask(undefined);setNotice('Automatic title unavailable. You can rename the conversation; its content is unchanged.');}}));
 });
 return {
  notice,pending:()=>task()?.phase==='running'||task()?.phase==='result',
  request(text:string){
   const current=options.current();if(!alive||!options.enabled()||!current||current.title&&current.title!=='New conversation'||!text.trim()||attempted.has(current.id))return;
   attempted.add(current.id);setNotice('');setTask({...current,text:text.slice(0,titleLimits.input),phase:'queued'});
  },
  dispose(){alive=false;task()?.abort?.abort();setTask(undefined);attempted.clear();},
 };
}
