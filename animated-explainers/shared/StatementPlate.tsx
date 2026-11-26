import React from 'react';
import {ink,type} from '../theme';

// Claim and Trait records share the double-ruled outline of a statement.
export function StatementPlate({width,label,title,titleSize=41}:{
  width:number;label:string;title:string;titleSize?:number;
}) {
  return <>
    <rect x={-width/2} y={-49} width={width} height={98} rx={16} fill="#353140" stroke={ink.narrative} strokeWidth={3}/>
    <rect x={6-width/2} y={-43} width={width-12} height={86} rx={12} fill="none" stroke={ink.narrative} opacity={.33}/>
    <text textAnchor="middle" y={-14} fontSize={18} letterSpacing={.7} fontFamily={type.mono} fill={ink.narrative}>{label}</text>
    <text textAnchor="middle" y={29} fontSize={titleSize} fontFamily={type.serif} fill={ink.cream}>{title}</text>
  </>;
}
