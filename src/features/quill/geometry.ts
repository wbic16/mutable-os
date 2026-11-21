import type {QuillPath,PathKind,PathNode} from './model';
export interface PathPoint {x:number;y:number;angle:number}
export interface PathGeometry {key:string;length:number;d:string;point(distance:number):PathPoint}
type XY={x:number;y:number};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const cubic=(a:number,b:number,c:number,d:number,t:number)=>((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d);
/** Original bounded parametric geometry; coordinates belong to the artboard. */
export function pathSamples(p:QuillPath):XY[]{
 const n=Math.min(4096,p.kind==='line'?1:p.kind==='sine'?Math.max(128,Math.ceil((p.cycles??1)*96)):p.kind==='spiral'?Math.max(128,Math.ceil((p.turns??3)*96)):256),h=p.kind==='circle'?p.width:p.height??p.width;
 let points:XY[]=[];
 if(p.kind==='bezier'||p.kind==='freehand'){
  const nodes=p.nodes!;
  for(let i=1;i<nodes.length;i++){
   const a=nodes[i-1],b=nodes[i],steps=p.kind==='freehand'?1:Math.max(8,Math.floor(1024/nodes.length));
   for(let j=i===1?0:1;j<=steps;j++){const t=j/steps;points.push({x:p.x+cubic(a.x,a.outX??a.x,b.inX??b.x,b.x,t),y:p.y+cubic(a.y,a.outY??a.y,b.inY??b.y,b.y,t)});}
  }
 }else if(p.kind==='rectangle'||p.kind==='polygon'){
  if(p.kind==='rectangle')points=[{x:p.x,y:p.y},{x:p.x+p.width,y:p.y},{x:p.x+p.width,y:p.y+h},{x:p.x,y:p.y+h},{x:p.x,y:p.y}];
  else {const sides=p.sides??6;for(let i=0;i<=sides;i++){const a=-Math.PI/2+i/sides*Math.PI*2;points.push({x:p.x+p.width/2+Math.cos(a)*p.width/2,y:p.y+h/2+Math.sin(a)*h/2});}}
 }else for(let i=0;i<=n;i++){
  const t=i/n;
  if(p.kind==='line'||p.kind==='sine')points.push({x:p.x+t*p.width,y:p.y+(p.kind==='sine'?(p.amplitude??0)*Math.sin(t*2*Math.PI*(p.cycles??1)+(p.phase??0)):0)});
  else {const arc=p.kind==='arc',spiral=p.kind==='spiral',a=((p.startAngle??(arc?180:-90))+t*(arc?(p.sweep??180):spiral?(p.turns??3)*360:360))*Math.PI/180,r=spiral?t:1;
   points.push({x:p.x+p.width/2+Math.cos(a)*p.width/2*r,y:p.y+h/2+Math.sin(a)*h/2*r});}
 }
 if(p.reverse)points.reverse();
 if(p.offset)points=points.map((point,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],angle=Math.atan2(b.y-a.y,b.x-a.x);return {x:point.x-Math.sin(angle)*p.offset!,y:point.y+Math.cos(angle)*p.offset!};});
 return points;
}
export function pathPreset(kind:PathKind,base:QuillPath):QuillPath {
 const p:QuillPath={id:base.id,kind,x:base.x,y:base.y,width:base.width};
 if(kind==='sine')Object.assign(p,{amplitude:20,cycles:1,phase:0});
 if(['arc','circle','ellipse','rectangle','polygon','spiral'].includes(kind))p.height=kind==='circle'?p.width:Math.min(240,p.width/2);
 if(kind==='arc')Object.assign(p,{startAngle:180,sweep:180});
 if(kind==='polygon')p.sides=6;if(kind==='spiral')p.turns=3;
 if(kind==='bezier')p.nodes=[{x:0,y:0,outX:p.width/3,outY:-80},{x:p.width,y:0,inX:p.width*2/3,inY:80}];
 if(kind==='freehand')p.nodes=[{x:0,y:0},{x:p.width/2,y:-40},{x:p.width,y:0}];
 return p;
}
export function freeformPath(path:QuillPath):QuillPath {
 const samples=pathSamples(path),step=Math.max(1,Math.ceil((samples.length-1)/64)),nodes:PathNode[]=samples.filter((_,i)=>i%step===0||i===samples.length-1).map(p=>({x:p.x-path.x,y:p.y-path.y}));
 return {id:path.id,kind:'freehand',x:path.x,y:path.y,width:path.width,nodes};
}
/** Local SVG cache. Never measures DOM or depends on viewport scroll/zoom. */
export class PathCache {
 private cache=new Map<string,PathGeometry>();builds=0;
 get(path:QuillPath):PathGeometry {
  const key=JSON.stringify(path),old=this.cache.get(key);if(old)return old;this.builds++;
  const points:Array<XY&{s:number}>=[];
  for(const p of pathSamples(path)){const last=points.at(-1);points.push({...p,s:last?last.s+Math.hypot(p.x-last.x,p.y-last.y):0});}
  const length=points.at(-1)!.s;
  const geometry:PathGeometry={key,length,d:points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' '),point(distance){
   const s=Math.max(0,Math.min(length,distance));let lo=1,hi=points.length-1;
   while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].s<s)lo=mid+1;else hi=mid;}
   const a=points[lo-1],b=points[lo],t=(s-a.s)/(b.s-a.s||1);return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
  }};
  this.cache.set(key,geometry);if(this.cache.size>512)this.cache.delete(this.cache.keys().next().value!);return geometry;
 }
 clear(){this.cache.clear();}
}
