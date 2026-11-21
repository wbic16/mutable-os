import {installPassiveInput} from '../../runtime/passive-presentation';
import {blockAppearance} from '../../rendering/appearance';
import {For,Show,createMemo,onMount,onCleanup,type Accessor} from 'solid-js';
import type {DialecticController} from './controller';
import {newGroup,type SequenceGroup} from './sequences';
import {PassiveComposition} from '../../rendering/passive-composition';

export function SequenceNavigation(props:{c:DialecticController}){
 const c=props.c,s=c.sequences,act=(f:()=>unknown)=>()=>c.run(f);
 return <section class="dialectic-sequence-list" aria-label="Sequences"><div class="dialectic-eyebrow">SEQUENCES</div>
  <button disabled={!c.valid()||!!s.draft()} onClick={act(s.create)}>New Sequence</button>
  <For each={s.saved()}>{seq=><div class="dialectic-sequence-entry"><strong>{seq.title||'Untitled Sequence'}</strong><div>
   <button disabled={!!s.draft()} onClick={act(()=>s.present(seq.id))}>Present</button><button disabled={!!s.draft()} onClick={act(()=>s.edit(seq.id))}>Edit</button><button disabled={!!s.draft()} onClick={act(()=>s.duplicate(seq.id))}>Duplicate</button><button disabled={!!s.draft()} onClick={act(()=>s.remove(seq.id))}>Delete</button>
  </div></div>}</For><Show when={s.unsupported()}><p role="status">{s.unsupported()} unsupported Sequence definitions retained.</p></Show>
 </section>;
}
export function SequenceAuthor(props:{c:DialecticController}){
 const c=props.c,s=c.sequences,act=(f:()=>unknown)=>()=>c.run(f);
 return <section class="dialectic-sequence-author" aria-label="Sequence authoring"><header><strong>Edit Sequence</strong><button onClick={act(s.save)}>Apply Sequence</button><button onClick={s.cancel}>Cancel Sequence changes</button></header>
  <label>Sequence title <input aria-label="Sequence title" value={s.draft()?.title??''} maxlength="200" onInput={e=>s.change(d=>{d.title=e.currentTarget.value;})}/></label>
  <For each={s.draft()?.groups.map(g=>g.id)}>{id=><GroupEditor c={c} group={()=>s.draft()!.groups.find(g=>g.id===id)!}/>}</For>
  <button disabled={(s.draft()?.groups.length??0)>=32} onClick={()=>s.change(d=>d.groups.push(newGroup()))}>Add group</button>
  <small>Apply creates one undoable Document edit. Save the Document to persist it. Sources stay in their contributions.</small>
 </section>;
}
function GroupEditor(props:{c:DialecticController;group:Accessor<SequenceGroup>}){
 const c=props.c,s=c.sequences,g=props.group,act=(f:()=>unknown)=>()=>c.run(f);
 const change=(fn:(g:SequenceGroup)=>void)=>s.change(d=>{const group=d.groups.find(x=>x.id===g().id);if(group)fn(group);});
 return <fieldset><legend>Perspective group</legend><input aria-label="Group title" value={g().title} maxlength="200" onInput={e=>change(g=>{g.title=e.currentTarget.value;})}/>
  <button aria-label="Move group up" onClick={()=>s.moveGroup(g().id,-1)}>↑</button><button aria-label="Move group down" onClick={()=>s.moveGroup(g().id,1)}>↓</button><button onClick={()=>s.change(d=>{d.groups=d.groups.filter(x=>x.id!==g().id);})}>Remove group</button>
  <label>Arrangement <select value={g().presentation?.arrangement??'parallel'} onChange={e=>change(g=>{g.presentation={...g.presentation,arrangement:e.currentTarget.value as 'parallel'|'stacked'};})}><option value="parallel">Parallel</option><option value="stacked">Stacked</option></select></label>
  <label>Reveal <select value={g().presentation?.reveal??'together'} onChange={e=>change(g=>{g.presentation={...g.presentation,reveal:e.currentTarget.value as 'together'|'in-order'};})}><option value="together">Together</option><option value="in-order">Cumulative, in order</option></select></label>
  <label>Emphasis <select value={g().presentation?.focusMemberId??''} onChange={e=>change(g=>{g.presentation={...g.presentation,focusMemberId:e.currentTarget.value||undefined};})}><option value="">None</option><For each={g().members}>{m=><option value={m.id}>{m.label||c.label(m.source)}</option>}</For></select></label>
  <div><button disabled={!c.inspection()||!['block','contribution'].includes(c.inspection()!.kind)||g().members.length>=4} onClick={act(()=>s.add(g().id,c.inspection()!))}>Add inspected source</button><button disabled={g().members.length>=4} onPointerDown={e=>e.preventDefault()} onClick={act(()=>s.add(g().id,c.focusBlock()))}>Add caret Block</button></div>
  <For each={g().members.map(m=>m.id)}>{id=>{const member=()=>g().members.find(m=>m.id===id)!;return <div class="dialectic-member-edit"><input aria-label="Perspective label" placeholder={c.label(member().source)} value={member().label??''} maxlength="200" onInput={e=>change(g=>{g.members.find(m=>m.id===id)!.label=e.currentTarget.value;})}/><span>{c.resolve(member().source)?'Linked source':'Source unavailable'}</span>
   <button aria-label="Move member up" onClick={()=>s.moveMember(g().id,id,-1)}>↑</button><button aria-label="Move member down" onClick={()=>s.moveMember(g().id,id,1)}>↓</button><button onClick={()=>change(g=>{g.members=g.members.filter(m=>m.id!==id);if(g.presentation?.focusMemberId===id)g.presentation.focusMemberId=undefined;})}>Remove member</button>
   <button disabled={!c.inspection()||!['block','contribution'].includes(c.inspection()!.kind)} onClick={act(()=>{s.replace(g().id,id,c.inspection()!);})}>Replace with inspected source</button>
  </div>;}}</For>
 </fieldset>;
}
export function SequenceReader(props:{c:DialecticController;textual?:boolean}){
 const c=props.c,s=c.sequences;let root!:HTMLElement;const appearance=createMemo(()=>blockAppearance(c.root()));
 const act=(f:()=>unknown)=>()=>c.run(f);
 onMount(()=>{onCleanup(installPassiveInput(root.ownerDocument.defaultView!));queueMicrotask(()=>{if(root.isConnected)root.focus({preventScroll:true});});});
 const step=(delta:number)=>{const groups=s.sequence()?.groups??[],i=groups.findIndex(g=>g.id===s.group()?.id);if(groups[i+delta])s.chooseGroup(groups[i+delta].id);};
 return <section ref={root} tabindex="-1" data-native-passive="sequence-navigation" class="dialectic-sequence-reader" aria-label="Sequence presentation">
  <header><strong>{s.sequence()?.title??'Sequence unavailable'}</strong><button onClick={()=>s.leave()}>Return to conversation</button></header>
  <nav aria-label="Sequence groups"><For each={s.sequence()?.groups}>{g=><button aria-current={g.id===s.group()?.id?'step':undefined} onClick={()=>s.chooseGroup(g.id)}>{g.title||'Untitled group'}</button>}</For></nav>
  <div class="dialectic-sequence-controls"><button disabled={s.sequence()?.groups[0]?.id===s.group()?.id} onClick={()=>step(-1)}>Previous group</button><button disabled={s.sequence()?.groups.at(-1)?.id===s.group()?.id} onClick={()=>step(1)}>Next group</button><Show when={s.group()?.presentation?.reveal==='in-order'}><button onClick={()=>s.reveal()}>Reveal next</button><button onClick={()=>s.reveal(true)}>Show all</button><button onClick={s.reset}>Reset reveal</button></Show></div>
  <Show when={s.group()} fallback={<p>No groups to present. Return to Sequence authoring to add sources.</p>} keyed>{g=><div class="dialectic-perspectives" data-arrangement={g.presentation?.arrangement??'parallel'}>
   <For each={g.members}>{m=>{const source=createMemo(()=>c.resolve(m.source)?.placementKey);return <article class="dialectic-perspective" data-member-id={m.id} data-emphasised={g.presentation?.focusMemberId===m.id}>
    <header><strong>{m.label||c.label(m.source)}</strong><div><button onClick={()=>s.openSource(m.source)}>Open source</button><button onClick={act(()=>{c.setReply(m.source);s.openSource(m.source);})}>Reply to source</button><button onClick={act(()=>c.pin(m.source))}>Include source in context</button></div></header>
    <Show when={s.visible(m.id)} fallback={<button onClick={()=>{s.show(m.id);}}>Show this perspective</button>}>
     <Show when={source()} keyed fallback={<p role="status">Source unavailable. Its reference is retained. Undo the source deletion or replace the reference in Sequence authoring.</p>}>{placement=><div class={appearance().classes.join(' ')} style={appearance().style}><PassiveComposition textual={props.textual} editor={c.editor} placement={placement} state={s.memberState(m.id)} memberId={m.id} openSource={()=>s.openSource(m.source)}/></div>}</Show>
    </Show>
   </article>;}}</For>
  </div>}</Show>
 </section>;
}
