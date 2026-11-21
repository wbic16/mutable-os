import {createSignal} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {BlockNode} from '../../block-tree/types';
import type {DialecticProviderSession} from './dcp/live';
import {attachments,attachmentLimits,attachmentSize,attachmentProviderProblem,type Attachment} from './attachments-contract';
interface SelectedFile {name:string;size:number}
interface UploadFailure {session:unknown;draft:string;files:SelectedFile[];message:string}

/** No repository subscription or derived file inventory: work starts at Attach. */
export function createAttachments(editor:ReactiveEditor,providers:DialecticProviderSession,host:{draft():BlockNode|undefined;session():unknown;guard():void;notice(message:string):void;provider?():'openai'|'anthropic'|undefined}){
 const [pending,setPending]=createSignal(''),[confirmation,setConfirmation]=createSignal<{files:SelectedFile[];bytes:number}>(),[lastFailure,setFailure]=createSignal<UploadFailure>();
 let controller:AbortController|undefined,decision:((value:boolean)=>void)|undefined,alive=true;
 const answer=(value:boolean)=>{const resolve=decision;decision=undefined;setConfirmation(undefined);resolve?.(value);};
 const cancel=()=>{controller?.abort();answer(false);};
 const failure=()=>{const f=lastFailure();return f&&f.session===host.session()&&f.draft===host.draft()?.key?f:undefined;};
 const list=(node:BlockNode|undefined)=>attachments((node?.payload.metadata as any)?.dialectic?.attachments);
 const write=(node:BlockNode,values:Attachment[])=>{
  const metadata=structuredClone(unwrap(node.payload.metadata)) as any;
  editor.commands.boundedStructuralTransaction('Change contribution attachments',()=>editor.commands.setPayloadField(node.key,'metadata',{...metadata,dialectic:{...metadata.dialectic,attachments:attachments(values)}}));
 };
 const attach=async(files:File[])=>{
  if(controller||!files.length)return;
  const abort=controller=new AbortController(),session=host.session();let node:BlockNode|undefined;
  const selected=files.map(f=>({name:f.name,size:f.size}));setFailure(undefined);
  try{
   host.guard();if(!editor.features.dialecticAttachments)throw Error('Attachments disabled');
   node=host.draft();if(!node)throw Error('Create a draft contribution first');
   const selectedProvider=host.provider?.(),scope={...editor.readAssetContext()},baseline=list(node),revision=editor.repository.readState().contents[node.contentKey].revision;
   if(!scope.cavernId||!scope.session)throw Error('Open a Vault before attaching files');
   if(files.length+baseline.length>attachmentLimits.count)throw Error(`This would attach ${files.length+baseline.length} files. The limit is eight per contribution.`);
   for(const file of files){
    if(!file.size)throw Error(`${file.name} is empty (0 bytes). Choose a file containing data.`);
    if(file.size>attachmentLimits.fileBytes)throw Error(`${file.name} is ${attachmentSize(file.size)}; the provisional per-file limit is 100 MB.`);
   }
   const bytes=files.reduce((n,f)=>n+f.size,0),total=bytes+baseline.reduce((n,a)=>n+a.byteLength,0);
   if(total>attachmentLimits.totalBytes)throw Error(`This selection totals ${attachmentSize(total)} including existing attachments. The provisional combined limit is 100 MB.`);
   if(selectedProvider){const problem=attachmentProviderProblem(selectedProvider,[...baseline,...files.map(f=>({mediaType:/\.pdf$/i.test(f.name)?'application/pdf':f.type||'text/plain',byteLength:f.size}))]);if(problem)throw Error(problem);}
   const check=()=>{abort.signal.throwIfAborted();host.guard();const now=editor.readAssetContext();if(!alive||selectedProvider!==host.provider?.()||session!==host.session()||host.draft()?.key!==node!.key||now.session!==scope.session||now.cavernId!==scope.cavernId||editor.repository.readState().contents[node!.contentKey]?.revision!==revision)throw Error('Draft or Vault changed; attachments were not inserted');};
   if(bytes>attachmentLimits.largeBytes){
    setPending('Waiting for large-upload confirmation');
    const proceed=await new Promise<boolean>(resolve=>{decision=resolve;setConfirmation({files:selected,bytes});});
    if(!proceed){if(alive)host.notice('Upload cancelled. No new files were attached.');return;}
    check();
   }
   const prepared:Attachment[]=[];
   for(const file of files){check();setPending(`Uploading and validating ${file.name} (${attachmentSize(file.size)})…`);try{prepared.push(await providers.uploadAttachment(file,abort.signal));}catch(error){throw Error(`${file.name}: ${error instanceof Error?error.message:String(error)}`);}check();}
   check();write(node,[...baseline,...prepared]);host.notice(`${prepared.length} file${prepared.length===1?'':'s'} attached locally. Submit sends them to the AI; save the Document to retain the references.`);
  }catch(error){if(alive){const message=abort.signal.aborted?'Attachment preparation cancelled':error instanceof Error?error.message:String(error);if(node&&!abort.signal.aborted)setFailure({session,draft:node.key,files:selected,message});host.notice(message);}}
  finally{if(controller===abort){controller=undefined;answer(false);setPending('');}}
 };
 const remove=(id:string)=>{try{host.guard();if(controller)throw Error('Finish or cancel attachment preparation first');const node=host.draft();if(node)write(node,list(node).filter(a=>a.id!==id));}catch(error){host.notice(String(error));}};
 return {attach,remove,pending,confirmation,confirm:()=>answer(true),cancel,failure,dismissFailure:()=>{setFailure(undefined);host.notice('Failed selection removed. Only the listed attachments will be sent.');},list,dispose(){alive=false;cancel();}};
}
