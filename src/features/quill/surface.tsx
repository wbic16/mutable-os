import {sceneFor} from './layers';
import {QuillCompositionContext} from './composition-context';
import {addQuillSource} from '../../application/quill-operations';
import {TypographyPanel} from './typography-panel';
import {layoutTypography,effectPresets} from './effects';
import {Portal} from 'solid-js/web';
import {studioFor,type QuillStudio} from './studio';
import {quillTextFragment} from './clipboard';
import {inlineText} from '../../block-tree/inline-sequence';
import {SvgGlyphs} from './svg-glyphs';
import {GeometrySession,linkedWaves} from './geometry-session';
import type {QuillPath} from './model';
import {For,Show,useContext,createMemo,createSignal,createEffect,createRenderEffect,onMount,onCleanup,untrack} from 'solid-js';
import {useReactiveView} from '../../reactive-editor/context';
import type {QuillComposition} from './model';
import {sourceRole} from './model';
import {PathCache,pathPreset,freeformPath} from './geometry';
import {pathKinds,type PathKind} from './model';
import {acquireSourceMeasurer,type ShapeResult} from './measurement';
import {FlowEngine,VisualLayoutCache,caretAt,hitCaret,RangeGeometryCache} from './layout';
import {quillInput} from './input';
import {createRangeRendering,RangeEffectLayer,type RangeEffectSource} from '../../rendering/range-rendering';
import {observeFontLayout} from '../../rendering/font-layout';
import type {StandoffAnnotation} from '../../rendering/standoff-styles';
import {RelationBlocks,ChildBlocks} from '../../rendering/block-outlet';
import './surface.css';

export function QuillSurface(props:{nodeKey:string;compositionKey:string;onNative?:()=>void}){
 const artboard=useContext(QuillCompositionContext);
 const [studio,setStudio]=createSignal<QuillStudio>();
 const {editor,projection,activity}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey];
 const [sourceRevision,setSourceRevision]=createSignal(0);const sourceContent=node()!.contentKey;
 onCleanup(editor.repository.subscribeChanges(change=>{if(change.previousContents.has(sourceContent))setSourceRevision(n=>n+1);}));
 const release=untrack(()=>projection.acquireCompactInline(props.nodeKey));onCleanup(release);
 const composition=()=>projection.state.nodes[props.compositionKey].payload.quill as unknown as QuillComposition;
 const [tool,setTool]=createSignal<'text'|'path'>('text'),[selectedPath,setSelectedPath]=createSignal(composition().paths[0].id),[preview,setPreview]=createSignal<QuillComposition>();
 const presented=()=>preview()??composition();
 const role=createMemo(()=>((projection.state.nodes[props.compositionKey].payload.blockProperties??[]) as any[]).find(p=>p.value===node()?.payload.id&&sourceRole(p))?.metadata.quillRole);
 const currentFlow=createMemo(()=>presented().flows.find(f=>f.sourceRole===role())!);
 const typography=createMemo(()=>currentFlow().typography);
 const fontOptions=createMemo(()=>layoutTypography(typography()),undefined,{equals:(a,b)=>JSON.stringify(a)===JSON.stringify(b)});
 const flowOptions=createMemo(()=>({alignment:typography()?.alignment,indent:typography()?.indent}),undefined,{equals:(a,b)=>JSON.stringify(a)===JSON.stringify(b)});
 const previewTypography=(value:import('./model').QuillTypography)=>{try{const c=presented();setPreview(geometrySession.replace({...c,flows:c.flows.map(f=>f.sourceRole===role()?{...f,typography:value}:f)}));}catch(e){setMessage((e as Error).message);}};
 const geometrySession=new GeometrySession(composition,c=>editor.commands.setPayloadField(props.compositionKey,'quill',c,'Change Quill geometry'));
 const [drawing,setDrawing]=createSignal(false);let stroke:{id:number;origin:{x:number;y:number};nodes:Array<{x:number;y:number}>}|undefined;
 const [selectedNode,setSelectedNode]=createSignal(0),[snap,setSnap]=createSignal(false);
 const selected=createMemo(()=>presented().paths.find(p=>p.id===selectedPath()&&currentFlow().pathIds.includes(p.id))??presented().paths.find(p=>p.id===currentFlow().pathIds[0])!);
 const cancelGeometry=()=>{geometrySession.cancel();setPreview(undefined);};
 const commitGeometry=()=>{try{geometrySession.commit();}catch(e){setMessage((e as Error).message);}finally{setPreview(undefined);}};
 const changeGeometry=(change:Partial<QuillPath>,force=false)=>{if(selected().locked&&!force)return;if(change.width!==undefined&&selected().nodes&&!change.nodes){const ratio=change.width/selected().width;change={...change,nodes:selected().nodes!.map(n=>({...n,x:n.x*ratio,...(n.inX!==undefined?{inX:n.inX*ratio}:{}),...(n.outX!==undefined?{outX:n.outX*ratio}:{})}))};}try{setPreview(geometrySession.update(selected().id,change));}catch(e){setMessage((e as Error).message);}};
 const numeric=(field:keyof QuillPath,value:string)=>{const n=Number(value);if(Number.isFinite(n))changeGeometry({[field]:n});};
 const setKind=(kind:PathKind)=>{if(selected().locked)return;try{const c=composition();geometrySession.replace({...c,paths:c.paths.map(p=>p.id===selected().id?pathPreset(kind,p):p)});commitGeometry();}catch(e){setMessage((e as Error).message);}};
 const freeform=()=>{changeGeometry(freeformPath(selected()));commitGeometry();};
 const changeNode=(field:string,value:number)=>{const nodes=selected().nodes?.map((n,i)=>i===selectedNode()?{...n,[field]:value}:n);if(nodes)changeGeometry({nodes});};
 const addNode=()=>{const nodes=selected().nodes;if(!nodes)return;const i=Math.min(selectedNode(),nodes.length-1),a=nodes[i],b=nodes[i+1]??{x:a.x+40,y:a.y};changeGeometry({nodes:[...nodes.slice(0,i+1),{x:(a.x+b.x)/2,y:(a.y+b.y)/2},...nodes.slice(i+1)]});commitGeometry();setSelectedNode(i+1);};
 const removeNode=()=>{if((selected().nodes?.length??0)>2){changeGeometry({nodes:selected().nodes!.filter((_,i)=>i!==selectedNode())});commitGeometry();setSelectedNode(0);}};
 const generate=()=>{studio()?.setActive(props.nodeKey);studio()?.setInspectorTab('path');try{geometrySession.replace(linkedWaves(composition(),3,role()));commitGeometry();setSelectedPath(currentFlow().pathIds[0]);setTool('path');}catch(e){cancelGeometry();setMessage((e as Error).message);}};
 const addPath=()=>{const c=composition(),last=c.paths.find(p=>p.id===currentFlow().pathIds.at(-1))!;let id='path-'+(c.paths.length+1);while(c.paths.some(p=>p.id===id))id+='x';const path={...last,id,y:last.y+(c.pathSpacing??76)};try{geometrySession.replace({...c,paths:[...c.paths,path],flows:c.flows.map(f=>f.sourceRole===role()?{...f,pathIds:[...f.pathIds,id]}:f),viewport:{...c.viewport,height:Math.max(c.viewport.height,path.y+(path.amplitude??0)+40)}});commitGeometry();setSelectedPath(id);}catch(e){cancelGeometry();setMessage((e as Error).message);}};
 const spacing=(value:string)=>{const spacing=Number(value),c=presented();if(!Number.isFinite(spacing)||spacing<1)return;const ids=currentFlow().pathIds,first=c.paths.find(p=>p.id===ids[0])!.y;try{setPreview(geometrySession.replace({...c,pathSpacing:spacing,paths:c.paths.map(p=>ids.includes(p.id)?{...p,y:first+ids.indexOf(p.id)*spacing}:p),viewport:{...c.viewport,height:Math.max(c.viewport.height,first+(c.paths.length-1)*spacing+60)}}));}catch(e){setMessage((e as Error).message);}};
 const text=createMemo(()=>{sourceRevision();const n=node(),compact=editor.repository.readState().contents[sourceContent]?.compactInline;if(compact)return inlineText(compact.spans);return n?.inlineContent.map(k=>{const c=projection.state.nodes[k];return c?.viewType==='text-cell'?String(c.payload.text??''):'\ufffc';}).join('')??'';});
 const annotations=createMemo(()=>{sourceRevision();return ((editor.repository.readState().contents[sourceContent]?.payload.standoffProperties??[]) as any[]).map(p=>editor.linkedAnnotations.resolve(p,sourceContent) as StandoffAnnotation);});
 const inspectorTab=()=>studio()?.inspectorTab()??(tool()==='path'?'path':'text');
 const [message,setMessage]=createSignal(''),[fontEpoch,setFontEpoch]=createSignal(0),[focused,setFocused]=createSignal(false);
 const paths=new PathCache(),flow=new FlowEngine(),visualLayout=new VisualLayoutCache(),rangeGeometry=new RangeGeometryCache();let canvas:HTMLCanvasElement|undefined,context:CanvasRenderingContext2D|null|undefined;
 const measurer=acquireSourceMeasurer(editor,sourceContent,(text,font)=>{canvas??=document.createElement('canvas');context??=canvas.getContext('2d');if(!context)throw Error('Canvas text measurement is unavailable.');context.font=font;return context.measureText(text).width;});onCleanup(()=>measurer.release());
 const styleRuns=createMemo(()=>{
  const changes=new Map<number,{italic:number;bold:number}>();
  for(const a of annotations())if(!a.isDeleted&&(a.type==='style/italics'||a.type==='style/bold'))for(const [at,delta] of [[Number(a.start),1],[Number(a.end)+1,-1]]){const entry=changes.get(at)??{italic:0,bold:0};entry[a.type==='style/italics'?'italic':'bold']+=delta;changes.set(at,entry);}
  let italic=0,bold=0;return [...changes].sort(([a],[b])=>a-b).map(([start,d])=>{italic+=d.italic;bold+=d.bold;return {start,style:[italic>0?'italic':'',bold>0?'bold':''].filter(Boolean).join(' ')};});
 });
 const shape=createMemo<ShapeResult>(previous=>{fontEpoch();const runs=styleRuns();let cursor=-1;return measurer.shape(text(),i=>{while(cursor+1<runs.length&&runs[cursor+1].start<=i)cursor++;return runs[cursor]?.style??'';},previous,fontOptions(),JSON.stringify(runs));});
 const geometry=createMemo<import('./geometry').PathGeometry[]>(previous=>{
  const c=presented(),next=currentFlow().pathIds.map(id=>paths.get(c.paths.find(p=>p.id===id)!));return previous?.length===next.length&&previous.every((g,i)=>g===next[i])?previous:next;
 });
 const fitted=createMemo(()=>flow.layout(shape(),geometry(),flowOptions()));
 const layout=createMemo(()=>visualLayout.apply(fitted(),typography()));
 createEffect(()=>{const host=studio();if(host?.active()===props.nodeKey)host.setStatus(`${role()} · ${currentFlow().pathIds.length} paths · ${layout().length-layout().overflow} overflow`);});
 const input=quillInput(editor,props.nodeKey,layout,text,setMessage);
 let root!:HTMLDivElement,sink!:HTMLDivElement,svg!:SVGSVGElement,glyphRoot!:SVGGElement;let glyphs:SvgGlyphs|undefined;
 const primary=createMemo(()=>input.selection());
 const caret=createMemo(()=>caretAt(layout(),primary().head));
 const selectionRanges=editor.temporaryRanges.createCollection(`quill-selection:${props.nodeKey}`);onCleanup(()=>selectionRanges.dispose());
 createEffect(()=>{const s=primary();text();const start=Math.min(s.anchor,s.head),end=Math.min(layout().length,Math.max(s.anchor,s.head));untrack(()=>selectionRanges.replace(end>start?[{id:'selection',range:editor.textRanges.snapshot(props.nodeKey,start,end),renderers:[{id:'selection',name:'svg-highlight',params:{color:'#78a9ff',opacity:.3}}]}]:[]));});
 const sources=createMemo<RangeEffectSource[]>(()=>{
  const result:RangeEffectSource[]=[];
  annotations().forEach((a,index)=>{if(a.isDeleted||!Number.isInteger(a.start)||!Number.isInteger(a.end))return;const base=editor.visualEffects.type(a.type);if(!base)return;const definition=a.type==='mutable/gloss'?{...base,renderers:[...base.renderers,{id:'curve-marker',name:'svg-underline',params:{color:'#a36a16',offset:4}}]}:base;const key=`${props.nodeKey}:${a.id??index}`;result.push({key,owner:{kind:'annotation',key},start:Number(a.start),end:Number(a.end)+1,type:a.type!,definition,data:a,index});});
  for(const d of editor.decorations.nodes[props.nodeKey]??[]){
   if(d.range.coordinate!=='cell')continue;
   const base=d.temporary&&!d.temporary.renderers?editor.visualEffects.type(d.type):undefined;
   result.push({key:d.runtimeKey,owner:{kind:'session',key:d.runtimeKey},start:d.range.start,end:d.range.end,type:d.type,definition:{type:d.type,renderers:d.temporary?.renderers??base?.renderers??d.renderers,states:d.temporary?.states??base?.states,stateOrder:d.temporary?.stateOrder??base?.stateOrder,events:d.temporary?.events??base?.events},data:d.temporary??{id:d.id},index:result.length});
  }
  return result;
 });
 const rendering=createRangeRendering({registry:editor.visualEffects,events:editor.annotationEvents,nodeKey:props.nodeKey,eventsEnabled:editor.features.annotationRangeEvents,sources});
 createEffect(()=>{const l=layout();rendering.layout();untrack(()=>{editor.measurements.invalidateRanges(props.nodeKey);rendering.measure((start,end)=>rangeGeometry.local(l,start,end+1),()=>0);});});
 createEffect(()=>editor.annotationEvents.setRanges(props.nodeKey,rendering.eventRanges()));
 const point=(x:number,y:number)=>{const matrix=svg.getScreenCTM();if(!matrix)return {x,y};const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());return {x:p.x,y:p.y};};
 const viewportBoxes=(boxes:Array<{x:number;y:number;width:number;height:number}>)=>{const m=svg.getScreenCTM();if(!m)return [];return boxes.map(b=>{const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m)),xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);return new DOMRectReadOnly(Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));});};
 const inspectAnnotations=()=>{const s=primary(),start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head),properties=(node()?.payload.standoffProperties??[]) as StandoffAnnotation[],indexes=properties.flatMap((p,i)=>!p.isDeleted&&Number(p.start)<=(end===start?start:end-1)&&Number(p.end)>=start?[i]:[]),rect=viewportBoxes(rangeGeometry.get(layout(),start,Math.max(start+1,end)))[0]??root.getBoundingClientRect();editor.overlays.open({viewType:'annotation-panel',ownerKey:props.nodeKey,annotationIndexes:indexes,anchor:{x:rect.left,y:rect.bottom+5},title:'Annotations on path'});};
 const annotate=(type:string)=>{const s=primary(),start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head);if(start===end){setMessage('Select a word or range on the curve first.');return;}try{if(type==='style/italics')editor.rangeAnnotations.apply([editor.textRanges.snapshot(props.nodeKey,start,end)],type);else if(type==='mutable/gloss')editor.commandRegistry.execute('gloss.create',{targetKey:props.nodeKey,args:{selection:s}});else editor.annotationUI.get(type)?.apply([{nodeKey:props.nodeKey,start,end}],props.nodeKey);}catch(e){setMessage((e as Error).message);}};
 let drag:number|undefined,gesture:{id:number;handle:string;origin:{x:number;y:number};path:QuillPath}|undefined,moveFrame=0,pendingPoint:{x:number;y:number}|undefined;
 const flushGeometry=()=>{moveFrame=0;if(!gesture||!pendingPoint)return;const {path,origin,handle}=gesture;let p=pendingPoint;pendingPoint=undefined;if(path.locked)return;if(snap())p={x:Math.round(p.x/10)*10,y:Math.round(p.y/10)*10};
  if(handle.startsWith('node:')){const [,index,part]=handle.split(':');setSelectedNode(Number(index));const nodes=path.nodes!.map((n,i)=>i===Number(index)?{...n,...(part==='in'?{inX:p.x-path.x,inY:p.y-path.y}:part==='out'?{outX:p.x-path.x,outY:p.y-path.y}:{x:p.x-path.x,y:p.y-path.y})}:n);changeGeometry({nodes});return;}
  changeGeometry(handle==='position'?{x:path.x+p.x-origin.x,y:path.y+p.y-origin.y}:handle==='length'?{width:Math.max(1,path.width+p.x-origin.x)}:{amplitude:Math.max(0,(path.amplitude??0)+p.y-origin.y)});
 };
 const beginGeometry=(e:PointerEvent)=>{const target=e.target as Element,id=target.getAttribute('data-path-id');if(id)setSelectedPath(id);const handle=target.getAttribute('data-handle');if(handle){geometrySession.begin();gesture={id:e.pointerId,handle,origin:point(e.clientX,e.clientY),path:{...selected()}};svg.setPointerCapture(e.pointerId);}e.preventDefault();e.stopPropagation();};
 const pointer=(e:PointerEvent)=>{artboard?.setActive(props.nodeKey);studio()?.setActive(props.nodeKey);if(drawing()&&e.button===0&&!selected().locked){e.preventDefault();e.stopPropagation();const origin=point(e.clientX,e.clientY);geometrySession.begin();stroke={id:e.pointerId,origin,nodes:[{x:0,y:0},{x:1,y:0}]};changeGeometry({kind:'freehand',x:origin.x,y:origin.y,nodes:stroke.nodes});svg.setPointerCapture(e.pointerId);return;}if(tool()==='path'){beginGeometry(e);return;}if(e.button!==0||layout().diagnostic)return;e.preventDefault();e.stopPropagation();const p=point(e.clientX,e.clientY),hit=hitCaret(layout(),p.x,p.y);if(!hit)return;editor.focus.request(props.nodeKey,{reason:'quill-pointer'});input.select(e.shiftKey?primary().anchor:hit.index,hit.index);drag=e.pointerId;svg.setPointerCapture(e.pointerId);};
 const move=(e:PointerEvent)=>{if(stroke?.id===e.pointerId){const p=point(e.clientX,e.clientY),n={x:p.x-stroke.origin.x,y:p.y-stroke.origin.y},last=stroke.nodes.at(-1)!;if(stroke.nodes.length<256&&Math.hypot(n.x-last.x,n.y-last.y)>=4){stroke.nodes.push(n);if(!moveFrame)moveFrame=requestAnimationFrame(()=>{moveFrame=0;if(stroke)changeGeometry({nodes:[...stroke.nodes]});});}return;}if(gesture?.id===e.pointerId){pendingPoint=point(e.clientX,e.clientY);if(!moveFrame)moveFrame=requestAnimationFrame(flushGeometry);return;}if(drag!==e.pointerId)return;const p=point(e.clientX,e.clientY),hit=hitCaret(layout(),p.x,p.y);if(hit)input.select(primary().anchor,hit.index);};
 const stop=()=>{drag=undefined;if(stroke){if(moveFrame)cancelAnimationFrame(moveFrame);moveFrame=0;changeGeometry({nodes:[...stroke.nodes]});stroke=undefined;setDrawing(false);commitGeometry();}if(gesture){if(moveFrame)cancelAnimationFrame(moveFrame);flushGeometry();gesture=undefined;commitGeometry();}};
 const cancel=()=>{drag=undefined;stroke=undefined;setDrawing(false);gesture=undefined;if(moveFrame)cancelAnimationFrame(moveFrame);moveFrame=0;pendingPoint=undefined;cancelGeometry();};
 let releaseStudio:(()=>void)|undefined,alive=true;
 const attachStudio=()=>{const host=studioFor(root);if(host===untrack(studio))return;releaseStudio?.();releaseStudio=undefined;setStudio(host);if(host){releaseStudio=host.register(props.nodeKey,String(role()??'Text source'),root,(name,value)=>{if(name==='ornament'||name==='background'){sceneFor(root)?.add(value??'solid');}else if(name==='source'){addQuillSource(editor,props.compositionKey,value??'caption');}else if(name==='path'&&pathKinds.includes(value as PathKind)){setKind(value as PathKind);setTool('path');host.setInspectorTab('path');}else if(name==='effect'&&value&&value in effectPresets){previewTypography({...typography(),effects:[...typography()?.effects??[],{...effectPresets[value as keyof typeof effectPresets],id:'effect-'+crypto.randomUUID()}]});commitGeometry();host.setInspectorTab('effects');}});}};
 createEffect(()=>{activity?.();queueMicrotask(()=>{if(alive&&root)attachStudio();});});
 onCleanup(()=>{alive=false;releaseStudio?.();});
 onMount(()=>{
  if(artboard&&!artboard.active())artboard.setActive(props.nodeKey);

  glyphs=new SvgGlyphs(glyphRoot);createRenderEffect(()=>glyphs!.update(layout(),rendering.classes()));onCleanup(()=>glyphs?.dispose());
  Object.defineProperty(root,'quillDiagnostics',{value:()=>({measurements:measurer.measurements,pathBuilds:paths.builds,fragmentFits:flow.fits,rangeBuilds:rangeGeometry.builds,glyphWrites:glyphs?.writes??0})});
  onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:sink,inputPolicy:'standoff',focus:()=>sink.focus({preventScroll:true}),captureInlineSelection:input.selection,restoreInlineSelection:s=>input.select(s.anchor,s.head),captureText:text,
   prepareInlinePaste:quillTextFragment,
   interceptInlineInput:event=>{if(event instanceof KeyboardEvent&&event.key==='Escape'&&preview()){cancel();event.preventDefault();return true;}return event.target===sink?input.handle(event):false;},
   inlineRangeRects:(start,end)=>viewportBoxes(rangeGeometry.get(layout(),start,end)),
   inlineCaretRect:index=>{const c=caretAt(layout(),index);return c?viewportBoxes([{x:c.x,y:c.y-20,width:1,height:24}])[0]:undefined;},
   inlinePointAt:(x,y)=>{const p=point(x,y);return hitCaret(layout(),p.x,p.y)?.index??0;},
   invalidateInlineLayout:()=>setFontEpoch(n=>n+1),
  }));
  const refresh=()=>{measurer.invalidate();flow.clear();setFontEpoch(n=>n+1);};
  onCleanup(observeFontLayout(root,refresh));document.fonts?.addEventListener('loadingdone',refresh);onCleanup(()=>document.fonts?.removeEventListener('loadingdone',refresh));
 });
 onCleanup(()=>{cancel();paths.clear();flow.clear();rangeGeometry.clear();editor.measurements.invalidateRanges(props.nodeKey);editor.measurements.releaseCaret(props.nodeKey);editor.annotationEvents.remove(props.nodeKey);});
 const inspector=()=> (<><Show when={inspectorTab()==='text'||inspectorTab()==='effects'}><TypographyPanel mode={inspectorTab()==='effects'?'effects':'text'} expanded={!!studio()} value={typography()??{}} preview={previewTypography} commit={commitGeometry}/></Show><Show when={tool()==='path'&&inspectorTab()==='path'}><div class="quill-geometry-inspector" aria-label="Selected path geometry">
   <label>Path<select value={selected().id} onChange={e=>{cancelGeometry();setSelectedPath(e.currentTarget.value);}}><For each={presented().paths.filter(p=>currentFlow().pathIds.includes(p.id))}>{p=><option value={p.id}>{p.id}</option>}</For></select></label>
   <label>Shape<select value={selected().kind} onChange={e=>setKind(e.currentTarget.value as PathKind)}><For each={pathKinds}>{kind=><option value={kind}>{kind}</option>}</For></select></label>
   <For each={['x','y','width',...(selected().kind==='sine'?['amplitude','cycles','phase']:[]),...(['arc','ellipse','rectangle','polygon','spiral'].includes(selected().kind)?['height']:[]),...(selected().kind==='arc'?['startAngle','sweep']:[]),...(selected().kind==='polygon'?['sides']:[]),...(selected().kind==='spiral'?['turns']:[]),'offset'] as const}>{field=><label>{({x:'X',y:'Y',width:'Length',amplitude:'Amplitude',cycles:'Frequency',phase:'Phase'} as Record<string,string>)[field]??field}<input aria-label={field} type="number" step={field==='cycles'||field==='phase'?'.1':'1'} value={Number(selected()[field as keyof QuillPath]??0)} onInput={e=>numeric(field as keyof QuillPath,e.currentTarget.value)} onChange={commitGeometry}/></label>}</For>
   <label>Spacing<input aria-label="spacing" type="number" min="1" value={presented().pathSpacing??76} onInput={e=>spacing(e.currentTarget.value)} onChange={commitGeometry}/></label>
   <label><input type="checkbox" checked={snap()} onChange={e=>setSnap(e.currentTarget.checked)}/>Snap to 10-unit grid</label>
   <label><input type="checkbox" checked={selected().locked??false} onChange={e=>{changeGeometry({locked:e.currentTarget.checked},true);commitGeometry();}}/>Lock path</label><button onClick={()=>{changeGeometry({reverse:!selected().reverse});commitGeometry();}}>Reverse path</button><button onClick={freeform}>Convert to Freeform</button><button disabled={selected().locked} aria-pressed={drawing()} onClick={()=>{cancel();setDrawing(true);}}>Draw freehand</button>
   <Show when={selected().nodes}><label>Node<select aria-label="Selected control point" value={selectedNode()} onChange={e=>setSelectedNode(Number(e.currentTarget.value))}><For each={selected().nodes}>{(_,i)=><option value={i()}>{i()+1}</option>}</For></select></label><For each={selected().kind==='bezier'?['x','y','inX','inY','outX','outY']:['x','y']}>{field=><label>Node {field}<input aria-label={'Node '+field} type="number" value={Number((selected().nodes?.[selectedNode()] as any)?.[field]??0)} onInput={e=>changeNode(field,Number(e.currentTarget.value))} onChange={commitGeometry}/></label>}</For><button onClick={addNode}>Add node</button><button disabled={(selected().nodes?.length??0)<=2} onClick={removeNode}>Remove node</button></Show>
   <button disabled={!preview()} onClick={cancel}>Cancel preview</button>
  </div></Show><Show when={inspectorTab()==='layout'}><section class="quill-layout-inspector"><h3>Artboard</h3><For each={['width','height'] as const}>{field=><label>{field}<input type="number" aria-label={'Artboard '+field} value={presented().viewport[field]} onInput={e=>{try{const c=presented();setPreview(geometrySession.replace({...c,viewport:{...c.viewport,[field]:Number(e.currentTarget.value)}}));}catch(error){setMessage((error as Error).message);}}} onChange={commitGeometry}/></label>}</For><h3>Align selected path</h3><For each={['left','center','right']}>{align=><button onClick={()=>{changeGeometry({x:align==='left'?0:align==='right'?presented().viewport.width-selected().width:(presented().viewport.width-selected().width)/2});commitGeometry();}}>{align}</button>}</For><h3>Flow order</h3><For each={currentFlow().pathIds}>{(id,index)=><div>{id}<button disabled={index()===0} onClick={()=>{const c=presented(),ids=[...currentFlow().pathIds],i=index();[ids[i],ids[i-1]]=[ids[i-1],ids[i]];setPreview(geometrySession.replace({...c,flows:c.flows.map(f=>f.sourceRole===role()?{...f,pathIds:ids}:f)}));commitGeometry();}}>Earlier</button></div>}</For></section></Show>
   <Show when={inspectorTab()==='semantics'}><section><h3>Native semantics</h3><p>Source: {String(node()?.payload.id)} · range {Math.min(primary().anchor,primary().head)}–{Math.max(primary().anchor,primary().head)}</p><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('codex/entity-reference')}>Entity</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('mutable/gloss')}>Gloss</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('style/italics')}>Italic</button><button onClick={inspectAnnotations}>Inspect annotations</button><p>Text and annotations retain their native logical reading order.</p></section></Show></>);
 return <div ref={root} class="quill-text-surface" classList={{'quill-source-active':!artboard||artboard.active()===props.nodeKey}} data-quill-active={studio()?.active()===props.nodeKey} onPointerDown={()=>{attachStudio();studio()?.setActive(props.nodeKey);}} onFocusIn={()=>{artboard?.setActive(props.nodeKey);studio()?.setActive(props.nodeKey);}} onKeyDown={e=>{if(e.key==='Escape'){cancel();e.preventDefault();}}} data-runtime-key={props.nodeKey} data-block-id={String(node()?.payload.id)} data-block-type="standoff-editor-block">
  <div class="quill-text-tools"><button aria-pressed={tool()==='text'} onClick={()=>{cancel();setTool('text');studio()?.setInspectorTab('text');}}>Text</button><button aria-pressed={tool()==='path'} onClick={()=>{setTool('path');studio()?.setInspectorTab('path');}}>Paths</button><button onClick={generate}>Three linked waves</button><button onClick={addPath}>Add linked path</button><span>{drawing()?'Draw a stroke on the artboard':'Text on paths'}</span><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('style/italics')}>Italic</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('codex/entity-reference')}>Entity</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('mutable/gloss')}>Gloss</button><button onPointerDown={e=>e.preventDefault()} onClick={inspectAnnotations}>Annotations</button><button data-quill-fallback onClick={()=>props.onNative?.()}>Native text</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>{cancel();editor.repository.undo();}}>Undo</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>{cancel();editor.repository.redo();}}>Redo</button></div>
  <Show when={studio()} fallback={inspector()}>{host=><Show when={host().active()===props.nodeKey}><Portal mount={host().inspector()}>{inspector()}</Portal></Show>}</Show>
  <div class="quill-artboard" style={{'aspect-ratio':`${presented().viewport.width}/${presented().viewport.height}`}}>
   <svg ref={svg} class="quill-canvas" data-path-editing={tool()==='path'&&(!artboard||artboard.active()===props.nodeKey)} viewBox={`0 0 ${presented().viewport.width} ${presented().viewport.height}`} onPointerDown={pointer} onPointerMove={move} onPointerUp={stop} onPointerCancel={cancel} onLostPointerCapture={()=>{if(gesture)cancel();}} aria-label="Editable text on paths">
    <For each={geometry()}>{(g,i)=><path class="quill-guide" classList={{'quill-guide-selected':tool()==='path'&&currentFlow().pathIds[i()]===selected().id}} data-path-id={currentFlow().pathIds[i()]} d={g.d}/>}</For>
    <g ref={glyphRoot} class="quill-glyphs"/>
    <Show when={tool()==='path'&&(!artboard||artboard.active()===props.nodeKey)}><g class="quill-handles">
     <circle data-handle="position" cx={selected().x} cy={selected().y} r="7"><title>Drag path position</title></circle>
     <circle data-handle="length" cx={selected().x+selected().width} cy={selected().y} r="7"><title>Drag path length</title></circle>
     <Show when={selected().kind==='sine'}><circle data-handle="amplitude" cx={selected().x+selected().width/4} cy={selected().y+(selected().amplitude??0)} r="7"><title>Drag amplitude</title></circle></Show>
     <For each={selected().nodes}>{(n,i)=><g><Show when={selected().kind==='bezier'}><path d={`M${selected().x+(n.inX??n.x)} ${selected().y+(n.inY??n.y)} L${selected().x+n.x} ${selected().y+n.y} L${selected().x+(n.outX??n.x)} ${selected().y+(n.outY??n.y)}`} fill="none" stroke="#799cc5"/><circle data-handle={`node:${i()}:in`} cx={selected().x+(n.inX??n.x)} cy={selected().y+(n.inY??n.y)} r="4"/><circle data-handle={`node:${i()}:out`} cx={selected().x+(n.outX??n.x)} cy={selected().y+(n.outY??n.y)} r="4"/></Show><circle data-handle={`node:${i()}:point`} cx={selected().x+n.x} cy={selected().y+n.y} r="6"/></g>}</For>
    </g></Show>
    <Show when={focused()&&primary().anchor===primary().head&&caret()}>{c=><path class="quill-caret" transform={`translate(${c().x} ${c().y}) rotate(${c().angle})`} d="M0,-20 V4"/>}</Show>
   </svg>
   <RangeEffectLayer class="quill-range-effects" viewBox={`0 0 ${presented().viewport.width} ${presented().viewport.height}`} bindings={rendering.overlays()}/>
   <div ref={sink} class="quill-input-sink" contentEditable={true} role="textbox" aria-label="Quill path text input" aria-multiline="true" aria-describedby={'quill-logical-'+props.nodeKey} spellcheck={false} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}/>
  </div>
  <span id={'quill-logical-'+props.nodeKey} class="quill-logical-text">{text()}</span><Show when={layout().diagnostic}><p role="status">{layout().diagnostic}</p><pre class="quill-preserved-text">{text()}</pre></Show>
  <Show when={!layout().diagnostic&&layout().overflow<layout().length}><p role="status" class="quill-overflow">{layout().length-layout().overflow} characters overflow the final path. Add paths or increase their length. Text is retained. {primary().head>layout().overflow?`Caret is in overflow at position ${primary().head}.`:''}</p></Show>
  <Show when={message()}><p role="status">{message()}</p></Show>
  <RelationBlocks parentKey={props.nodeKey}/><ChildBlocks parentKey={props.nodeKey}/>
 </div>;
}
