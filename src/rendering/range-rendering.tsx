import { batch, createMemo, createRenderEffect, createRoot, createSignal, For, onCleanup, untrack, type Accessor } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { characterSurfaceDefinition } from './static-character-surface';
import { immutable } from '../runtime/effect-contributions';
import type { AnnotationRangeEvents, AnnotationRangeEvent } from '../runtime/annotation-range-events';
import type { AnnotationHandlerContext, EffectGeometry, EffectParams, PropertyTypeDefinition, VisualEffectOwner, VisualEffectRegistry, VisualRenderer } from '../runtime/visual-effect-registry';
import type { VisualFragment } from './decorations';

/** Source adapters supply data only for event contexts. Reusable renderers never receive it. */
export interface RangeEffectSource {
  key:string;
  owner:VisualEffectOwner;
  start:number;
  end:number; // half-open, as with TextRangeSnapshot
  type:string;
  definition:PropertyTypeDefinition;
  data:object;
  index:number;
}
interface Binding {
  key:string;
  source:Accessor<RangeEffectSource>;
  renderer:VisualRenderer;
  params:Accessor<EffectParams>;
  layoutParams:Accessor<EffectParams>;
  geometry:Accessor<EffectGeometry>;
  setGeometry:(value:EffectGeometry)=>void;
}
interface Instance { source:Accessor<RangeEffectSource>; update:(source:RangeEffectSource)=>void; bindings:Accessor<Binding[]>; dispose:()=>void }
export interface ClassRun { start:number; classes:string }
export function classesAt(runs:readonly ClassRun[],index:number) {
  let lo=0,hi=runs.length;while(lo<hi){const mid=(lo+hi)>>>1;if(runs[mid].start<=index)lo=mid+1;else hi=mid;}
  return runs[lo-1]?.classes??'';
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Solid roots per source, not per character. Both sources use the same
 * renderer, event lifetime, composition and measured-fragment path. */
export function createRangeRendering(options:{
  sources:Accessor<RangeEffectSource[]>;
  registry:VisualEffectRegistry;
  events:AnnotationRangeEvents;
  nodeKey:string;
  eventsEnabled:boolean;
  visible?:(source:RangeEffectSource)=>boolean;
}) {
  const {registry,events,nodeKey}=options;
  const [instances,setInstances]=createSignal<Instance[]>([],{equals:(a,b)=>a.length===b.length&&a.every((item,index)=>item===b[index])});
  let live=true;
  const mounted=new Map<string,Instance>();
  const make=(initial:RangeEffectSource):Instance=>createRoot(dispose=>{
    const [source,update]=createSignal(initial);
    // Range rebasing does not change presentation configuration. In particular,
    // typing must not wake every SVG attribute or reconstruct binding lists.
    const configuration=createMemo(()=>{
      const s=source();return {base:s.definition,type:s.type,annotation:s.owner.kind==='annotation',metadata:(s.data as {metadata?:unknown}).metadata};
    },undefined,{equals:(a,b)=>!!a&&a.base===b.base&&a.type===b.type&&a.annotation===b.annotation&&a.metadata===b.metadata});
    // Read metadata within this memo, so a changed setting invalidates it but
    // offset rebasing does not repeatedly validate/serialize complete settings.
    const definition=createMemo(()=>{const c=configuration();return c.annotation?characterSurfaceDefinition({type:c.type,metadata:c.metadata},c.base):c.base;},undefined,{equals:(a,b)=>a===b||equal(a,b)});
    let releaseInteraction:(()=>void)|undefined;
    const stopInteraction=()=>{releaseInteraction?.();releaseInteraction=undefined;};
    const invoke=(event:AnnotationRangeEvent)=>{
      const current=source(),inside=event.type==='caret-in-range';
      stopInteraction();
      if(!current.definition.events?.[inside?'caret-enter':'caret-leave']?.length)return;
      // A new interaction root owns resources even when no leave handler exists.
      createRoot(release=>{
        releaseInteraction=release;
        const abort=new AbortController();onCleanup(()=>abort.abort());
        const owned=new Set<()=>void>();
        onCleanup(()=>{for(const cleanup of [...owned])cleanup();});
        const own=(cleanup:()=>void)=>{
          let active=true;
          const release=()=>{if(!active)return;active=false;owned.delete(release);try{cleanup();}catch(error){registry.report(`Range handler cleanup failed: ${error}`);}};
          if(abort.signal.aborted)release();else owned.add(release);
          return release;
        };
        const context:AnnotationHandlerContext=Object.freeze({
          event:inside?'caret-enter':'caret-leave',reason:event.reason??'caret',instance:current.owner.key,occurrence:nodeKey,
          source:immutable({kind:current.owner.kind==='annotation'?'annotation' as const:'temporary' as const,data:JSON.parse(JSON.stringify(current.data))}),
          previousState:Object.freeze({'caret-inside':!inside}),state:Object.freeze({'caret-inside':inside}),caret:event.caret,signal:abort.signal,own,
        });
        registry.invoke(current.definition.events?.[context.event],context);
        // Leave handlers are notifications, not a new long-lived active effect.
        if(!inside)stopInteraction();
      });
    };
    const handlers=createMemo(()=>Object.values(definition().events??{}).flatMap(names=>(names??[]).map(name=>({name,handler:registry.handler(name)}))),[],{
      equals:(a,b)=>a.length===b.length&&a.every((item,index)=>item.name===b[index].name&&item.handler===b[index].handler),
    });
    createRenderEffect(()=>{
      if(options.eventsEnabled&&handlers().length){
        onCleanup(events.watch(nodeKey,initial.key,invoke));
        onCleanup(stopInteraction);
      }
    });
    onCleanup(stopInteraction);
    const active=()=>options.eventsEnabled&&events.isActive(nodeKey,initial.key);
    const bindings=createMemo<Binding[]>(previous=>{
      const current=definition();
      return current.renderers.flatMap(binding=>{
        const renderer=registry.renderer(binding.name);
        if(!renderer){registry.report(`Unknown renderer ${binding.name}`);return [];}
        let lastDefinition:PropertyTypeDefinition|undefined,lastActive:boolean|undefined,lastParams:EffectParams;
        const params=()=>{
          const d=definition(),a=!!d.states?.['caret-inside']?.[binding.id]&&active();
          if(d!==lastDefinition||a!==lastActive){lastDefinition=d;lastActive=a;lastParams=registry.params(d,d.renderers.find(b=>b.id===binding.id)!,a);}
          return lastParams;
        };
        try{renderer.validate(untrack(params));}catch(error){registry.report(`Invalid renderer ${binding.name}: ${error}`);return [];}
        const retained=previous?.find(item=>item.key===binding.id&&item.renderer===renderer);
        if(retained)return [retained];
        const layoutParams=()=>{
          const config=definition(),current=config.renderers.find(b=>b.id===binding.id)!;
          const affectsLayout=renderer.target==='range-overlay'&&Object.values(config.states??{}).some(overrides=>
            Object.keys(overrides[binding.id]??{}).some(key=>renderer.layoutParams.includes(key)));
          // Paint-only transitions must not even invalidate the aggregate lane
          // layout memo; only the changed renderer's SVG attributes subscribe.
          return registry.params(config,current,affectsLayout&&active());
        };
        const [geometry,setGeometry]=createSignal<EffectGeometry>({fragments:[],offset:0},{equals:equal});
        return [{key:binding.id,source,renderer,params,layoutParams,geometry,setGeometry}];
      });
    },[]);
    return {source,update,bindings,dispose};
  });
  createRenderEffect(()=>{
    const sources=registry.alive()?options.sources():[];
    untrack(()=>batch(()=>{
      const keys=new Set(sources.map(s=>s.key));
      for(const [key,instance] of mounted)if(!keys.has(key)){instance.dispose();mounted.delete(key);}
      for(const source of sources){
        const old=mounted.get(source.key);
        if(old&&old.source().type===source.type&&old.source().owner.kind===source.owner.kind)old.update(source);
        else {old?.dispose();mounted.set(source.key,make(source));}
      }
      setInstances(sources.map(source=>mounted.get(source.key)!));
    }));
  });
  const bindings=createMemo(()=>instances().flatMap(instance=>instance.bindings()));
  const eventRanges=createMemo(()=>options.eventsEnabled?instances().filter(instance=>{
    const def=instance.source().definition;return !!Object.keys(def.states??{}).length||!!Object.keys(def.events??{}).length;
  }).map(instance=>{const s=instance.source();return {key:s.key,index:s.index,type:s.type,start:s.start,end:s.end-1,isZeroWidth:s.start===s.end};}):[],undefined,{equals:equal});
  const overlays=createMemo(()=>bindings().filter(binding=>binding.renderer.target==='range-overlay'&&binding.source().end>binding.source().start));
  // This memo excludes paint-only state. Caret opacity changes never schedule measurement.
  const layout=createMemo(()=>overlays().map(binding=>{
    const r=binding.renderer;if(r.target!=='range-overlay')return [];
    const source=binding.source(),p=binding.layoutParams();
    return [source.key,binding.key,source.start,source.end,...r.layoutParams.map(key=>p[key])];
  }),undefined,{equals:equal});
  const classRuns=(layoutOnly:boolean):ClassRun[]=>{
    const changes=new Map<number,{token:string;delta:number}[]>();
    for(const binding of bindings())if(binding.renderer.target==='cell-style'){
      if(layoutOnly&&binding.renderer.affectsLayout?.(binding.params())===false)continue;
      const {start,end}=binding.source();if(end<=start)continue;
      for(const token of new Set(binding.renderer.classes(binding.params()))){
        for(const [index,delta] of [[start,1],[end,-1]]){const list=changes.get(index)??[];list.push({token,delta});changes.set(index,list);}
      }
    }
    const counts=new Map<string,number>();return [...changes].sort(([a],[b])=>a-b).map(([start,entries])=>{
      for(const {token,delta} of entries){const n=(counts.get(token)??0)+delta;if(n)counts.set(token,n);else counts.delete(token);}
      return {start,classes:[...counts.keys()].sort().join(' ')};
    });
  };
  const classes=createMemo(()=>classRuns(false),[],{equals:equal});
  const layoutClasses=createMemo(()=>classRuns(true),[],{equals:equal});
  onCleanup(()=>{live=false;for(const instance of mounted.values())instance.dispose();mounted.clear();});
  return {
    overlays,classes,layoutClasses,layout,eventRanges,
    // Keep unavailable/invalid bindings represented: two owners must conflict
    // even when one has no ready artwork. Reuses the existing source lifetime.
    surfaces: createMemo(()=>instances().filter(instance=>instance.source().definition.renderers.some(b=>registry.renderer(b.name)?.target==='character-surface'))
      .map(instance=>({source:instance.source(),bindings:instance.bindings().filter(b=>b.renderer.target==='character-surface')}))),
    measure(fragments:(start:number,endInclusive:number)=>VisualFragment[],allocate:(start:number,endInclusive:number,height:number)=>number){
      if(!live||!registry.alive())return;
      const measured=overlays().map(binding=>{
        const renderer=binding.renderer;if(renderer.target!=='range-overlay')throw Error('Invalid overlay');
        const source=binding.source(),params=binding.params();
        return {binding,geometry:options.visible?.(source)===false?{fragments:[],offset:0}:{fragments:fragments(source.start,source.end-1),offset:allocate(source.start,source.end-1,renderer.laneHeight(params))}};
      });
      batch(()=>{for(const {binding,geometry} of measured)binding.setGeometry(immutable(geometry));});
    },
  };
}
export function RangeEffectLayer(props:{bindings:Binding[];class:string}) {
  return <svg class={props.class} aria-hidden="true"><For each={props.bindings}>{binding=><g data-property-type={binding.source().type} data-effect-owner={binding.source().owner.key}>
    {binding.renderer.target==='range-overlay'&&<Dynamic component={binding.renderer.View}
      tag={binding.source().type} identity={JSON.stringify([binding.source().key,binding.key])} owner={binding.source().owner} params={binding.params} geometry={binding.geometry} />}
  </g>}</For></svg>;
}
