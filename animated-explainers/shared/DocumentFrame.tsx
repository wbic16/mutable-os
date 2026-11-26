import React from 'react';
import {ink, type} from '../theme';

export function DocumentFrame({id,x,y,width,height}: {id:string;x:number;y:number;width:number;height:number}) {
  return <>
    <rect x={x} y={y} width={width} height={height} rx={6} fill="#202b2f" stroke={ink.grey} strokeOpacity={.58} strokeWidth={2}/>
    <text x={x+width-18} textAnchor="end" y={y+31} fontFamily={type.mono} fontSize={22} fill={ink.grey} letterSpacing={1.5}>DOCUMENT {id}</text>
  </>;
}
