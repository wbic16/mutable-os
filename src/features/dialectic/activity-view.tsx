import {For,Show,createMemo,createEffect} from 'solid-js';
import type {ContributionNotice,ReplyTarget} from './model';
import type {DialecticController} from './controller';
import {activityCategories,activityLimits,type ActivityCategory,type ActivityItem} from './activity';
const categories=Object.keys(activityCategories) as ActivityCategory[];
const noticeLabel=(code:string)=>({'validation-repaired':'Response repaired','markdown-fallback':'Markdown fallback','partial-conversion':'Partial conversion','unsupported-media':'Unsupported media','incomplete-operation':'Incomplete operation','image-load':'Image loading'}[code]??code);
function NoticeText(props:{notice:ContributionNotice;inspect?:(target:ReplyTarget)=>void}){
 return <><Show when={props.notice.code==='image-load'}><Show when={props.notice.target&&props.inspect} fallback={<span>{props.notice.sourceName??'Image'}</span>}><button type="button" class="dialectic-notice-target" onClick={()=>props.inspect?.(props.notice.target!)}>{props.notice.sourceName??'Image'}</button></Show>{' '}</Show>{props.notice.detail}</>;
}
/** Local disclosure only: opening a warning never edits the contribution. */
export function ContributionWarnings(props:{notices:ContributionNotice[];inspect?:(target:ReplyTarget)=>void}){
 return <Show when={props.notices.length}><details class="dialectic-contribution-warning">
  <summary aria-label="Contribution warnings" title="Contribution warnings">
   <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 22 21H2Z" stroke-linejoin="round"/><path d="M12 9v5" stroke-linecap="round"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/></svg>
  </summary>
  <div class="dialectic-warning-explanation"><For each={props.notices}>{notice=><p><NoticeText notice={notice} inspect={props.inspect}/></p>}</For></div>
 </details></Show>;
}
export function ContributionActivityBar(props:{c:DialecticController;id:string}){
 const c=props.c,summary=c.contributionActivity(props.id),visible=()=>summary().items.length||summary().notices.length||summary().limited;
 return <Show when={visible()}><div class="dialectic-contribution-activity" data-contribution-activity={props.id} contentEditable={false} data-cross-text-controls onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <div class="dialectic-activity-controls" role="group" aria-label="Contribution activity">
   <For each={categories.filter(key=>summary().counts[key]>0)}>{key=>{
    const meta=activityCategories[key],label=()=>`${summary().limited?'At least ':''}${summary().counts[key]} ${summary().counts[key]===1?meta.singular:meta.label}`;
    return <button data-activity-category={key} aria-label={label()} title={label()} onClick={e=>{e.stopPropagation();c.inspectActivity(props.id,key);}}><span class="dialectic-activity-full">{meta.symbol} {summary().limited?'≥':''}{summary().counts[key]} {summary().counts[key]===1?meta.singular:meta.label}</span><span class="dialectic-activity-compact" aria-hidden="true">[{meta.short}:{summary().limited?'≥':''}{summary().counts[key]}]</span></button>;
   }}</For>
   <ContributionWarnings notices={summary().notices.filter(n=>n.severity==='warning')} inspect={target=>c.inspectActivityItem({key:'notice',category:'references',active:true,label:'Image',target})}/>
   <Show when={summary().limited}><button onClick={()=>c.inspectActivity(props.id,'unavailable')} title="Activity provenance is incomplete; counts may be incomplete">More activity may be recorded</button></Show>
  </div>
  <Show when={summary().notices.some(n=>n.severity!=='warning')}><div class="dialectic-contribution-notices" role="group" aria-label="Contribution notices"><For each={summary().notices.filter(n=>n.severity!=='warning')}>{notice=><button data-notice-code={notice.code} title={notice.detail} onClick={e=>{e.stopPropagation();c.inspectActivity(props.id,'notices');}}>! {noticeLabel(notice.code)}</button>}</For></div></Show>
 </div></Show>;
}
export function ContributionActivityInspector(props:{c:DialecticController}){
 const c=props.c;
 return <Show when={c.activityInspection()}>{selection=>{
  const summary=createMemo(()=>selection().coverage?c.contentsActivity(selection().id):c.contributionActivity(selection().id)());
  const filtered=createMemo(()=>summary().items.filter(item=>selection().category==='unavailable'?!item.active:item.active&&item.category===selection().category));
  let section!:HTMLElement;
  createEffect(()=>{const selected=selection();queueMicrotask(()=>{if(c.activityInspection()===selected&&section?.isConnected){section.focus({preventScroll:true});section.scrollIntoView?.({block:'nearest'});}});});
  const source=(item:ActivityItem)=>item.annotation?c.annotationDetails(item.annotation)?.text:undefined;
  return <section ref={section} tabIndex={-1} class="dialectic-activity-inspection" aria-label="Contribution activity inspection">
   <Show when={selection().coverage}><small>Current semantic coverage · distinct objects, including later annotations</small></Show>
   <h4>{selection().category==='notices'?'Historical notices':activityCategories[selection().category as ActivityCategory].label} · {c.label(c.target(selection().id))}</h4>
   <Show when={selection().category==='notices'} fallback={<>
    <Show when={!filtered().length}><p>No current effects in this category.</p></Show>
    <For each={filtered().slice(0,activityLimits.inspector)}>{item=><div class="dialectic-activity-item">
     <button onClick={()=>c.inspectActivityItem(item)}>{item.label}{item.target?` · ${c.label(item.target)}`:''}</button>
     <Show when={!item.active}><small>Unavailable: {item.reason}</small></Show>
     <Show when={source(item)}>{text=><blockquote>{text()}</blockquote>}</Show>
     <For each={item.sources}>{ref=><button onClick={()=>c.inspectActivityItem({...item,target:undefined,annotation:ref})}>Inspect Gloss source</button>}</For>
    </div>}</For>
    <Show when={filtered().length>activityLimits.inspector}><small>Showing the first {activityLimits.inspector} effects. The contribution's exchange record retains the recorded identities.</small></Show>
   </>}>
    <For each={summary().notices}>{notice=><div><strong>{noticeLabel(notice.code)}</strong><p><NoticeText notice={notice} inspect={target=>c.inspectActivityItem({key:notice.code,category:'references',active:true,label:noticeLabel(notice.code),target})}/></p><small>{notice.severity} · {notice.code==='image-load'?'Historical resource condition':'Historical authoring condition'}</small><Show when={notice.code!=='image-load'&&notice.target}>{target=><button onClick={()=>c.inspectActivityItem({key:notice.code,category:'references',active:true,label:noticeLabel(notice.code),target:target()})}>Inspect notice target</button>}</Show></div>}</For>
   </Show>
   <Show when={summary().limited}><p>Some activity provenance is unavailable or exceeds inspection limits. Counts are lower bounds, not a complete inventory.</p></Show>
  </section>;
 }}</Show>;
}
