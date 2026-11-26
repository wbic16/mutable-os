import React from 'react';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {EntityNode,between,point} from '../006-where-text-meets-the-graph/graph';
import {ConceptNode,RoleLink,SourcePassage,TraitNode,port} from './artwork';
import {allKeys,byConcept,bySubject,column,conceptKey,entityKey,focusConcept,focusSubject,pose,statementKey} from './layout';
import {anchor,entities,neighbours,records,usage,type ConceptId,type EntityId} from './model';

const titles=[
  [31.1,42,'How have the Venetians been described?'],
  [42.05,53,'How did this observer describe the world?'],
  [53,56.3,'Return to the same statement.'],
  [56.3,69,'To whom has this concept been applied?'],
  [69,82,'The words in each passage'],
  [82,92,'An illustrative conceptual network'],
] as const;
const roles=['subject','observer','trait'] as const;
const roleNames={subject:'Characterises',observer:'Attributed to',trait:'Trait type'};
export function Inquiry({t}:{t:number}) {
  const nodes=pose(t);
  const opening=1-ease(t,30.8,32);
  const docY=352-174*ease(t,7.75,10.5);
  const act=ease(t,12.65,15.5), idea=ease(t,20.1,23.2);
  const ledger=ease(t,70.65,72.05), network=ease(t,83.9,85.15);
  const repHold=hold(t,32.9,42.15,.85),traitHold=hold(t,58.9,69.8,1.2);
  const observerHold=hold(t,44.4,53.3,.8),openingLabels=hold(t,14.2,31.5,.7);
  const original=nodes[statementKey(anchor)];
  const nodeAlpha=(key:string)=>{
    const op=nodes[key]?.opacity??0;
    if(key===focusSubject)return op*ease(t,8.4,10.1);
    if(key===focusConcept)return op*idea;
    return op*act;
  };
  return <g opacity={ease(t,2,2.6)*(1-ease(t,91.65,92.65))}>
    {titles.map(([start,end,text])=><text key={start} x={76} y={221} fontSize={45} fill={ink.cream}
      fontFamily={type.serif} opacity={hold(t,start,end,.5)}>{text}</text>)}
    <g opacity={hold(t,8.7,13.2,.65)}>
      <path d="M324 727H692" stroke={ink.grey} strokeDasharray="8 9" strokeWidth={2}/>
      <text x={530} y={697} textAnchor="middle" fill={ink.grey} fontSize={31} fontFamily={type.sans}>An inherent quality?</text>
      <text x={835} y={738} textAnchor="middle" fill={ink.cream} fontSize={39} fontFamily={type.serif} fontStyle="italic">untrustworthy?</text>
    </g>
    {opening>0 && <SourcePassage record={anchor} x={76} y={docY} wide opacity={opening}
      subject={ease(t,4,5.2)} expression={ease(t,5.35,6.9)} guide={act}/>}
    {opening>0 && original && <g opacity={opening*act}>
      <path d={`M540 ${docY+207} L${original.center.x} ${original.center.y-49}`}
        stroke={ink.entity} strokeWidth={2.5} strokeDasharray="7 7" fill="none"/>
      <text x={560} y={439} fill={ink.entity} fontFamily={type.sans} fontSize={25}>Textual source</text>
    </g>}
    {records.map(r=>roles.map(role=>{
      const sk=statementKey(r), pk=role==='trait'?conceptKey(r.trait):entityKey(r[role]);
      const st=nodes[sk],participant=nodes[pk];
      if(!st||!participant)return null;
      const joined=Math.min(nodeAlpha(sk),nodeAlpha(pk))*(1-ledger);
      if(joined===0)return null;
      const p=port(participant.center,st.center,pk), q=port(st.center,participant.center,sk);
      const mid=between(p,q,.5);
      const pulseAt=role==='subject'?33.8:role==='observer'?45.4:60.15;
      const pulse=ease(t,pulseAt,pulseAt+1.25);
      return <g key={sk+role} data-association={r.id+'/'+role}>
        <RoleLink a={p} b={q} color={role==='trait'?ink.grammar:ink.narrative} opacity={joined} pulse={pulse}/>
        {r===anchor && <text x={mid.x+(role==='trait'?62:0)} y={mid.y-11} textAnchor="middle"
          opacity={joined*Math.max(openingLabels,observerHold*(role==='observer'?0:1))}
          fontFamily={type.sans} fontSize={26} stroke={ink.paper} strokeWidth={8} paintOrder="stroke" fill={ink.cream}>{roleNames[role]}</text>}
      </g>;
    }))}
    {byConcept.map((r,i)=>{
      const s=nodes[statementKey(r)],c=nodes[focusConcept];
      if(!s||!c||ledger===0)return null;
      const op=ease(t,71.25+i*.42,72.3+i*.42)*s.opacity;
      const y=s.center.y;
      const docX=406,docY=y-76;
      const leftRail=70;
      const travel=ease(t,72+i*1.7,73.25+i*1.7);
      return <g key={r.id} opacity={op} data-evidence={r.id}>
        <path d={`M${c.center.x-140} ${c.center.y} H${leftRail} V${y} H${s.center.x-133}`}
          fill="none" stroke={ink.grammar} strokeOpacity={.67} strokeWidth={2.6}/>
        <SourcePassage record={r} x={docX} y={docY} opacity={1} expression={ease(t,70.85+i*1.55,72.5+i*1.55)} guide={1}/>
        <path d={`M${s.center.x+133} ${y} Q${docX-13} ${y} ${docX-11} ${docY+110} H${docX}`}
          fill="none" stroke={ink.entity} strokeDasharray="6 6" strokeWidth={2.5}/>
        {travel>0 && travel<1 && <circle cx={s.center.x+133+(docX-s.center.x-133)*travel} cy={y+34*travel} r={5} fill={ink.cream}/>}
      </g>;
    })}
    {neighbours.map((n,i)=>{
      const a=nodes[conceptKey(n.from)],b=nodes[conceptKey(n.to)];
      if(!a||!b)return null;
      const from=port(a.center,b.center,conceptKey(n.from)),to=port(b.center,a.center,conceptKey(n.to));
      const mid=between(from,to,.5);
      return <g key={n.to} opacity={network} data-semantic={n.relation}>
        <path d={`M${from.x} ${from.y}L${to.x} ${to.y}`} stroke={ink.grammar} strokeDasharray="2 6" strokeLinecap="round" strokeWidth={2.6}/>
        <text x={column(i,neighbours.length)*.8+540*.2} y={mid.y-9} textAnchor="middle" fill={ink.grammar} stroke={ink.paper}
          strokeWidth={8} paintOrder="stroke" fontFamily={type.sans} fontSize={25}>{n.relation}</text>
      </g>;
    })}
    {allKeys.map(key=>{
      const n=nodes[key],opacity=nodeAlpha(key);
      const [kind,id]=key.split('/');
      const center=n?.center??point(540,540);
      const focus=key===focusConcept?hold(t,55.4,69.5,1.6):0;
      return <g key={key} data-identity={key} opacity={opacity} transform={`translate(${center.x} ${center.y})`}>
        {focus>0 && <path d="M-133 -58H133L151 -40V40L133 58H-133L-151 40V-40Z" fill="none"
          stroke={ink.grammar} strokeWidth={2} opacity={focus*.65}/>}
        {kind==='entity'?<EntityNode entity={entities[id as EntityId]} center={point(0,0)} compact={1} opacity={1} light={0}/>:
          kind==='concept'?<ConceptNode id={id as ConceptId} focus={focus}/>:<TraitNode record={records.find(r=>r.id===id)!}/>}
      </g>;
    })}
    {[{matches:bySubject,opacity:repHold,subject:true},{matches:byConcept,opacity:traitHold,subject:false}].map(group=>
      <g key={String(group.subject)} opacity={group.opacity}>
        {group.matches.map((r,i)=>{
          const x=column(i,group.matches.length);
          return <g key={r.id} textAnchor="middle" data-result={r.id}>
            <text x={x} y={817} fill={ink.cream} fontFamily={group.subject?type.serif:type.sans} fontStyle={group.subject?'italic':'normal'} fontSize={31}>
              {group.subject?'“'+usage(r)+'”':entities[r.observer].name[0]}</text>
            <text x={x} y={858} fill={ink.grey} fontFamily={type.sans} fontSize={24}>{r.source.diary?'Diary · English rendering':'Hypothetical example'}</text>
          </g>;
        })}
      </g>)}
    <g opacity={observerHold}>
      <text x={540} y={863} textAnchor="middle" fill={ink.grey} fontSize={29} fontFamily={type.sans}>One attributed passage in this collection · Florentine Diary</text>
    </g>
    <text x={540} y={675} textAnchor="middle" opacity={network} fontFamily={type.mono} fontSize={21} letterSpacing={1.5} fill={ink.grey}>ONE RECORDED APPLICATION</text>
  </g>;
}
