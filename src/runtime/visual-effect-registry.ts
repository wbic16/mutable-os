import { createSignal, type Accessor, type Component } from 'solid-js';
import type { VisualFragment } from '../rendering/decorations';
import { immutable } from './effect-contributions';
import type { FocusRegion } from './focus-region';

/** One source-neutral presentation renderer per session, not per cell/Block. */
export interface TextPresentationEffect {
  attach(flow: HTMLElement): () => void;
  focus(flow: HTMLElement | undefined, region: FocusRegion | undefined, frame?: PresentationFrame): void;
}
export interface PresentationFrame {
  readonly scope: HTMLElement;
  readonly scale: number;
  /** Changes after reflow/resize, not ordinary caret movement or outer scrolling. */
  readonly layoutRevision: number;
}

/** One viewport decoration, independent of text ranges or persisted properties. */
export interface ViewportPresentationFrame {
  readonly point: { readonly x: number; readonly y: number };
  /** Clipped bounds and pointer in host-local CSS pixels. */
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly scale: number;
}
export interface ViewportPresentationEffect { update(frame?: ViewportPresentationFrame): void }

function frozen<T>(value:T):T { (immutable as (value:unknown)=>unknown)(value); return value; }

export type Json = null | boolean | number | string | Json[] | { [key:string]: Json };
export type EffectParams = Readonly<Record<string, Json>>;
/** Opaque lifetime identity. Renderers do not depend on canonical annotations. */
export interface VisualEffectOwner { readonly kind:'annotation'|'session'; readonly key:string }
export interface EffectGeometry { readonly fragments:readonly Readonly<VisualFragment>[]; readonly offset:number }
export interface VisualEffectProps {
  identity:string;
  /** Optional diagnostic label; not a canonical source dependency. */
  tag?:string;
  owner:VisualEffectOwner;
  params:Accessor<EffectParams>;
  geometry:Accessor<EffectGeometry>;
}
export interface CharacterSurface { readonly image: string; readonly width: number; readonly height: number }
export interface CharacterSurfacePresentation {visibility:'visible'|'nearby'|'offscreen';pixelRatio:number}
/** Owned asynchronous readiness. A renderer must release its work on abort;
 * callbacks never author content or invalidate unrelated range bindings. */
export interface CharacterSurfaceReadiness {
  signal:AbortSignal;
  presentation:CharacterSurfacePresentation;
  ready(surface:CharacterSurface|undefined):void;
  observe(listener:(state:CharacterSurfacePresentation)=>void):()=>void;
}
export type VisualRenderer = {
  name:string; defaults:EffectParams;
  validate(params:EffectParams):void;
} & ({ target:'range-overlay'; layoutParams:readonly string[]; laneHeight(params:EffectParams):number; View:Component<VisualEffectProps> }
  | { target:'character-surface'; surface(text:string, params:EffectParams, document:Document, readiness?:CharacterSurfaceReadiness):CharacterSurface|undefined }
  | { target:'cell-style'; classes(params:EffectParams):readonly string[]; affectsLayout?(params:EffectParams):boolean }
  | { target:'text-presentation'; focusKinds: readonly FocusRegion['kind'][];
      /** Called within a Solid root; own resources with onCleanup. */
      create(context: { owner: VisualEffectOwner; params: EffectParams; document: Document }): TextPresentationEffect }
  | { target:'viewport-presentation';
      create(context: { owner: VisualEffectOwner; params: EffectParams; document: Document; host: HTMLElement }): ViewportPresentationEffect });
export interface RendererBinding { readonly id:string; readonly name:string; readonly params?:EffectParams }
export type CaretTransition = 'caret-enter'|'caret-leave';
export interface PropertyTypeDefinition {
  readonly type:string;
  readonly renderers:readonly RendererBinding[];
  readonly stateOrder?:readonly string[];
  readonly states?:Readonly<Record<string,Readonly<Record<string,EffectParams>>>>;
  readonly events?:Partial<Record<CaretTransition,readonly string[]>>;
}
export interface AnnotationHandlerContext {
  readonly event:CaretTransition;
  readonly reason:string;
  readonly instance:string;
  readonly occurrence:string;
  readonly documentId?:string;
  readonly source: Readonly<{kind:'annotation'; data:Readonly<Record<string,unknown>>}> | Readonly<{kind:'temporary'; data:Readonly<Record<string,unknown>>}>;
  readonly previousState:Readonly<{ 'caret-inside':boolean }>;
  readonly state:Readonly<{ 'caret-inside':boolean }>;
  readonly caret?:number;
  readonly signal:AbortSignal;
  /** Binds application effects to this interaction, including late async results. */
  own(dispose:()=>void):()=>void;
}
export type AnnotationHandler = (context:AnnotationHandlerContext)=>void|Promise<void>;

function json(value:unknown, seen=new Set<object>()):void {
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(typeof value!=='object'||seen.has(value))throw Error('Property definitions must be finite JSON data');
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)throw Error('Property definitions must use plain JSON objects');
  seen.add(value);for(const item of Object.values(value))json(item,seen);seen.delete(value);
}
export { json as validateEffectJson };
export class VisualEffectRegistry {
  private renderers=new Map<string,VisualRenderer>();
  private types=new Map<string,PropertyTypeDefinition>();
  private handlers=new Map<string,AnnotationHandler>();
  private changed=createSignal(0);
  private living=createSignal(true);
  private diagnostics=new Set<string>();
  alive=()=>this.living[0]();
  private assertLive(){if(!this.alive())throw Error('Rendering registry is disposed');}
  private touch(){this.changed[1](n=>n+1);}
  registerRenderer(definition:VisualRenderer){
    this.assertLive();if(this.renderers.has(definition.name))throw Error(`Renderer ${definition.name} already registered`);
    if(!definition.name||!['range-overlay','cell-style','character-surface','text-presentation','viewport-presentation'].includes(definition.target))throw Error('Unsupported renderer target');
    json(definition.defaults);definition.validate(definition.defaults);
    const entry=Object.freeze({...definition,...(definition.target==='range-overlay'?{layoutParams:Object.freeze([...definition.layoutParams])}:{}),...(definition.target==='text-presentation'?{focusKinds:Object.freeze([...definition.focusKinds])}:{}),defaults:frozen(structuredClone(definition.defaults))}) as VisualRenderer;
    this.renderers.set(entry.name,entry);this.touch();
    return ()=>{if(this.renderers.get(entry.name)!==entry)return;this.renderers.delete(entry.name);this.touch();};
  }
  registerType(definition:PropertyTypeDefinition){
    this.assertLive();if(this.types.has(definition.type))throw Error(`Property type ${definition.type} already registered`);
    const order=this.validateType(definition);
    const entry=frozen(structuredClone({...definition,stateOrder:order}));this.types.set(entry.type,entry);this.touch();
    return ()=>{if(this.types.get(entry.type)!==entry)return;this.types.delete(entry.type);this.touch();};
  }
  validateType(definition:PropertyTypeDefinition) {
    json(definition);if(!definition.type||!Array.isArray(definition.renderers))throw Error('Invalid property type');
    const ids=new Set<string>();
    for(const binding of definition.renderers){
      if(!binding.id||ids.has(binding.id))throw Error('Renderer binding IDs must be unique');ids.add(binding.id);
      const renderer=this.renderers.get(binding.name);if(!renderer)throw Error(`Unknown renderer ${binding.name}`);
      if(renderer.target==='text-presentation'||renderer.target==='viewport-presentation')throw Error('Text presentation effects require a presentation host');
      renderer.validate({...renderer.defaults,...binding.params});
    }
    const order=definition.stateOrder??Object.keys(definition.states??{});
    if(new Set(order).size!==order.length||order.some(s=>s!=='caret-inside')||Object.keys(definition.states??{}).some(s=>!order.includes(s)))throw Error('Unsupported or unordered interaction state');
    for(const overrides of Object.values(definition.states??{}))for(const [id,params] of Object.entries(overrides)){
      const binding=definition.renderers.find(b=>b.id===id);if(!binding)throw Error(`Unknown renderer binding ${id}`);
      const renderer=this.renderers.get(binding.name)!;renderer.validate({...renderer.defaults,...binding.params,...params});
    }
    if(Object.keys(definition.events??{}).some(e=>!['caret-enter','caret-leave'].includes(e))||Object.values(definition.events??{}).some(names=>!Array.isArray(names)||names.some(n=>typeof n!=='string'||!n)))throw Error('Unsupported annotation event or handler reference');
    return order;
  }
  registerHandler(name:string,handler:AnnotationHandler){
    this.assertLive();if(!name||this.handlers.has(name))throw Error(`Handler ${name} already registered`);
    this.handlers.set(name,handler);this.touch();return ()=>{if(this.handlers.get(name)===handler){this.handlers.delete(name);this.touch();}};
  }
  type(name?:string){this.changed[0]();return this.alive()&&name?this.types.get(name):undefined;}
  renderer(name:string){this.changed[0]();return this.alive()?this.renderers.get(name):undefined;}
  handler(name:string){this.changed[0]();return this.alive()?this.handlers.get(name):undefined;}
  params(type:PropertyTypeDefinition,binding:RendererBinding,active:boolean):EffectParams {
    const renderer=this.renderer(binding.name);const result={...renderer?.defaults,...binding.params};
    if(active)for(const state of type.stateOrder??[])Object.assign(result,type.states?.[state]?.[binding.id]);
    return result;
  }
  invoke(names:readonly string[]|undefined,context:AnnotationHandlerContext){
    if(!this.alive())return;
    for(const name of names??[]){
      if(context.signal.aborted||!this.alive())break;
      const handler=this.handlers.get(name);if(!handler){this.report(`Unknown annotation handler ${name}`);continue;}
      try{Promise.resolve(handler(context)).catch(error=>{if(!context.signal.aborted)this.report(`Annotation handler ${name} failed: ${error}`);});}
      catch(error){this.report(`Annotation handler ${name} failed: ${error}`);}
    }
  }
  report(message:string){if(this.diagnostics.has(message))return;this.diagnostics.add(message);console.error(message);}
  dispose(){if(!this.alive())return;this.living[1](false);this.types.clear();this.renderers.clear();this.handlers.clear();}
}
