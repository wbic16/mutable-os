import {createSignal} from 'solid-js';
export const inspectorTabs=['text','path','layout','effects','semantics'] as const;
export const dockTabs=['layers','ornaments','path-presets','effect-presets','assets'] as const;
export type StudioCommand='path'|'effect'|'ornament'|'background'|'source'|'export'|'image';
const studios=new WeakMap<Element,ReturnType<typeof createStudio>>();
/** Occurrence-local panels and tool intent. Canonical selection stays native. */
function createStudio(root:Element){
 const [active,setActive]=createSignal<string>(),[sources,setSources]=createSignal<Array<{key:string;label:string;root:HTMLElement;command?:(name:StudioCommand,value?:string)=>void}>>([]);
 const [inspectorTab,setInspectorTab]=createSignal<typeof inspectorTabs[number]>('text'),[dockTab,setDockTab]=createSignal<typeof dockTabs[number]>('layers'),[tool,setTool]=createSignal('text'),[dockOpen,setDockOpen]=createSignal(true),[status,setStatus]=createSignal('Select a composition to edit its typography.');
 const current=()=>sources().find(s=>s.key===active());
 return {active,setActive,sources,inspectorTab,setInspectorTab,dockTab,setDockTab,tool,setTool,dockOpen,setDockOpen,status,setStatus,inspector:()=>root.querySelector<HTMLElement>('[data-quill-inspector]')!,dock:()=>root.querySelector<HTMLElement>('[data-quill-dock]')!,
  register(key:string,label:string,element:HTMLElement,command?:(name:StudioCommand,value?:string)=>void){setSources(a=>[...a,{key,label,root:element,command}]);if(!active())setActive(key);return ()=>{setSources(a=>a.filter(s=>s.key!==key));if(active()===key)setActive(sources()[0]?.key);};},
  action(label:string){[...current()?.root.querySelectorAll<HTMLButtonElement>('button')??[]].find(b=>b.textContent===label)?.click();},
  command(name:StudioCommand,value?:string){current()?.command?.(name,value);},
  choose(key:string){setActive(key);(current()?.root.closest('.quill-composition')??current()?.root)?.scrollIntoView?.({block:'nearest'});current()?.root.querySelector<HTMLElement>('.quill-input-sink')?.focus({preventScroll:true});},
 };
}
export type QuillStudio=ReturnType<typeof createStudio>;
export function studioFor(element:Element){const root=element.closest('.quill-application');if(!root)return;let s=studios.get(root);if(!s){s=createStudio(root);studios.set(root,s);}return s;}
