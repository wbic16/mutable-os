import type { ReactiveEditor } from '../reactive-editor/editor';
import type { VaultKnowledge } from './vault-knowledge';
import type { VaultLocation } from './document-vault';
export interface FlintDocumentChoice {
  documentId:string;
  title:string;
  location?:VaultLocation;
  vault?:string;
  disabled?:boolean;
}
interface CompletionDocuments {
  key:string;
  type:string;
  accepts(key:string):boolean;
  knowledge?:VaultKnowledge;
  vault():string|undefined;
  openVault(root?:string):Promise<void>;
  documents():FlintDocumentChoice[];
  prepareDocument(choice:FlintDocumentChoice,current:()=>boolean):Promise<()=>void>;
  reveal():void;
}
const contexts = new WeakMap<ReactiveEditor, Set<CompletionDocuments>>();
export function registerCompletionDocuments(editor:ReactiveEditor, context:CompletionDocuments) {
  let set=contexts.get(editor); if(!set)contexts.set(editor,set=new Set()); set.add(context); return ()=>{set!.delete(context);};
}
export function completionDocuments(editor:ReactiveEditor,key:string) {
  const matches=[...contexts.get(editor)??[]].filter(c=>c.accepts(key));
  if(matches.length!==1||!matches[0].knowledge)throw Error('Native Document lookup requires an active saved Flint Document in a selected Cavern.');
  return matches[0].knowledge;
}

/** Resolve a destination only on explicit selection, never while querying or typing. */
async function flintDestination(editor:ReactiveEditor,key:string,current:()=>boolean) {
  const entries=()=>[...contexts.get(editor)??[]];
  const source=entries().find(c=>c.accepts(key));
  const root=source?.vault();
  const candidates=()=>entries().filter(c=>c.type==='flint-application-block'&&(!root||!c.vault()||c.vault()===root));
  let target=candidates().sort((a,b)=>Number(b===source)-Number(a===source)||(editor.windowManager?.rankForNode(b.key)??0)-(editor.windowManager?.rankForNode(a.key)??0))[0];
  if(!current())throw Error('Retrieval navigation superseded');
  if(!target){
    // Keep the invoking Scry alive until the verified destination is ready.
    const launch=()=>editor.commandRegistry.execute('flint.open',{targetKey:key,args:undefined});
    await (editor.windowManager?editor.windowManager.withoutActivation(launch):launch());
    target=candidates()[0];
  }
  if(!target)throw Error('Flint is unavailable for passage navigation');
  return {target,root};
}
export async function activateCompletionPassage(editor:ReactiveEditor,key:string,hit:any,current:()=>boolean) {
  const {target,root}=await flintDestination(editor,key,current);
  if(!target.vault())await target.openVault(root);
  if(!current())throw Error('Retrieval navigation superseded');
  if(!target.knowledge)throw Error('Native Document passage navigation is unavailable');
  await target.knowledge.activateRetrieval(hit,current);
}

/** One cached, presentation-only pool per Scry invocation. No file admission. */
export async function flintDocumentChoices(editor:ReactiveEditor,key:string,signal:AbortSignal) {
  const entries=[...contexts.get(editor)??[]];
  const source=entries.find(c=>c.accepts(key))??entries.filter(c=>c.type==='flint-application-block').sort((a,b)=>(editor.windowManager?.rankForNode(b.key)??0)-(editor.windowManager?.rankForNode(a.key)??0))[0];
  if(!source)throw Error('Open a Cavern in Flint or Dialectic to choose a Document');
  signal.throwIfAborted();
  // Use the existing Library listing. Typing must never request a vault scan.
  return source.documents();
}

/** Prepare first; restore the Window before committing the local invocation so
 * that Undo restores the command text even when Flint was minimized. */
export async function prepareFlintCommand(editor:ReactiveEditor,key:string,current:()=>boolean,choice?:FlintDocumentChoice) {
  const focusCurrent=editor.windowManager?.lifecycle.ticket(),selected=current;
  current=()=>selected()&&focusCurrent?.()!==false;
  const {target,root}=await flintDestination(editor,key,current);
  if(!current())throw Error('Flint command cancelled');
  if(choice&&(choice.location||choice.vault)&&!target.vault())await target.openVault(choice.vault??root);
  const open=choice?await target.prepareDocument(choice,current):()=>{};
  if(!current())throw Error('Flint command cancelled');
  return (commit:()=>void)=>{target.reveal();commit();open();target.reveal();};
}
