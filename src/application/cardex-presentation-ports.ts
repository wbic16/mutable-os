import {createSignal,type Accessor} from 'solid-js';
import type {ReactiveEditor} from '../reactive-editor/editor';
import type {EntityCardRecord} from '../features/cardex/service';
/** A view over the already-mounted Instrument, including its original field DOM. */
export interface CardexPresentationPort {
 key:string;windowKey?:string;vault:Accessor<string>;ready:Accessor<boolean>;notice:Accessor<string>;dirty:Accessor<boolean>;busy:Accessor<boolean>;pending:Accessor<unknown>;
 draft:Accessor<EntityCardRecord|undefined>;saved:Accessor<EntityCardRecord|undefined>;activeTab:Accessor<string>;selectTab(tab:string):void;
 navigation:Accessor<{applicationKey?:string}|undefined>;canPresent():boolean;add():void;back():void;save():Promise<void>;deletion():Promise<void>;
 search:Accessor<HTMLElement|undefined>;identity:Accessor<HTMLElement|undefined>;details:Accessor<HTMLElement|undefined>;legacy:Accessor<HTMLElement|undefined>;
}
const registries=new WeakMap<ReactiveEditor,ReturnType<typeof createRegistry>>();
function createRegistry(){const[ports,setPorts]=createSignal<readonly CardexPresentationPort[]>([]);return {ports,register(port:CardexPresentationPort){setPorts(v=>[...v,port]);return()=>setPorts(v=>v.filter(p=>p!==port));}};}
export function cardexPresentationPorts(editor:ReactiveEditor){let registry=registries.get(editor);if(!registry){registry=createRegistry();registries.set(editor,registry);}return registry;}

/** Only the qualified same-owner Desktop/Textual route may retain an opaque Cardex. */
export function canPresentCardex(editor:ReactiveEditor,nodeKey:string,from:string,to:string){
 if(!((from==='desktop'&&to==='textual')||(from==='textual'&&to==='desktop')))return false;
 if(editor.node(nodeKey)?.viewType!=='cardex-application-block')return false;
 const windowKey=editor.blockQueries.ancestors(nodeKey).find(n=>n.viewType==='window-block')?.key;
 if(!windowKey)return false;
 const windowId=editor.windowManager?.ownerForNode(windowKey);
 return !!windowId&&!!editor.windowManager?.lifecycle.canTransfer(windowId)&&cardexPresentationPorts(editor).ports().some(p=>p.windowKey===windowKey&&p.canPresent());
}
