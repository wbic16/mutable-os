import type {QuillEffect,QuillTypography} from './model';
export const effectPresets={
 Swell:{kind:'size',curve:'bell',from:1,to:1.65},Taper:{kind:'size',curve:'linear',from:1.5,to:.75},Crescendo:{kind:'size',curve:'linear',from:.8,to:1.6},Decrescendo:{kind:'size',curve:'linear',from:1.6,to:.8},Oscillate:{kind:'size',curve:'sine',from:.8,to:1.3,cycles:2},Tracking:{kind:'tracking',curve:'bell',from:0,to:5},Tilt:{kind:'rotation',curve:'sine',from:-12,to:12,cycles:2},Baseline:{kind:'baseline',curve:'sine',from:-10,to:10,cycles:2},Fade:{kind:'opacity',curve:'linear',from:1,to:.3},Colour:{kind:'color',curve:'linear',from:0,to:1,colorFrom:'#e7c88a',colorTo:'#b95164'},Weight:{kind:'weight',curve:'linear',from:300,to:800},
} satisfies Record<string,Omit<QuillEffect,'id'>>;
export function effectValue(e:QuillEffect,t:number){const u=Math.max(0,Math.min(1,t)),f=e.curve==='bell'?Math.sin(u*Math.PI):e.curve==='sine'?(1-Math.cos(u*Math.PI*2*(e.cycles??1)))/2:u;return e.from+(e.to-e.from)*f;}
export function layoutStyle(t:QuillTypography|undefined,at:number,length:number,style:string){
 let size=t?.size??20,tracking=t?.tracking??0,weight=style.includes('bold')?700:t?.weight??400;
 for(const e of t?.effects??[]){if(e.enabled===false)continue;const v=effectValue(e,at/Math.max(1,length-1));if(e.kind==='size')size*=v;else if(e.kind==='tracking')tracking+=v;else if(e.kind==='weight')weight=v;}
 size=Math.max(6,Math.min(200,size));weight=Math.max(100,Math.min(900,weight));const italic=style.includes('italic')||t?.italic;
 return {size,tracking,weight,font:`${italic?'italic ':''}${weight} ${size.toFixed(3)}px ${t?.family??'Georgia'}`,style:[italic?'italic':'',weight>=600?'bold':''].filter(Boolean).join(' ')};
}
export function visualStyle(t:QuillTypography|undefined,at:number,length:number){
 let rotation=0,baseline=0,opacity=1,color=t?.color??'#262320';
 for(const e of t?.effects??[]){if(e.enabled===false)continue;const u=at/Math.max(1,length-1),v=effectValue(e,u);if(e.kind==='rotation')rotation+=v;else if(e.kind==='baseline')baseline+=v;else if(e.kind==='opacity')opacity*=Math.max(0,Math.min(1,v));else if(e.kind==='color'){
  const a=e.colorFrom??color,b=e.colorTo??color,t=Math.max(0,Math.min(1,v));color='#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');}}
 return {rotation,baseline,opacity,color};
}
export const layoutTypography=(t:QuillTypography|undefined)=>({family:t?.family,size:t?.size,weight:t?.weight,italic:t?.italic,tracking:t?.tracking,effects:(t?.effects??[]).filter(e=>e.enabled!==false&&['size','tracking','weight'].includes(e.kind))});
