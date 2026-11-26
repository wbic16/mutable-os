import React from 'react';
import {ease,hold} from '../../shared/motion';
import {DocumentFrame} from '../../shared/DocumentFrame';
import {ink,type} from '../../theme';
import {between,EntityNode,Link,point,type Curve,type Point} from '../006-where-text-meets-the-graph/graph';
import {entities,claims,flatten,residence,type EntityId} from './model';
import {ClaimNode,claimHalfWidth} from './statement';
import {Passage} from './passage';

type Layout=Record<EntityId,Point>;
const first:Layout={michelangelo:point(226,597),money:point(852,431),brothers:point(852,598),
  rome:point(852,772),letter:point(868,780),friend:point(205,780),florence:point(852,598)};
const radial:Layout={michelangelo:point(540,611),money:point(212,412),florence:point(540,412),
  brothers:point(868,412),friend:point(212,809),rome:point(540,809),letter:point(868,809)};
const single:Layout={michelangelo:point(184,598),money:point(883,431),brothers:point(883,598),
  rome:point(883,772),letter:point(875,623),friend:point(875,735),florence:point(875,847)};
const dual:Layout={michelangelo:point(191,558),money:point(875,287),brothers:point(875,399),rome:point(875,511),
  letter:point(875,623),friend:point(875,735),florence:point(875,847)};
const ids=Object.keys(entities) as EntityId[];
const [a,b]=claims;
const flatEdges=claims.flatMap(flatten);
function port(center:Point,target:Point,ry:number) {
  const dx=target.x-center.x,dy=target.y-center.y;
  const scale=1/(Math.hypot(dx/113,dy/ry)||1);
  return point(center.x+scale*dx,center.y+scale*dy);
}

function route(start:Point,end:Point,bend:number):Curve {
  const u=between(start,end,1/3),v=between(start,end,2/3);
  return [start,point(u.x,u.y+(start.y-u.y)*bend),point(v.x,v.y+(end.y-v.y)*bend),end];
}
function Label({at,text,color,opacity}:{at:Point;text:string;color:string;opacity:number}) {
  return <text x={at.x} y={at.y} opacity={opacity} textAnchor="middle" fontSize={25} fontFamily={type.sans}
    stroke={ink.paper} strokeWidth={8} strokeLinejoin="round" paintOrder="stroke" fill={color}>{text}</text>;
}
const probes=[
  {text:'When?',x:285,y:350}, {text:'According to whom?',x:786,y:350},
  {text:'With what evidence?',x:267,y:737}, {text:'Under what circumstances?',x:778,y:737},
];

export function GraphScene({t}:{t:number}) {
  const crowd=ease(t,26,28.8), regroup=ease(t,39.35,43.65), pair=ease(t,52.8,55.9);
  const evidence=ease(t,64.95,67.4),inquiry=ease(t,74.8,77.1);
  const compact=crowd*(1-regroup)+pair, ry=75-29*compact;
  const visible=1-ease(t,65,66.1);
  const locations=Object.fromEntries(ids.map(id=>[id,between(between(between(first[id],radial[id],crowd),
    single[id],regroup),dual[id],pair)])) as Layout;
  const m=locations.michelangelo;
  const claimA=between(between(between(point(519,598),point(475,399),pair),point(206,387),evidence),point(540,535),inquiry);
  const claimB=between(between(point(475,780),point(475,735),pair),point(206,682),evidence);
  const claimCenters=[claimA,claimB];
  const claimOpacity=[ease(t,41,42.75),ease(t,53.55,55.3)*(1-ease(t,75,76))];
  const extra=1-ease(t,39.05,40.35)+ease(t,54.8,55.9);
  const question=hold(t,32.1,39.3,.6);
  const nodeOpacity=(id:EntityId)=>{
    if(id==='michelangelo')return ease(t,2.55,3.3);
    if(id==='florence')return hold(t,2.9,7.25,.5)+ease(t,28.65,29.3)*extra;
    const i=a.participants.findIndex(p=>p.entity===id);
    if(i>0)return ease(t,8.4+i*1.04,9+i*1.04);
    return ease(t,id==='letter'?26.65:27.7,id==='letter'?27.45:28.4)*extra;
  };
  const evidenceOpacity=hold(t,65.55,75.75,.8);
  return <g opacity={ease(t,2.15,2.7)*(1-ease(t,82.65,83.4))}>
    <g opacity={hold(t,2.2,7.2,.4)}>
      <DocumentFrame id={residence.documentId} x={76} y={177} width={928} height={149}/>
      <text x={100} y={209} fill={ink.grey} fontSize={20} fontFamily={type.mono} letterSpacing={1}>ILLUSTRATIVE PASSAGE</text>
      <text x={100} y={283} fill={ink.cream} fontSize={53} fontFamily={type.serif}>{residence.text}</text>
    </g>
    {t>=6.9 && t<53.5 && <Passage claim={a} x={76} y={174} width={928}
      opacity={hold(t,6.9,26.25,.45)+hold(t,39.1,53.5,.6)} time={t-8.4}/>}
    {t>=25.85 && t<32.55 && <Passage claim={b} x={76} y={174} width={928}
      opacity={hold(t,25.85,32.55,.55)} time={t-26.25}/>}
    <g opacity={question}>
      <text x={76} y={229} fontSize={25} fontFamily={type.mono} fill={ink.invalid}>A POSSIBLE PAIRING?</text>
      <text x={76} y={299} fontSize={54} fontFamily={type.serif} fill={ink.cream}>Did the money go to the friend?</text>
      <path d="M137 448 C57 525 57 699 137 774" fill="none" stroke={ink.invalid} strokeWidth={3} strokeDasharray="8 9"/>
      <circle cx={79} cy={611} r={21} fill={ink.paper} stroke={ink.invalid}/>
      <text x={79} y={621} textAnchor="middle" fontSize={32} fontFamily={type.serif} fill={ink.invalid}>?</text>
    </g>
    <g opacity={hold(t,47,53.15,.5)}>
      <text x={76} y={398} fontFamily={type.sans} fontSize={29} fill={ink.grey}>Theme <tspan fill={ink.cream}>· the thing sent</tspan></text>
    </g>
    <g opacity={hold(t,53.25,65.45,.65)}>
      <text x={76} y={222} fontFamily={type.serif} fontSize={51} fill={ink.cream}>{t<59.4?'Two Sending statements':'An n-ary statement'}</text>
      <text x={76} y={278} fontSize={32} fill={ink.grey} fontFamily={type.sans} opacity={ease(t,59.4,60)}>
        Several participants in one assertion.
      </text>
    </g>
    <g opacity={evidenceOpacity}>
      <text x={76} y={226} fontFamily={type.serif} fontSize={54} fill={ink.cream}>Back to the passages</text>
    </g>
    <g opacity={hold(t,75.25,83.25,.6)}>
      <text x={76} y={225} fontSize={52} fontFamily={type.serif} fill={ink.cream}>Questions about Claim A</text>
      {probes.map((q,i)=>{
        const op=ease(t,76.3+i*.79,77+i*.79);
        const start=point(claimA.x+(q.x<540?-70:70),claimA.y+(q.y<535?-47:47));
        return <g key={q.text} opacity={op}>
          <line x1={start.x} y1={start.y} x2={q.x} y2={q.y+(q.y<535?20:-40)} stroke={ink.narrative} opacity={.58} strokeWidth={2} strokeDasharray="5 8"/>
          <text x={q.x} y={q.y} textAnchor="middle" fontSize={32} fontFamily={type.serif} fill={ink.cream}>{q.text}</text>
        </g>;
      })}
    </g>
    <g opacity={hold(t,3.1,7.2,.55)}>
      <Link curve={route(point(m.x+113,m.y),point(locations.florence.x-115,m.y),0)} color={ink.entity} draw={ease(t,3.15,4.15)} pulse={ease(t,4.75,5.65)}/>
      <path d="m725 589 13 8 -13 8" stroke={ink.entity} fill="none" strokeWidth={3} opacity={ease(t,3.85,4.2)}/>
      <Label at={point(540,574)} text={residence.relation} color={ink.cream} opacity={ease(t,3.5,4.2)}/>
    </g>
    <g opacity={visible}>
      {claims.map((claim,ci)=>{
        const center=claimCenters[ci],group=ci===0?ease(t,40.45,44.4):ease(t,53.35,55.55);
        const other=ci===0?1:extra;
        return <g key={claim.id} opacity={other}>
          {claim.participants.map(({entity,role},i)=>{
            const to=locations[entity];
            if(role==='Sender'){
              const end=port(to,center,ry);
              const start=point(center.x-claimHalfWidth,center.y);
              const at=between(start,end,.53);
              return <g key={role} data-role={role} data-owner={claim.id} opacity={group}>
                <Link curve={route(start,end,.5)} color={ink.narrative} draw={group}/>
                <Label at={point(at.x,at.y-12)} text={role} color={ink.cream} opacity={group}/>
              </g>;
            }
            const flat=flatEdges.find(edge=>edge.to===entity)!;
            const begin=ci===0?17.1+(i-1)*.85:26.35+i*.74;
            const draw=ease(t,begin,begin+.8);
            const groupedStart=point(center.x+claimHalfWidth,center.y+(i-2)*25);
            const flatStart=port(m,to,ry);
            const start=between(flatStart,groupedStart,group);
            const end=between(port(to,m,ry),point(to.x-113,to.y),group);
            const at=between(start,end,.5);
            const radialLabelY=entity==='florence'?495:747;
            const vertical=entity==='florence' || entity==='rome';
            return <g key={role} data-role={role} data-owner={claim.id}>
              <Link curve={route(start,end,group*.58)} color={group>.55?ink.narrative:ink.entity} draw={draw}
                pulse={ci===0?ease(t,46.4+i*.75,47.2+i*.75):ease(t,55.4+i*.65,56.2+i*.65)}/>
              <Label at={between(point(at.x,at.y-12),point(606,radialLabelY),vertical?crowd*(1-regroup):0)}
                text={flat.label} color={ink.entity} opacity={draw*Math.max(0,1-2.5*group)}/>
              <Label at={point(at.x,at.y-10)} text={role} color={ink.cream} opacity={Math.max(0,2*group-1)}/>
            </g>;
          })}
        </g>;
      })}
      {ids.map(id=><EntityNode key={id} entity={entities[id]} center={locations[id]}
        compact={compact} opacity={nodeOpacity(id)} light={question*(id==='money'||id==='friend'?1:0)}/>)}
    </g>
    {t>=65.4 && t<75.85 && claims.map((claim,i)=>{
      const y=i===0?296:591, center=claimCenters[i],on=ease(t,66.5+i*1.7,67.65+i*1.7);
      const left=center.x+claimHalfWidth, right=438, lineY=y+91;
      const progress=ease(t,66.65+i*1.7,67.65+i*1.7);
      return <g key={claim.id} opacity={evidenceOpacity} data-evidence={claim.id}>
        <Passage claim={claim} x={414} y={y} width={590} time={t} opacity={1} evidence={ease(t,67+i*1.7,68.65+i*1.7)}/>
        <path d={`M${left} ${center.y} Q${(left+right)/2} ${lineY} ${right} ${lineY}`} fill="none" stroke={ink.entity} strokeWidth={2.7} strokeDasharray="7 6" opacity={on}/>
        {progress>0 && progress<1 && <circle cx={left+(right-left)*progress} cy={lineY} r={6} fill={ink.cream}/>}
      </g>;
    })}
    {claims.map((claim,i)=><ClaimNode key={claim.id} claim={claim} center={claimCenters[i]} opacity={claimOpacity[i]}/>)}
  </g>;
}
