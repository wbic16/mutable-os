import {For,Show} from 'solid-js';
import {effectPresets} from './effects';
import type {QuillEffect,QuillTypography} from './model';
export function TypographyPanel(props:{value:QuillTypography;expanded?:boolean;mode?:'text'|'effects';preview(value:QuillTypography):void;commit():void}){
 const change=(patch:Partial<QuillTypography>)=>props.preview({...props.value,...patch});
 const immediate=(patch:Partial<QuillTypography>)=>{change(patch);props.commit();};
 const effect=(id:string,patch:Partial<QuillEffect>)=>change({effects:props.value.effects?.map(e=>e.id===id?{...e,...patch}:e)});
 return <details class="quill-typography-inspector" open={props.expanded}><summary>{props.mode==='effects'?'Transformations':'Typography & flow'}</summary><Show when={props.mode!=='effects'}>
  <label>Font family<input aria-label="Quill font family" value={props.value.family??'Georgia'} onChange={e=>immediate({family:e.currentTarget.value})}/></label>
  <For each={[['size','Font size',6,200,20],['weight','Font weight',100,900,400],['tracking','Character spacing',-10,100,0],['indent','Paragraph indent',0,1000,0]] as const}>{([key,label,min,max,fallback])=><label>{label}<input aria-label={label} type="number" min={min} max={max} value={props.value[key]??fallback} onInput={e=>change({[key]:Number(e.currentTarget.value)})} onChange={props.commit}/></label>}</For>
  <label>Text colour<input aria-label="Text colour" type="color" value={props.value.color??'#262320'} onInput={e=>change({color:e.currentTarget.value})} onChange={props.commit}/></label>
  <label>Alignment<select aria-label="Text alignment" value={props.value.alignment??'start'} onChange={e=>immediate({alignment:e.currentTarget.value as QuillTypography['alignment']})}><For each={['start','center','end','justify']}>{align=><option>{align}</option>}</For></select></label>
  </Show><Show when={props.mode!=='text'}><h3>Transformations</h3><label>Add effect<select aria-label="Add typography effect" value="" onChange={e=>{const preset=effectPresets[e.currentTarget.value as keyof typeof effectPresets];if(preset)immediate({effects:[...props.value.effects??[],{...preset,id:'effect-'+crypto.randomUUID()}]});e.currentTarget.value='';}}><option value="">Choose transformation…</option><For each={Object.keys(effectPresets)}>{name=><option>{name}</option>}</For></select></label>
  <For each={props.value.effects??[]}>{e=><fieldset><legend>{e.kind} · {['size','tracking','weight'].includes(e.kind)?'layout':'visual'}</legend>
   <label><input type="checkbox" checked={e.enabled!==false} onChange={event=>{effect(e.id,{enabled:event.currentTarget.checked});props.commit();}}/>Enabled</label>
   <button onClick={()=>{const effects=[...props.value.effects??[]],i=effects.findIndex(v=>v.id===e.id);if(i>0){[effects[i-1],effects[i]]=[effects[i],effects[i-1]];immediate({effects});}}}>Move up</button><button onClick={()=>{const effects=[...props.value.effects??[]],i=effects.findIndex(v=>v.id===e.id);if(i<effects.length-1){[effects[i+1],effects[i]]=[effects[i],effects[i+1]];immediate({effects});}}}>Move down</button>
   <label>Strength<input aria-label={`${e.kind} strength`} type="range" min={e.kind==='size'?.1:e.kind==='weight'?100:e.kind==='opacity'||e.kind==='color'?0:-100} max={e.kind==='size'?3:e.kind==='weight'?900:e.kind==='opacity'||e.kind==='color'?1:100} step=".1" value={e.to} onInput={event=>effect(e.id,{to:Number(event.currentTarget.value)})} onChange={props.commit}/></label>
   <label>Envelope<select value={e.curve} onChange={event=>{effect(e.id,{curve:event.currentTarget.value as QuillEffect['curve']});props.commit();}}><option>linear</option><option>bell</option><option>sine</option></select></label>
   <For each={['from','to','cycles'] as const}>{field=><label>{field}<input aria-label={`${e.kind} ${field}`} type="number" step=".1" value={e[field]??1} onInput={event=>effect(e.id,{[field]:Number(event.currentTarget.value)})} onChange={props.commit}/></label>}</For>
   {e.kind==='color'?<><input aria-label="Gradient start colour" type="color" value={e.colorFrom??'#e7c88a'} onInput={event=>effect(e.id,{colorFrom:event.currentTarget.value})} onChange={props.commit}/><input aria-label="Gradient end colour" type="color" value={e.colorTo??'#b95164'} onInput={event=>effect(e.id,{colorTo:event.currentTarget.value})} onChange={props.commit}/></>:null}
   <button onClick={()=>immediate({effects:props.value.effects?.filter(v=>v.id!==e.id)})}>Remove {e.kind}</button>
  </fieldset>}</For>
 </Show></details>;
}
