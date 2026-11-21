import {useReactiveView} from '../../reactive-editor/context';
import {For,Show,createSignal,createMemo,onMount,onCleanup,createEffect} from 'solid-js';
import {Portal} from 'solid-js/web';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {QuillComposition,QuillLayer} from './model';
import {GeometrySession} from './geometry-session';
import {ornaments} from './ornaments';
import {sanitiseSvg} from './svg-sanitize.mjs';
import {studioFor,type QuillStudio} from './studio';
const apis=new WeakMap<Element,{add(kind:string):void;importFile(file:File):Promise<void>}>();
export const sceneFor=(element:Element)=>{const root=element.closest('.quill-composition');return root?apis.get(root):undefined;};
function ManagedImage(props:{editor:ReactiveEditor;layer:QuillLayer}){
 const [url,setUrl]=createSignal('');
 const asset=createMemo(()=>props.layer.asset,undefined,{equals:(a,b)=>a?.kind===b?.kind&&a?.cavernId===b?.cavernId&&a?.assetId===b?.assetId});
 createEffect(()=>{const image=new Image();image.onload=()=>setUrl(image.src);const release=props.editor.assets.bind(image,asset());onCleanup(()=>{image.onload=null;release();setUrl('');});});
 return <image href={url()} width={props.layer.width} height={props.layer.height} preserveAspectRatio="xMidYMid meet"/>;
}
function ImportedVector(props:{layer:QuillLayer}){
 const source=createMemo(()=>props.layer.svg??''),identity=createMemo(()=>props.layer.asset?.assetId),[url,setUrl]=createSignal(''),[error,setError]=createSignal('');
 createEffect(()=>{const text=source(),id=identity();let current=true;setUrl('');setError('');onCleanup(()=>{current=false;});
  void (async()=>{try{const safe=sanitiseSvg(text).svg,digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)),hash='sha256:'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==id)throw Error('SVG artwork identity does not match its embedded content.');if(current)setUrl('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(safe));}catch(e){if(current)setError((e as Error).message);}})();
 });
 return <><image href={url()} width={props.layer.width} height={props.layer.height} preserveAspectRatio="xMidYMid meet"/><Show when={error()}><text class="quill-import-error" x="4" y="18" font-size="12" fill="#a83232">{error()}</text></Show></>;
}

export function LayerGraphic(props:{layer:QuillLayer;editor:ReactiveEditor;prefix:string}){
 const l=()=>props.layer,gradient=()=>props.prefix+'-'+l().id;
 return <g data-quill-layer={l().id} transform={`translate(${l().x} ${l().y}) rotate(${l().rotation??0} ${l().width/2} ${l().height/2})`} opacity={l().opacity??1}>
  <Show when={l().kind==='solid'}><rect width={l().width} height={l().height} fill={l().color??'#211d28'}/></Show>
  <Show when={l().kind==='gradient'}><defs><linearGradient id={gradient()} x1="0" y1="0" x2="1" y2="1"><stop stop-color={l().color??'#211d28'}/><stop offset="1" stop-color={l().color2??'#594455'}/></linearGradient></defs><rect width={l().width} height={l().height} fill={`url(#${gradient()})`}/></Show>
  <Show when={l().kind==='image'}><ManagedImage editor={props.editor} layer={l()}/></Show><Show when={l().kind==='svg'}><ImportedVector layer={l()}/></Show>
  <Show when={l().kind==='ornament'}><g transform={`scale(${l().width/200} ${l().height/100})`} fill={ornaments[l().ornament??'flourish'].fill?l().color??'#b55a50':'none'} stroke={l().color??'#b55a50'} stroke-width="1.5"><path vector-effect="non-scaling-stroke" d={ornaments[l().ornament??'flourish'].path}/><Show when={l().ornament==='capital'}><text x="100" y="77" text-anchor="middle" font-family="Georgia,serif" font-size="76" fill={l().color??'#b55a50'} stroke="none">{l().letter??'Q'}</text></Show></g></Show>
 </g>;
}
export function CompositionLayers(props:{editor:ReactiveEditor;nodeKey:string;root:()=>HTMLElement;config:()=>QuillComposition}){
 const {activity}=useReactiveView();
 const [draft,setDraft]=createSignal<QuillComposition>(),[selected,setSelected]=createSignal<string>(),[notice,setNotice]=createSignal(''),[studio,setStudio]=createSignal<QuillStudio>();
 const shown=()=>draft()??props.config(),layer=()=>shown().layers?.find(l=>l.id===selected()),prefix='quill-layer-'+crypto.randomUUID();
 const session=new GeometrySession(props.config,c=>props.editor.commands.setPayloadField(props.nodeKey,'quill',c,'Edit Quill layers'));
 const preview=(config:QuillComposition)=>{try{setDraft(session.replace(config));return true;}catch(e){setNotice((e as Error).message);return false;}};
 const cancel=()=>{session.cancel();setDraft(undefined);};
 const commit=()=>{try{session.commit();setNotice('');return true;}catch(e){setNotice((e as Error).message);return false;}finally{setDraft(undefined);}};
 const patch=(change:Partial<QuillLayer>,force=false)=>{if(!layer()||layer()!.locked&&!force)return;preview({...shown(),layers:shown().layers?.map(l=>l.id===selected()?{...l,...change}:l)});};
 const add=(kind:string)=>{const c=props.config(),ornament=kind in ornaments?kind as keyof typeof ornaments:undefined,id='layer-'+crypto.randomUUID();const layer:QuillLayer={id,name:ornament?ornaments[ornament].label:kind==='solid'?'Solid background':'Gradient background',kind:ornament?'ornament':kind==='solid'?'solid':'gradient',x:ornament?30:0,y:ornament?30:0,width:ornament?260:c.viewport.width,height:ornament?100:c.viewport.height,color:ornament?'#b55a50':'#211d28',...(ornament?{ornament}:{color2:'#594455'})};if(!preview({...c,layers:[...c.layers??[],layer]})||!commit())return;setSelected(id);studio()?.setDockTab('layers');studio()?.setTool('arrange');};
 let alive=true,controller:AbortController|undefined;
 const importFile=async(file:File)=>{controller?.abort();controller=new AbortController();const signal=controller.signal,original=JSON.stringify(props.config());let lease:Awaited<ReturnType<ReactiveEditor['assets']['begin']>>|undefined,inserted=false;
  try{if(file.size>10*1024*1024)throw Error('Image exceeds 10 MB.');setNotice('Importing managed artwork…');const svg=file.type==='image/svg+xml'||file.name.toLowerCase().endsWith('.svg')?sanitiseSvg(await file.text()).svg:undefined;
   if(!svg&&!['image/png','image/jpeg'].includes(file.type))throw Error('Choose a PNG, JPEG or safe SVG.');lease=await props.editor.assets.begin([],signal);const asset=svg?await props.editor.assets.stageSvg(lease,new Blob([svg],{type:'image/svg+xml'}),signal):await props.editor.assets.stage(lease,file,signal);
   if(!alive||signal.aborted||JSON.stringify(props.config())!==original)throw Error('Composition changed; image import cancelled.');await props.editor.assets.action(lease,'publish',signal);if(!alive||signal.aborted||JSON.stringify(props.config())!==original)throw Error('Composition changed; image import cancelled.');
   const c=props.config(),id='layer-'+crypto.randomUUID(),item:QuillLayer={id,name:file.name.slice(0,120),kind:svg?'svg':'image',x:20,y:20,width:Math.max(1,Math.min(c.viewport.width-40,asset.width??300)),height:Math.max(1,Math.min(c.viewport.height-40,asset.height??200)),asset:{kind:'managed',cavernId:asset.cavernId,assetId:asset.assetId},...(svg?{svg}:{})};if(!preview({...c,layers:[...c.layers??[],item]})||!commit())throw Error('Image insertion cancelled.');inserted=true;setSelected(id);await props.editor.assets.action(lease,'finish',signal);setNotice('Managed artwork imported; Save Ink to persist the composition.');
  }catch(e){setNotice((e as Error).message);if(lease&&!inserted)await props.editor.assets.action(lease,'abort').catch(()=>{});}
 };
 let svg!:SVGSVGElement,gesture:{id:number;x:number;y:number;layer:QuillLayer}|undefined,frame=0,pending:{x:number;y:number}|undefined;
 const flush=()=>{frame=0;if(gesture&&pending){patch({x:gesture.layer.x+pending.x-gesture.x,y:gesture.layer.y+pending.y-gesture.y});pending=undefined;}};
 const point=(event:PointerEvent)=>{const m=svg.getScreenCTM();return m?new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse()):{x:event.clientX,y:event.clientY};};
 const start=(event:PointerEvent)=>{const id=(event.target as Element).closest('[data-quill-layer]')?.getAttribute('data-quill-layer'),l=shown().layers?.find(l=>l.id===id);if(!l||l.locked||!['select','arrange','ornament'].includes(studio()?.tool()??'arrange'))return;event.preventDefault();event.stopPropagation();setSelected(l.id);session.begin();const p=point(event);gesture={id:event.pointerId,x:p.x,y:p.y,layer:{...l}};svg.setPointerCapture(event.pointerId);};
 const end=()=>{if(!gesture)return;if(frame)cancelAnimationFrame(frame);flush();gesture=undefined;commit();};
 const reorder=(direction:number)=>{const layers=[...shown().layers??[]],i=layers.findIndex(l=>l.id===selected()),to=i+direction;if(i<0||to<0||to>=layers.length||layer()?.locked)return;[layers[i],layers[to]]=[layers[to],layers[i]];preview({...shown(),layers});commit();};
 const active=()=>{const host=studio();return !host||host.sources().some(s=>s.key===host.active()&&s.root.closest('.quill-composition')===props.root());};
 createEffect(()=>{activity?.();queueMicrotask(()=>{if(alive)setStudio(studioFor(props.root()));});});
 onMount(()=>{setStudio(studioFor(props.root()));apis.set(props.root(),{add,importFile});});onCleanup(()=>{alive=false;controller?.abort();if(frame)cancelAnimationFrame(frame);cancel();apis.delete(props.root());});
 const controls=()=> <div class="quill-layer-controls" onKeyDown={e=>{if(e.key==='Escape'){gesture=undefined;cancel();}}}>
  <Show when={!studio()||studio()!.dockTab()==='layers'}><div class="quill-layer-list"><strong>Text sources</strong><For each={studio()?.sources().filter(s=>s.root.closest('.quill-composition')===props.root())??[]}>{s=><button onClick={()=>studio()?.choose(s.key)}>{s.label}</button>}</For><strong>Artwork</strong><For each={shown().layers??[]}>{l=><button aria-pressed={selected()===l.id} onClick={()=>setSelected(l.id)}>{l.hidden?'○':'●'} {l.locked?'▣':''} {l.name}</button>}</For></div><Show when={layer()}>{l=><div class="quill-layer-properties"><strong>{l().name}</strong><Show when={l().ornament==='capital'}><label>Capital<input aria-label="Illuminated capital" maxLength={1} disabled={l().locked} value={l().letter??'Q'} onChange={e=>{patch({letter:e.currentTarget.value.toUpperCase()});commit();}}/></label></Show><label><input type="checkbox" checked={!l().hidden} onChange={e=>{patch({hidden:!e.currentTarget.checked},true);commit();}}/>Visible</label><label><input type="checkbox" checked={l().locked??false} onChange={e=>{patch({locked:e.currentTarget.checked},true);commit();}}/>Locked</label><For each={['x','y','width','height','rotation','opacity'] as const}>{field=><label>{field}<input aria-label={'Layer '+field} type="number" step={field==='opacity'?'.1':'1'} disabled={l().locked} value={l()[field]??(field==='opacity'?1:0)} onInput={e=>patch({[field]:Number(e.currentTarget.value)})} onChange={commit}/></label>}</For><input aria-label="Layer colour" type="color" disabled={l().locked} value={l().color??'#211d28'} onInput={e=>patch({color:e.currentTarget.value})} onChange={commit}/><Show when={l().kind==='gradient'}><input aria-label="Layer gradient end" type="color" disabled={l().locked} value={l().color2??'#594455'} onInput={e=>patch({color2:e.currentTarget.value})} onChange={commit}/></Show><button disabled={l().locked} onClick={()=>reorder(-1)}>Lower</button><button disabled={l().locked} onClick={()=>reorder(1)}>Raise</button><button disabled={l().locked} onClick={()=>{preview({...shown(),layers:shown().layers?.filter(v=>v.id!==selected())});commit();setSelected(undefined);}}>Remove layer</button></div>}</Show></Show>
  <Show when={!studio()||studio()!.dockTab()==='ornaments'}><div class="quill-preset-tiles"><For each={Object.entries(ornaments)}>{([id,o])=><button onClick={()=>add(id)}><svg viewBox="0 0 200 100" width="65" height="32" fill={o.fill?'currentColor':'none'} stroke="currentColor"><path d={o.path}/></svg>{o.label}</button>}</For></div></Show>
  <Show when={!studio()||studio()!.dockTab()==='assets'}><button onClick={()=>add('solid')}>Solid background</button><button onClick={()=>add('gradient')}>Gradient background</button><label>Import managed artwork<input aria-label="Import managed artwork" type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void importFile(file);e.currentTarget.value='';}}/></label></Show>
  <Show when={notice()}><p role="status">{notice()}</p></Show>
 </div>;
 return <><svg ref={svg} class="quill-artwork-background" data-layer-editing={['select','arrange','ornament'].includes(studio()?.tool()??'arrange')} viewBox={`0 0 ${shown().viewport.width} ${shown().viewport.height}`} aria-label="Authored composition layers" onPointerDown={start} onPointerMove={e=>{if(gesture?.id===e.pointerId){pending=point(e);if(!frame)frame=requestAnimationFrame(flush);}}} onPointerUp={end} onPointerCancel={()=>{gesture=undefined;cancel();}}><rect width="100%" height="100%" fill="#fffdf7"/><For each={shown().layers?.filter(l=>!l.hidden).map(l=>l.id)??[]}>{id=><LayerGraphic layer={shown().layers!.find(l=>l.id===id)!} editor={props.editor} prefix={prefix}/>}</For></svg>
  <Show when={studio()} fallback={<details class="quill-local-layers"><summary>Layers &amp; assets</summary>{controls()}</details>}>{host=><Show when={active()&&host().dockOpen()}><Portal mount={host().dock()}>{controls()}</Portal></Show>}</Show>
 </>;
}
