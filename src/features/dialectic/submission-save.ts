import {createSignal} from 'solid-js';
import {beforeSaveCapture} from '../../persistence/after-paint';

export const conversationFilename=(date=new Date())=>`Conversation on ${date.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}.ink`;

/** Commit-triggered, serial saves. No repository subscription or typing timer. */
export function createSubmissionSave(save:(id:string,name:string)=>Promise<boolean>,enabled:()=>boolean){
 const [states,setStates]=createSignal<Record<string,{pending:boolean;error:string}>>({});
 const jobs=new Map<string,string>();
 let running=false,alive=true;
 const update=(id:string,pending:boolean,error='')=>{if(alive)setStates(s=>({...s,[id]:{pending,error}}));};
 const drain=async()=>{
  if(running||!alive)return;running=true;
  try{while(alive&&jobs.size){
   await beforeSaveCapture();
   if(!alive)return;
   const [id,name]=jobs.entries().next().value!;jobs.delete(id);
   try{if(!await save(id,name))throw Error('Save was cancelled or could not start.');update(id,jobs.has(id));}
   catch(error){jobs.delete(id);update(id,false,`Contribution is in memory but could not be saved: ${error instanceof Error?error.message:String(error)}`);}
  }}finally{running=false;}
 };
 return {
  state:(id:string)=>states()[id],
  request(id:string){if(!alive||!enabled())return;jobs.set(id,conversationFilename());update(id,true);void drain();},
  dispose(){alive=false;jobs.clear();},
 };
}
