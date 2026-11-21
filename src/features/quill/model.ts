/** Native, versioned composition data. Text and annotations live only in owned TextBlocks. */
export const QUILL_TYPE = 'mutable/svg-text-composition-block';
export const QUILL_APP = 'quill-application-block';
export const SOURCE_REFERENCE = 'codex/block-reference';
export const pathKinds=['line','sine','arc','circle','ellipse','rectangle','polygon','spiral','bezier','freehand'] as const;
export type PathKind=typeof pathKinds[number];
export interface PathNode {x:number;y:number;inX?:number;inY?:number;outX?:number;outY?:number}
export interface QuillPath {
  id: string; kind: PathKind; x: number; y: number; width: number;
  amplitude?: number; cycles?: number; phase?: number; height?:number;
  startAngle?:number; sweep?:number; sides?:number; turns?:number;
  nodes?:PathNode[]; reverse?:boolean; offset?:number; locked?:boolean; hidden?:boolean;
}
export interface QuillEffect {id:string;enabled?:boolean;kind:'size'|'tracking'|'rotation'|'baseline'|'opacity'|'color'|'weight';curve:'linear'|'sine'|'bell';from:number;to:number;cycles?:number;colorFrom?:string;colorTo?:string}
export interface QuillTypography {family?:string;size?:number;weight?:number;italic?:boolean;color?:string;tracking?:number;alignment?:'start'|'center'|'end'|'justify';indent?:number;effects?:QuillEffect[]}
export interface QuillLayer {id:string;name:string;kind:'solid'|'gradient'|'ornament'|'image'|'svg';x:number;y:number;width:number;height:number;rotation?:number;opacity?:number;color?:string;color2?:string;hidden?:boolean;locked?:boolean;ornament?:'flourish'|'divider'|'border'|'leaf'|'raven'|'capital';letter?:string;asset?:{kind:'managed';cavernId:string;assetId:string};svg?:string}
export interface QuillFlow {id:string;sourceRole:string;pathIds:string[];typography?:QuillTypography}

export interface QuillComposition {
  version: 1;
  pathSpacing?: number;
  viewport: { width: number; height: number };
  sources: { role: string }[];
  paths: QuillPath[];
  flows: QuillFlow[];
  layers?:QuillLayer[];
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, any>, names: string[]) => Object.keys(v).every(k => names.includes(k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v);
const number = (v: unknown, min = -100000, max = 100000): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const unique = (items: string[]) => new Set(items).size === items.length;

/** Strict admission for this version. Future versions retain native children but are not activated. */
export function validQuill(value: unknown): value is QuillComposition {
  if (!object(value) || !keys(value, ['version','viewport','sources','paths','flows','pathSpacing','layers']) || value.version !== 1 || (value.pathSpacing !== undefined && !number(value.pathSpacing,1,100000))) return false;
  const { viewport, sources, paths, flows } = value;
  if (!object(viewport) || !keys(viewport,['width','height']) || !number(viewport.width,1) || !number(viewport.height,1)) return false;
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 64 || !sources.every(s => object(s) && keys(s,['role']) && id(s.role)) || !unique(sources.map(s => s.role))) return false;
  if (!Array.isArray(paths) || paths.length<1 || paths.length>256 || !paths.every(validPath) || !unique(paths.map(p=>p.id))) return false;
  if (!Array.isArray(flows) || flows.length < 1 || flows.length > 64 || !flows.every(f => object(f) && keys(f,['id','sourceRole','pathIds','typography']) && (f.typography===undefined || validTypography(f.typography)) && id(f.id) && sources.some(s => s.role === f.sourceRole) && Array.isArray(f.pathIds) && f.pathIds.length > 0 && f.pathIds.length <= 256 && unique(f.pathIds) && f.pathIds.every((p: unknown) => paths.some(path => path.id === p))) || !unique(flows.map(f => f.id)) || !unique(flows.map(f => f.sourceRole))) return false;
  if(value.layers!==undefined && (!Array.isArray(value.layers)||value.layers.length>128||!value.layers.every(validLayer)||!unique(value.layers.map(l=>l.id))))return false;
  return sources.every(s => flows.some(f => f.sourceRole === s.role));
}
export function defaultComposition(): QuillComposition {
  return { version: 1, viewport: {width:760,height:240}, sources:[{role:'body'}],
    paths:[{id:'baseline',kind:'line',x:20,y:40,width:720}], flows:[{id:'body',sourceRole:'body',pathIds:['baseline']}] };
}
export function sourceRole(property: unknown): string | undefined {
  if (!object(property) || property.type !== SOURCE_REFERENCE || !object(property.metadata) || !id(property.metadata.quillRole)) return;
  return property.metadata.quillRole;
}

const optional=(value:unknown,test:(v:any)=>boolean)=>value===undefined||test(value);
const boolean=(v:unknown)=>typeof v==='boolean';
export const colour=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
export function validPath(p:unknown):p is QuillPath {
 if(!object(p)||!keys(p,['id','kind','x','y','width','amplitude','cycles','phase','height','startAngle','sweep','sides','turns','nodes','reverse','offset','locked','hidden'])||!id(p.id)||!pathKinds.includes(p.kind)||!number(p.x)||!number(p.y)||!number(p.width,1))return false;
 if(!optional(p.height,v=>number(v,1))||!optional(p.startAngle,v=>number(v,-3600,3600))||!optional(p.sweep,v=>number(v,-3600,3600))||!optional(p.sides,v=>Number.isInteger(v)&&number(v,3,64))||!optional(p.turns,v=>number(v,.1,30))||!optional(p.reverse,boolean)||!optional(p.hidden,boolean)||!optional(p.locked,boolean)||!optional(p.offset,v=>number(v,-1000,1000)))return false;
 if(p.kind==='line' && [p.amplitude,p.cycles,p.phase].some(v=>v!==undefined))return false;
 if(p.kind==='sine' && (!number(p.amplitude,0)||!number(p.cycles,0,100)||!optional(p.phase,v=>number(v,-Math.PI*2,Math.PI*2))))return false;
 if(!optional(p.amplitude,v=>number(v,0))||!optional(p.cycles,v=>number(v,0,100))||!optional(p.phase,v=>number(v,-Math.PI*2,Math.PI*2)))return false;
 if(p.nodes!==undefined && (!Array.isArray(p.nodes)||p.nodes.length<2||p.nodes.length>256||!p.nodes.every(n=>object(n)&&keys(n,['x','y','inX','inY','outX','outY'])&&number(n.x)&&number(n.y)&&['inX','inY','outX','outY'].every(k=>optional(n[k],number)))))return false;
 return !['bezier','freehand'].includes(p.kind)||!!p.nodes;
}
export function validTypography(t:unknown):t is QuillTypography {
 if(!object(t)||!keys(t,['family','size','weight','italic','color','tracking','alignment','indent','effects']))return false;
 if(!optional(t.family,v=>typeof v==='string'&&/^[a-zA-Z0-9 ,'-]{1,100}$/.test(v))||!optional(t.size,v=>number(v,6,200))||!optional(t.weight,v=>number(v,100,900))||!optional(t.italic,boolean)||!optional(t.color,colour)||!optional(t.tracking,v=>number(v,-10,100))||!optional(t.indent,v=>number(v,0,1000))||!optional(t.alignment,v=>['start','center','end','justify'].includes(v)))return false;
 return t.effects===undefined||Array.isArray(t.effects)&&t.effects.length<=16&&unique(t.effects.map(e=>e.id))&&t.effects.every(e=>object(e)&&keys(e,['id','enabled','kind','curve','from','to','cycles','colorFrom','colorTo'])&&id(e.id)&&optional(e.enabled,boolean)&&['size','tracking','rotation','baseline','opacity','color','weight'].includes(e.kind)&&['linear','sine','bell'].includes(e.curve)&&number(e.from,-1000,1000)&&number(e.to,-1000,1000)&&optional(e.cycles,v=>number(v,0,50))&&optional(e.colorFrom,colour)&&optional(e.colorTo,colour));
}
export function validLayer(l:unknown):l is QuillLayer {
 if(!object(l)||!keys(l,['id','name','kind','x','y','width','height','rotation','opacity','color','color2','hidden','locked','ornament','letter','asset','svg'])||!id(l.id)||typeof l.name!=='string'||l.name.length>120||!['solid','gradient','ornament','image','svg'].includes(l.kind)||!number(l.x)||!number(l.y)||!number(l.width,1)||!number(l.height,1))return false;
 if(!optional(l.rotation,v=>number(v,-3600,3600))||!optional(l.opacity,v=>number(v,0,1))||!optional(l.color,colour)||!optional(l.color2,colour)||!optional(l.hidden,boolean)||!optional(l.locked,boolean)||!optional(l.ornament,v=>['flourish','divider','border','leaf','raven','capital'].includes(v))||!optional(l.letter,v=>typeof v==='string'&&/^[A-Z]$/.test(v)))return false;
 if(l.asset!==undefined && (!object(l.asset)||!keys(l.asset,['kind','cavernId','assetId'])||l.asset.kind!=='managed'||typeof l.asset.cavernId!=='string'||l.asset.cavernId.length>256||!/^sha256:[0-9a-f]{64}$/.test(l.asset.assetId)))return false;
 return optional(l.svg,v=>typeof v==='string'&&v.length<=131072) && (l.kind!=='image'||!!l.asset) && (l.kind!=='svg'||!!l.svg&&!!l.asset);
}
