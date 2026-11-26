import React from 'react';
import {mix} from '../../shared/CellSequence';
import {ink, type} from '../../theme';
export type GraphEntity = {id:string; name:readonly string[]};

export type Point = {x:number; y:number};
export const point = (x:number, y:number):Point => ({x,y});
export const between = (a:Point,b:Point,t:number) => point(mix(a.x,b.x,t),mix(a.y,b.y,t));
export type Curve = [Point,Point,Point,Point];

export function Link({curve,color,draw,pulse}: {curve:Curve; color:string; draw:number; pulse?:number}) {
  const [a,b,c,d] = curve;
  const path = `M${a.x} ${a.y} C${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`;
  let light:Point | undefined;
  if (pulse !== undefined && pulse>0 && pulse<1) {
    const ab=between(a,b,pulse), bc=between(b,c,pulse), cd=between(c,d,pulse);
    light=between(between(ab,bc,pulse),between(bc,cd,pulse),pulse);
  }
  return <g>
    <path d={path} fill="none" stroke={color} strokeWidth={2.8} pathLength={1}
      strokeDasharray="1" strokeDashoffset={1-draw} opacity={draw>0?.85:0}/>
    {light && <g transform={`translate(${light.x} ${light.y})`}>
      <circle r={13} fill={color} opacity={.28}/><circle r={6.5} fill={ink.cream}/>
    </g>}
  </g>;
}

export const mentionHalfWidth = 77;

export function MentionNode({id,center,opacity,light}: {id:string;center:Point;opacity:number;light:number}) {
  return <g data-mention={id} opacity={opacity} transform={`translate(${center.x} ${center.y})`}>
    <rect x={-mentionHalfWidth} y={-25} width={2*mentionHalfWidth} height={50} rx={4} fill="#233635" stroke={ink.entity} strokeWidth={2}/>
    <rect x={-mentionHalfWidth} y={-25} width={2*mentionHalfWidth} height={50} rx={4} fill={ink.entity} opacity={.38*light}/>
    <text textAnchor="middle" y={8} fill={ink.cream} fontFamily={type.sans} fontSize={28}>Mention <tspan fontFamily={type.mono} fontSize={26} fill={ink.entity}>{id}</tspan></text>
  </g>;
}

export const radius = {x:113,y:75};
export function EntityNode({entity,center,opacity,light,compact=0}: {entity:GraphEntity;center:Point;opacity:number;light:number;compact?:number}) {
  const ry=mix(radius.y,46,compact);
  return <g data-entity={entity.id} opacity={opacity} transform={`translate(${center.x} ${center.y})`}>
    <ellipse rx={radius.x} ry={ry} stroke={ink.grammar} strokeWidth={2.5} fill="#33312b"/>
    <ellipse rx={radius.x-6} ry={ry-6} stroke={ink.grammar} opacity={.25+light*.6} fill="none"/>
    <text y={entity.name.length===2?-40:mix(-15,-9,compact)} textAnchor="middle" fontFamily={type.mono} fontSize={19} letterSpacing={2} fill={ink.grammar}>ENTITY</text>
    <text textAnchor="middle" fontFamily={type.serif} fontSize={mix(36,32,compact)} fill={ink.cream}>
      {entity.name.map((line,i)=><tspan key={line} x={0} y={(entity.name.length===2?0:mix(26,24,compact))+i*39}>{line}</tspan>)}
    </text>
  </g>;
}
