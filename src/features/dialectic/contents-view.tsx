import {For,Show,createMemo,createSignal,onCleanup} from 'solid-js';
import {participantLabel} from './model';
import type {DialecticController} from './controller';

export const contentsPreferenceKey='mutable.dialectic.semantic-contents.v1';
/** Same local presentation-preference convention as Flint/annotation bars. */
export function createContentsPreference(enabled:boolean,initial:boolean){
 const read=()=>{try{return localStorage.getItem(contentsPreferenceKey)==='expanded';}catch{return false;}};
 const [open,setOpen]=createSignal(enabled?read():initial),eventName='mutable:dialectic-contents';
 const receive=()=>{if(enabled)setOpen(read());};
 if(enabled){window.addEventListener('storage',receive);window.addEventListener(eventName,receive);onCleanup(()=>{window.removeEventListener('storage',receive);window.removeEventListener(eventName,receive);});}
 return {open,toggle(){const value=!open();setOpen(value);if(enabled){try{localStorage.setItem(contentsPreferenceKey,value?'expanded':'collapsed');window.dispatchEvent(new Event(eventName));}catch{/* Session preference still works. */}}}};
}
const categories=['entities','arguments','relationships','glosses'] as const;
const names={entities:'Entities',arguments:'Arguments',relationships:'Relations',glosses:'Glosses'};
export function ContributionNavigation(props:{c:DialecticController;expanded:boolean}){
 const c=props.c,enabled=c.editor.features.dialecticSemanticContents;
 const navigateKey=(e:KeyboardEvent)=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key)||(e.target as HTMLElement).dataset.contentsLink===undefined)return;
  const links=[...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-contents-link]')],at=links.indexOf(e.target as HTMLButtonElement),next=e.key==='Home'?0:e.key==='End'?links.length-1:Math.max(0,Math.min(links.length-1,at+(e.key==='ArrowDown'?1:-1)));
  e.preventDefault();e.stopPropagation();links[next]?.focus();
 };
 return <div class="dialectic-contribution-list" tabIndex={0} aria-label="Contribution chronology" onKeyDown={navigateKey}>
  <For each={enabled?c.contentsRows():c.committed()}>{r=><div data-contents-id={r.id}>
   <button class="dialectic-entry" data-contents-link aria-label={`Contribution ${r.data.ordinal}: ${participantLabel(r.data)}`} title={`Contribution ${r.data.ordinal}: ${participantLabel(r.data)}`} aria-current={c.inspection()?.blockId===r.id?'true':undefined} onClick={()=>c.run(()=>c.inspect(c.target(r.id)))}>
    <span class="dialectic-number">{String(r.data.ordinal).padStart(2,'0')}</span>
    <Show when={props.expanded}><Show when={enabled} fallback={<span>{participantLabel(r.data)}<small>{r.data.replies.length?`↳ ${r.data.replies.map(t=>c.label(t)).join(', ')}`:'New contribution'}</small></span>}><ContentsLabel c={c} id={r.id}/></Show></Show>
   </button>
   <Show when={enabled&&props.expanded}><ContentsCounts c={c} id={r.id}/></Show>
  </div>}</For>
 </div>;
}
function ContentsLabel(props:{c:DialecticController;id:string}){const label=createMemo(()=>props.c.contentsSynopsis(props.id));return <span class="dialectic-contents-synopsis">{label()}</span>;}
function ContentsCounts(props:{c:DialecticController;id:string}){
 const summary=createMemo(()=>props.c.contentsActivity(props.id));
 return <div class="dialectic-contents-counts" aria-label="Current semantic coverage" title="Distinct objects currently anchored or mentioned here, plus their relationships. Historical authoring activity is shown on the contribution.">
  <Show when={categories.some(k=>summary().counts[k]>0)} fallback={<span>No semantic objects</span>}><For each={categories.filter(k=>summary().counts[k]>0)}>{category=><button aria-label={`${names[category]} ${summary().counts[category]}`} disabled={!summary().counts[category]} onClick={()=>props.c.inspectContents(props.id,category)}>{names[category]} {summary().counts[category]}</button>}</For></Show>
 </div>;
}
