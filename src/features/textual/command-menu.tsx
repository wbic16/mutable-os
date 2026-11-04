import {createSignal,For,onMount,Show} from 'solid-js';
import type {BlockMenuItem} from '../../runtime/block-menu-types';
/** Dedicated cell-sized menu; action models retain the existing command pipeline. */
export function TextualCommandMenu(props:{items:BlockMenuItem[];close():void;execute(action:()=>unknown):void}){
 const [path,setPath]=createSignal<BlockMenuItem[][]>([props.items]),[form,setForm]=createSignal<BlockMenuItem>(),[value,setValue]=createSignal(''),[error,setError]=createSignal('');
 let root!:HTMLDivElement;
 const first=()=>queueMicrotask(()=>root.querySelector<HTMLElement>('input,button:not(:disabled)')?.focus());onMount(first);
 const back=()=>{if(form())setForm(undefined);else if(path().length>1)setPath(p=>p.slice(0,-1));else props.close();setError('');first();};
 const activate=(item:BlockMenuItem)=>{
  if(item.disabled)return;setError('');
  try{const children=item.loadChildren?.()??item.children;if(children){setPath(p=>[...p,children]);first();return;}if(item.input){setForm(item);setValue(item.input.value??'');first();return;}if(item.run)props.execute(item.run);}
  catch(e){setError(String(e));}
 };
 return <div ref={root} class="tw-command-menu" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();back();}}}>
  <Show when={form()} keyed fallback={<For each={path().at(-1)}>{item=><button disabled={item.disabled} title={item.reason} onPointerDown={e=>e.preventDefault()} onClick={()=>activate(item)}>{item.label}{item.children||item.loadChildren?' ›':''}</button>}</For>}>
   {item=><form onSubmit={e=>{e.preventDefault();if(!value().trim()){setError('Enter a value first.');return;}props.execute(()=>item.input!.submit(value().trim()));}}><label>{item.input!.label}<input value={value()} onInput={e=>setValue(e.currentTarget.value)}/></label><button type="submit">Apply</button></form>}
  </Show><Show when={error()}><p role="alert">{error()}</p></Show><button onClick={back}>{path().length>1||form()?'Back':'Close menu'}</button>
 </div>;
}
