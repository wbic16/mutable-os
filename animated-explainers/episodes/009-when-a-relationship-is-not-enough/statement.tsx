import React from 'react';
import {StatementPlate} from '../../shared/StatementPlate';
import type {Point} from '../006-where-text-meets-the-graph/graph';
import type {Claim} from './model';

export const claimHalfWidth=117, claimHalfHeight=49;
export function ClaimNode({claim,center,opacity}:{claim:Claim;center:Point;opacity:number}) {
  return <g data-claim={claim.id} opacity={opacity} transform={`translate(${center.x} ${center.y})`}>
    <StatementPlate width={2*claimHalfWidth} label={`CLAIM STATEMENT · ${claim.id}`} title={claim.type}/>
  </g>;
}
