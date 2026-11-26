import React from 'react';
import {Html5Audio,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Bookend,Caption,SeriesPlate} from '../../shared/SeriesPlate';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {between,EntityNode,Link,point,type Point} from '../006-where-text-meets-the-graph/graph';
import {bond,leiter,corpus,description,searchNames,matches} from './corpus';
import {Passage,bondResults,dinnerResults,evidence,heroAmount,pronounResults,travel} from './passages';
import episode from './metadata.json';
import scenes from './scenes.json';

function Opening({t}:{t:number}) {
  return <>
    <g opacity={1-ease(t,2.9,3.55)}>
      <text x={540} y={680} textAnchor="middle" fontFamily={type.mono} fontSize={303}
        letterSpacing={13} fill={ink.grey} opacity={.075}>007</text>
      <g textAnchor="middle" fontFamily={type.serif}>
        <text x={540} y={487} fontSize={95} fill={ink.cream} opacity={ease(t,0,.45)}>Bond.</text>
        <text x={540} y={606} fontSize={97} fontStyle="italic" fill={ink.entity} opacity={ease(t,.87,1.47)}>James Bond.</text>
      </g>
    </g>
    <Bookend lead={episode.title} emphasis="Entity discovery through textual mentions" leadSize={63} emphasisSize={44}
      volumeLabel="Volume II" spread={ease(t,3,5.65)} opacity={hold(t,3,7,.55)}/>
  </>;
}

function Query({t,query}:{t:number;query:string}) {
  const corpusBreak=hold(t,23.7,34.45,.45);
  const start=t>=62?62:t>=52.5?52.5:t>=47?47:t>=34?34:t>=14?14:7;
  return <g opacity={1-corpusBreak}>
    <rect x={76} y={168} width={928} height={120} rx={5} fill="#213032" stroke={ink.rule} strokeWidth={2}/>
    <text x={99} y={204} fontFamily={type.mono} fontSize={22} letterSpacing={2} fill={ink.grey}>SEARCH EXPRESSION</text>
    <text data-query="true" x={99} y={264} fontSize={54} fontFamily={type.serif} fill={ink.cream}
      opacity={ease(t,start,start+.6)}>{query}</text>
  </g>;
}

function NamePanel({t,query,entity}:{t:number;query:string;entity:Point}) {
  const found=searchNames(query).includes(bond);
  const answer=found?10.55:19.72;
  const values=[bond.name.join(' '),...bond.designations];
  return <g opacity={1-ease(t,23.5,24.65)}>
    <rect x={153} y={389} width={851} height={221} rx={6} fill="#292d2c" stroke={ink.grey} strokeWidth={2}/>
    {values.map((value,i)=>{
      const y=468+i*89;
      return <g key={value}>
        <rect x={547} y={y-47} width={395} height={63} rx={4} fill={ink.grammar}
          opacity={matches(value,query)?ease(t,9.4,10.35)*.28:hold(t,17.15+i*.87,18.1+i*.87,.27)*.18}/>
        <text x={185} y={y} fill={ink.grey} fontFamily={type.sans} fontSize={35}>{['Canonical name','Known designation'][i]}</text>
        <text x={566} y={y} fill={ink.cream} fontFamily={type.serif} fontSize={46}>{value}</text>
      </g>;
    })}
    <g opacity={found?ease(t,9.7,10.65):.18}>
      <Link curve={[point(783,610),point(783,639),point(entity.x,642),point(entity.x,entity.y-75)]}
        color={ink.grammar} draw={1} pulse={found?travel(t,10.1,11.3):undefined}/>
    </g>
    <text data-name-result={found?'found':'missing'} x={153} y={768} fontFamily={type.serif} fontSize={47}
      fill={found?ink.entity:ink.invalid} opacity={ease(t,answer,answer+.75)}>{found?'Matching name':'No matching name'}</text>
  </g>;
}

function Discovery({t}:{t:number}) {
  const query=t<14?bond.name.join(' '):t<47?description:t<52.5?'Bond':t<62?'He':description;
  const home=point(783,754), overview=point(189,590);
  const inCorpus=between(home,overview,ease(t,23.45,25.05));
  const bondCenter=between(between(inCorpus,point(189,493),hold(t,52.05,63.2,.95)),home,heroAmount(t));
  const leiterCenter=point(189,738);
  const centers=new Map([[bond,bondCenter],[leiter,leiterCenter]]);
  const results=t<47 || t>=62?dinnerResults:t<52.5?bondResults:pronounResults;
  const arrival= t<47?hold(t,43.95,46.9,.35):t<52.5?hold(t,50.15,51.95,.3):hold(t,58.9,61.8,.4);
  const panelName=t<24?'Entity properties':'Annotated passages';
  const repeat=t>=34?34:t>=14?14:7;
  const showPath=t<24 || (t>=34 && t<40);
  const nameDim=hold(t,18.65,25,.6);
  const countGroup=t>=47 && t<52.5;
  const nameVisible=ease(t,9.5,10.6);
  return <g opacity={hold(t,6.85,72.2,.55)}>
    <Query t={t} query={query}/>
    <text x={76} y={247} fontFamily={type.serif} fontSize={58} fill={ink.cream} opacity={hold(t,23.9,34.1,.5)}>Words in the corpus</text>
    <text x={79} y={337} fontFamily={type.sans} fontSize={31} fill={ink.grey}>{panelName}</text>
    {showPath && <Link curve={[point(918,288),point(918,320),point(918,330),point(918,t<24?389:350)]}
      color={ink.cream} draw={ease(t,repeat+.65,repeat+1.6)} pulse={travel(t,repeat+1.55,repeat+2.68)}/>}
    {t<24.7 && <NamePanel t={t} query={query} entity={bondCenter}/>}
    {t>=23.5 && corpus.map(({document},index)=><Passage key={document.id} index={index} t={t}
      centers={centers}/>)}
    {t>=36.67 && t<39.6 && <g opacity={hold(t,36.67,39.6,.22)}>
      <Link curve={[point(918,350),point(947,350),point(1010,340),point(1010,356)]}
        color={ink.grey} draw={1} pulse={travel(t,36.67,36.92)}/>
      <Link curve={[point(1010,356),point(1010,504),point(1010,652),point(1010,800)]}
        color={ink.grey} draw={1} pulse={travel(t,36.92,39.32)}/>
    </g>}
    <EntityNode entity={bond} center={bondCenter} opacity={nameVisible*(1-.58*nameDim)}
      light={Math.max(hold(t,11.05,13.85,.4),results.has(bond)?arrival:0,hold(t,62.7,64.3,.4))}/>
    <EntityNode entity={leiter} center={leiterCenter} opacity={hold(t,52.15,62.3,.6)} light={results.has(leiter)?arrival:0}/>
    <text x={783} y={871} textAnchor="middle" fontFamily={type.sans} fontSize={31} fill={ink.grammar}
      opacity={dinnerResults.has(bond)?hold(t,44.14,46.95,.37):0}>Found through Mention {evidence.id}</text>
    <text x={76} y={873} fill={ink.grammar} fontFamily={type.serif} fontSize={36} fontStyle="italic"
      opacity={hold(t,67.15,72,.6)}>Source passage · Document {evidence.document.id}</text>
    <path d="M76 905H1004" stroke={ink.rule} strokeWidth={1.5}/>
    {scenes.slice(1,-1).map(s=><Caption key={s.id}
      text={s.id==='missing' && t<17.45?'But what if the text calls him something else?':s.id==='mentions' && t>=40.9?'Same search. Different path.':s.id==='results' && countGroup?'Two matching mentions. One entity.':s.caption}
      opacity={hold(t,s.start,s.start+s.duration,.4)}/>)}
  </g>;
}

export function FindingThingsThroughWords() {
  const {fps}=useVideoConfig(),t=useCurrentFrame()/fps;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} seriesAttribution productBranding={false}>
      {t<7 && <Opening t={t}/>}
      {t>=6.85 && t<72.2 && <Discovery t={t}/>}
      {t>=71.65 && <Bookend lead="The language of a corpus" emphasis="becomes an index into its knowledge graph."
        volumeLabel="Volume II" leadSize={66} emphasisSize={46} spread={1-ease(t,72,77.4)} opacity={ease(t,71.65,72.65)}/>}
    </SeriesPlate>
  </>;
}
