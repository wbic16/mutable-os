import {createMemo,createSignal,For,Show} from 'solid-js';
import type {ApplicationVault,ApplicationVaultDocument} from '../../feature-api/document-application';
const path=(p:{folder:string;filename:string})=>p.folder==='.'?p.filename:`${p.folder}/${p.filename}`;
const location=(p:string)=>{const parts=p.split('/'),filename=parts.pop()!;return {folder:parts.join('/')||'.',filename};};
const visibility=new WeakMap<ApplicationVault,boolean>();
export const textualVaultVisible=(vault?:ApplicationVault)=>vault?visibility.get(vault)??true:false;
export const rememberTextualVault=(vault:ApplicationVault,visible:boolean)=>visibility.set(vault,visible);
function grouped<T>(items:readonly T[],folder:(item:T)=>string){const result=new Map<string,T[]>();for(const item of items){const key=folder(item),group=result.get(key);if(group)group.push(item);else result.set(key,[item]);}return result;}
/** A dedicated view of Flint's existing Vault controller. No discovery on render or reopen. */
export function TextualVault(props:{vault:ApplicationVault;activeLocation:()=>{folder:string;filename:string}|undefined;collapse():void;create():void;opened():void}){
 const state=()=>props.vault.state(),[working,setWorking]=createSignal(false),[error,setError]=createSignal('');
 const busy=createMemo(()=>!!(working()||props.vault.loading?.()||state()?.busy)),complete=createMemo(()=>!!state()?.complete),readOnly=createMemo(()=>!!state()?.readOnly),vaultRoot=createMemo(()=>state()?.root);
 const active=createMemo(()=>{const l=props.activeLocation();return l?path(l):'';});
 const sourceDocuments=createMemo(()=>state()?.documents),sourceFolders=createMemo(()=>state()?.folders),sourceCandidates=createMemo(()=>state()?.candidates);
 const documents=createMemo(()=>grouped(sourceDocuments()??[],d=>d.location.folder));
 const folders=createMemo(()=>grouped(sourceFolders()??[],f=>location(f).folder));
 const candidates=createMemo(()=>grouped(sourceCandidates()??[],f=>location(f).folder));
 const run=async(action:()=>unknown)=>{if(busy())return;setWorking(true);setError('');try{await action();}catch(e){setError(String(e));}finally{setWorking(false);}};
 const open=(action:()=>Promise<void>)=>void run(async()=>{await action();props.opened();});
 const File=(p:{doc:ApplicationVaultDocument})=><div><button class="tw-vault-file" aria-label={`Open ${path(p.doc.location)}`} aria-current={active()===path(p.doc.location)?'page':undefined} title={`${p.doc.title} · ${path(p.doc.location)} · ${p.doc.state}`} disabled={busy()||!complete()||p.doc.state==='pending'||p.doc.state==='ambiguous'} onClick={()=>open(()=>props.vault.openFile(p.doc.location))}>{p.doc.title||p.doc.location.filename}</button><Show when={p.doc.state==='pending'}><button disabled={busy()||readOnly()} onClick={()=>void run(()=>props.vault.recoverNative(p.doc.location))}>Recover</button></Show></div>;
 const Folder=(p:{path:string})=><details open={p.path===vaultRoot()}><summary title={p.path}>{p.path===vaultRoot()?(p.path==='.'?'Vault':p.path):location(p.path).filename}</summary><div class="tw-vault-children"><For each={folders().get(p.path)}>{folder=><Folder path={folder}/>}</For><For each={documents().get(p.path)}>{doc=><File doc={doc}/>}</For><For each={candidates().get(p.path)}>{file=><button class="tw-vault-file" title={file} aria-label={`Open ${file}`} disabled={busy()||!props.vault.openCandidate} onClick={()=>open(()=>props.vault.openCandidate!(location(file)))}>{location(file).filename}</button>}</For></div></details>;
 return <><header><strong>Vault</strong><button aria-label="Collapse Vault explorer" onClick={props.collapse}>◂</button></header><div class="tw-vault-actions"><Show when={props.vault.choose}><button disabled={busy()} onClick={()=>void run(()=>props.vault.choose!())}>Open…</button></Show><button disabled={busy()||!state()||state()?.checking} onClick={()=>void run(()=>props.vault.refresh())}>Refresh</button><button disabled={busy()||!state()||readOnly()} onClick={props.create}>New…</button></div>
 <Show when={props.vault.loading?.()}><p role="status">Loading files…</p></Show><Show when={error()||props.vault.error?.()}><p role="alert">{error()||props.vault.error?.()}</p><Show when={props.vault.retry}><button disabled={busy()} onClick={()=>void run(()=>props.vault.retry!())}>Retry</button></Show></Show>
 <Show when={readOnly()}><p>Read-only Vault</p></Show><Show when={state()?.notice}><p role="status">{state()?.notice}</p></Show>
 <Show when={state()?.root} keyed fallback={<p>Open a Vault using File → Vault.</p>}>{root=><div class="tw-vault-tree" aria-label="Vault files"><Folder path={root}/><Show when={!state()?.documents.length&&!state()?.candidates?.length&&!state()?.folders.length}><p>No files</p></Show></div>}</Show>
 </>;
}
