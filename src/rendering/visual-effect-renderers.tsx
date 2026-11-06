import { registerStaticCharacterSurface } from './static-character-surface';
import { For } from 'solid-js';
import { rectanglePath, underlineShapes, outlineShapes } from './decorations';
import type { EffectParams, VisualEffectRegistry, VisualEffectProps } from '../runtime/visual-effect-registry';

/** Source-neutral SVG: the host supplies geometry, regardless of how its region was identified. */
function Underline(props:VisualEffectProps){
  return <For each={props.geometry().fragments.map((_,index)=>index)}>{index=><path
    data-property-type={props.tag}
    data-decoration-key={`${props.identity}:${index}`}
    d={(()=>{const f=props.geometry().fragments[index];return f?underlineShapes(props.identity,[f],String(props.params().color),props.geometry().offset+Number(props.params().offset)-1.5)[0].path:'';})()}
    fill="none" stroke={String(props.params().color)} stroke-width={Number(props.params().thickness)} opacity={Number(props.params().opacity)}
    stroke-dasharray={props.params().lineStyle==='dashed'?'6 3':props.params().lineStyle==='dotted'?'1 3':undefined}
    stroke-linecap={props.params().lineStyle==='dotted'?'round':'butt'}
  />}</For>;
}
function Region(props:VisualEffectProps) {
  return <For each={props.geometry().fragments.map((_,index)=>index)}>{index=><path
    data-property-type={props.tag}
    data-decoration-key={`${props.identity}:${index}`}
    d={props.geometry().fragments[index] ? (props.params().outline ? outlineShapes(props.identity,[props.geometry().fragments[index]],String(props.params().color))[0].path : rectanglePath(props.geometry().fragments[index])) : ''}
    fill={props.params().outline ? 'none' : String(props.params().color)}
    stroke={props.params().outline ? String(props.params().color) : 'none'}
    stroke-dasharray={props.params().outline?'10 10':undefined} classList={{'reactive-decoration--marching':!!props.params().outline}}
    stroke-width={Number(props.params().thickness)} opacity={Number(props.params().opacity)}
  />}</For>;
}
function finite(params:EffectParams,key:string,min:number,max:number){const n=params[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`Invalid renderer parameter ${key}`);}
export function registerVisualEffectRenderers(registry:VisualEffectRegistry){
  registerStaticCharacterSurface(registry);
  registry.registerRenderer({name:'svg-underline',target:'range-overlay',defaults:{color:'purple',thickness:2,lineStyle:'solid',opacity:1,offset:1.5},
    validate(p){if(typeof p.color!=='string'||!p.color)throw Error('Invalid underline color');finite(p,'thickness',0,100);finite(p,'opacity',0,1);finite(p,'offset',-1000,1000);if(!['solid','dashed','dotted'].includes(String(p.lineStyle)))throw Error('Invalid underline line style');},
    layoutParams:['thickness','offset'],laneHeight:p=>Number(p.thickness),View:Underline});
  for(const outline of [false,true]) registry.registerRenderer({name:outline?'svg-outline':'svg-highlight',target:'range-overlay',defaults:{color:'#ffd34d',opacity:outline?1:.34,thickness:outline?3:1,outline},
    validate(p){if(typeof p.color!=='string'||!p.color)throw Error('Invalid region color');finite(p,'opacity',0,1);finite(p,'thickness',0,100);if(typeof p.outline!=='boolean')throw Error('Invalid outline');},layoutParams:[],laneHeight:()=>0,View:Region});
  registry.registerRenderer({name:'css-class',target:'cell-style',defaults:{classes:[],affectsLayout:true},
    validate(p){if(typeof p.affectsLayout!=='boolean')throw Error('Invalid CSS layout declaration');if(!Array.isArray(p.classes)||p.classes.some(c=>typeof c!=='string'||!c||/\s/.test(c)||c.startsWith('reactive-')))throw Error('CSS classes must be tokens outside the reserved reactive- namespace');},
    affectsLayout:p=>p.affectsLayout!==false,
    classes:p=>p.classes as string[]});
  registry.registerType({type:'codex/claim-reference',renderers:[{id:'underline',name:'svg-underline',params:{color:'red'}}]});
  registry.registerType({type:'mutable/opaque-property',renderers:[{id:'inactive',name:'svg-underline',params:{color:'#888',lineStyle:'dotted'}}]});
}
