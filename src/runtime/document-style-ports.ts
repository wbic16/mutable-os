import {createSignal} from 'solid-js';
import type {ReactiveEditor} from '../reactive-editor/editor';
import type {CompactTool} from '../rendering/compact-toolbar';
/** Optional presentation access to the existing toolbar's selection-aware handlers. */
export interface DocumentStylePort { capture():void; tools():CompactTool[]; annotate(type:string,value?:string):void; notice():string; }
const registries=new WeakMap<ReactiveEditor,ReturnType<typeof registry>>();
function registry(){
 const ports=new Map<string,DocumentStylePort>(),[revision,changed]=createSignal(0);
 return {get(key:string){revision();return ports.get(key);},register(key:string,port:DocumentStylePort){ports.set(key,port);changed(n=>n+1);return()=>{if(ports.get(key)===port){ports.delete(key);changed(n=>n+1);}};}};
}
export function documentStylePorts(editor:ReactiveEditor){let value=registries.get(editor);if(!value){value=registry();registries.set(editor,value);}return value;}
