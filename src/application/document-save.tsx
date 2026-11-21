import {createSignal,Show,onCleanup} from 'solid-js';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {nativeDocumentSession,type NativeOverwrite} from '../persistence/native-session';
import {availableNativeFilename} from '../persistence/document-file-names.mjs';
import {vaultContains,vaultRoot,vaultLeaf,type VaultLocation} from './document-vault';
import {DocumentSaveCollision,type SaveCollisionChoice} from '../rendering/document-save-collision';
import {DocumentDialog} from '../demo/document-dialog';
import {beforeSaveCapture} from '../persistence/after-paint';

export type SavePrompt = {kind:'collision';filename:string;suggested:string;overwriteUnavailable?:string;choose:(choice:SaveCollisionChoice)=>void} | {kind:'destination';root:string;filename:string;choose:(location?:VaultLocation)=>void};
export function validateSaveDestination(root:string,folder:string,filename:string):VaultLocation {
 const location={folder:vaultRoot(folder),filename:vaultLeaf(filename)};
 if(!vaultContains(root,location.folder))throw Error('Choose a folder inside the active Vault.');
 if(!/\.(ink|phosphor|mutable\.json)$/.test(location.filename))throw Error('Use an .ink filename.');
 return location;
}
type SaveVault = {root:string;check?:()=>void;run?:<T>(action:()=>Promise<T>,first:boolean)=>Promise<T>};
/** Manual Save policy shared by Flint and standalone Document windows. */
export function createDocumentSave(editor:ReactiveEditor,options:{vault:()=>Promise<SaveVault|undefined>;guard:()=>void;externalPresentation?:()=>boolean}) {
 const native=nativeDocumentSession(editor);
 const [collision,setCollision]=createSignal<{filename:string;suggested:string;overwriteUnavailable?:string;choose:(choice:SaveCollisionChoice)=>void}>();
 const [destination,setDestination]=createSignal<{root:string;filename:string;choose:(location?:VaultLocation)=>void}>();
 let disposed=false,saving=false;
 onCleanup(()=>{disposed=true;collision()?.choose({action:'cancel'});destination()?.choose();});
 const guard=()=>{if(disposed)throw Error('Document Save view closed');options.guard();};
 return {
  prompt:():SavePrompt|undefined=>collision()?{kind:'collision',...collision()!}:destination()?{kind:'destination',...destination()!}:undefined,
  async save(id:string,requested?:VaultLocation,forceChoose=false,submission?:{defaultFilename:string}):Promise<boolean>{
   if(editor.completionInput?.beforeSave?.()===false)return false;
   if(saving)throw Error('A Document Save is already in progress');saving=true;
   try {
    guard();const vault=await options.vault();guard();
    const check=()=>{guard();vault?.check?.();};
    const source=native.location(id),externalSource=source??editor.persistence.workspaceReference(id)?.source;
    const outside=!!externalSource&&!!vault&&!vaultContains(vault.root,vaultRoot(externalSource.folder));
    if(!vault&&native.needsSaveDestination(id))throw Error('Open a Vault before saving this Document.');
    const resource=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='document-block'&&String((c.payload.metadata as any)?.documentId??c.payload.id)===id);
    if(!resource)throw Error('Document is no longer available');
    // A queued contribution may already be included in the preceding save's
    // catch-up generation. Do not capture those same bytes again.
    if(submission&&!outside&&!native.needsSaveDestination(id)&&!native.hasPendingSave(id)&&!native.isDirty(id))return true;
    const meta=resource.payload.metadata as any;
    const name=submission?.defaultFilename??meta?.interchange?.suggestedFilename??meta?.title??source?.filename??'Document';
    const imported=!source&&!!meta?.interchange;
    let target=native.needsSaveDestination(id)?requested:source;
    if(outside||forceChoose||imported){
     if(submission)throw Error('Choose Save as… to confirm this Document’s Vault destination, then retry the contribution save.');
     if(!vault)throw Error('Open a Vault before saving this Document.');
     const choice=await new Promise<VaultLocation|undefined>(resolve=>setDestination({root:vault.root,filename:availableNativeFilename(externalSource?.filename??name,[]),choose:location=>{setDestination(undefined);resolve(location);}}));
     if(!choice)return false;check();target=choice;
    }
    if(!target){if(!vault)throw Error('Open a Vault before saving this Document.');target={folder:vault.root,filename:availableNativeFilename(name,[])};}
    const validate=()=>{target={folder:vaultRoot(target!.folder),filename:vaultLeaf(target!.filename)};if(vault&&!vaultContains(vault.root,target.folder))throw Error('Choose a location inside the active Vault.');};validate();
    const copy=outside||!!(forceChoose&&source&&JSON.stringify(source)!==JSON.stringify(target));
    const first=native.needsSaveDestination(id)||copy;
    let overwrite:NativeOverwrite|undefined;
    if(first){
     for(;;){
      const occupied=await native.list(target.folder);check();
      const existing=occupied.find(n=>n.normalize('NFC').toLowerCase()===target!.filename.normalize('NFC').toLowerCase());
      if(!existing)break;target={...target,filename:existing};
      if(submission){target={...target,filename:availableNativeFilename(existing,occupied)};continue;}
      let proof:NativeOverwrite|undefined,overwriteUnavailable:string|undefined;
      try{proof=await native.inspectOverwrite(target);}catch(e){overwriteUnavailable=(e as Error).message;}
      check();const choice=await new Promise<SaveCollisionChoice>(resolve=>setCollision({filename:existing,suggested:availableNativeFilename(existing,occupied),overwriteUnavailable,choose:choice=>{setCollision(undefined);resolve(choice);}}));
      if(choice.action==='cancel')return false;check();
      if(choice.action==='overwrite'){if(!proof)throw Error(overwriteUnavailable??'Overwrite unavailable');overwrite=proof;break;}
      target={...target,filename:choice.filename};validate();
     }
    }
    check();
    const latest=native.location(id);
    if(JSON.stringify(latest)!==JSON.stringify(source))throw Error('Another view changed this Document’s Save destination. Retry Save.');
    const action=async()=>{
     if(submission&&native.hasPendingSave(id)){
      await native.recover(id,target!);check();
      if(native.hasPendingSave(id))throw Error(native.status(id));
     }
     return copy?native.saveCopy(id,target!,overwrite):native.save(id,target,overwrite);
    };
    let result=vault?.run?await vault.run(action,first):await action();
    // Only commit-triggered Dialectic saves catch up edits made during I/O.
    // Manual Save retains its one-generation policy. Failures stop the loop.
    while(submission&&result?.phase==='saved'&&(result.dirty||native.isDirty(id))){
     await beforeSaveCapture();check();
     const next=()=>native.save(id);
     result=vault?.run?await vault.run(next,false):await next();
    }
    if(result?.phase!=='saved')throw Error(native.status(id));return true;
   }finally{saving=false;}
  },
  Dialogs:()=> <Show when={!options.externalPresentation?.()}><Show when={collision()}>{value=><DocumentSaveCollision {...value()}/>}</Show><Show when={destination()}>{value=><VaultSaveDestination {...value()}/>}</Show></Show>,
 };
}
function VaultSaveDestination(props:{root:string;filename:string;choose:(location?:VaultLocation)=>void}){
 const [folder,setFolder]=createSignal(props.root),[name,setName]=createSignal(props.filename),[error,setError]=createSignal('');
 const choose=()=>{try{props.choose(validateSaveDestination(props.root,folder(),name()));}catch(e){setError((e as Error).message);}};
 return <DocumentDialog title="Save in Vault" compact onClose={()=>props.choose()}><div style={{padding:'1rem'}}>
  <p>Choose a location in the active Vault ({props.root}). The original file will remain untouched.</p>
  <label>Vault folder <input aria-label="Save Vault folder" value={folder()} onInput={e=>setFolder(e.currentTarget.value)}/></label>
  <label>Filename <input aria-label="Save Vault filename" value={name()} onInput={e=>setName(e.currentTarget.value)}/></label>
  <Show when={error()}><p role="alert">{error()}</p></Show><div class="document-dialog__footer"><button data-autofocus onClick={()=>props.choose()}>Cancel</button><button onClick={choose}>Save in Vault</button></div>
 </div></DocumentDialog>;
}
