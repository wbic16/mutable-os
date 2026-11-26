import {between,point,type Point} from '../006-where-text-meets-the-graph/graph';
import {ease} from '../../shared/motion';
import {anchor,entities,concepts,neighbours,records,retrieve,type TraitStatement} from './model';

export const entityKey=(id:string)=>'entity/'+id;
export const conceptKey=(id:string)=>'concept/'+id;
export const statementKey=(r:TraitStatement)=>'statement/'+r.id;
export const focusSubject=entityKey(anchor.subject),focusObserver=entityKey(anchor.observer),focusConcept=conceptKey(anchor.trait);
export const bySubject=retrieve({role:'subject',id:anchor.subject});
export const byObserver=retrieve({role:'observer',id:anchor.observer});
export const byConcept=retrieve({role:'trait',id:anchor.trait});
export const allKeys=[...Object.keys(entities).map(entityKey),...Object.keys(concepts).map(conceptKey),...records.map(statementKey)];
export const column=(i:number,count:number)=>540+318*(i-(count-1)/2);
export const lane=(i:number)=>444+176*i;

type Layout=Record<string,Point>;
const act:Layout={
  [focusSubject]:point(210,727),[focusObserver]:point(870,727),
  [statementKey(anchor)]:point(540,533),[focusConcept]:point(540,815),
};
function fan(matches:TraitStatement[],focus:string,leaf:'subject'|'observer'):Layout {
  const layout:Layout={[focus]:point(540,347)};
  matches.forEach((r,i)=>{
    const x=column(i,matches.length);
    layout[statementKey(r)]=point(x,548);
    layout[entityKey(r[leaf])]=point(x,717);
  });
  return layout;
}
const reputation=fan(bySubject,focusSubject,'observer');
const observer:Layout={[focusObserver]:point(540,347)};
byObserver.forEach((r,i)=>{
  observer[statementKey(r)]=point(column(i,byObserver.length),549);
  observer[entityKey(r.subject)]=point(270,749);
  observer[conceptKey(r.trait)]=point(810,749);
});
const pivot:Layout={[statementKey(anchor)]:point(540,524),[focusSubject]:point(265,752),
  [focusObserver]:point(224,392),[focusConcept]:point(824,649)};
const concept=fan(byConcept,focusConcept,'subject');
const passages:Layout={[focusConcept]:point(540,293)};
byConcept.forEach((r,i)=>{passages[statementKey(r)]=point(237,lane(i));});
const network:Layout={[focusConcept]:point(540,335),[statementKey(anchor)]:point(237,777)};
neighbours.forEach((n,i)=>{network[conceptKey(n.to)]=point(column(i,neighbours.length),565);});
const poses=[act,reputation,observer,pivot,concept,passages,network];
const starts=[30.8,41.8,52.8,55.7,68.8,81.8],ends=[34.2,45.5,55.5,60.4,72.3,85.2];

// Give persistent identities a clear travelling lane before the next set of
// matches enters. The elbow is a quadratic Bézier in plate coordinates.
function bend(a:Point,via:Point,b:Point,t:number) {
  return between(between(a,via,t),between(via,b,t),t);
}
function transit(index:number,key:string,a:Point,b:Point,p:number) {
  if(index===0 && key===statementKey(anchor))return between(a,b,ease(p,.4,.94));
  if((index===0 && key===focusSubject) || (index===3 && key===focusConcept) || index===4)
    return bend(a,point(a.x,b.y),b,p);
  if(index===1){
    if(key===statementKey(anchor))return between(a,b,ease(p,0,.45));
    if(key===focusObserver)return bend(a,point(a.x,b.y),b,ease(p,.32,1));
    if(key===focusSubject){
      const right=point(850,462);
      return p<.48?bend(a,point(832,306),right,ease(p,0,.48)):
        bend(right,point(887,809),b,ease(p,.48,.92));
    }
  }
  if(index===5 && key===statementKey(anchor))return between(a,b,ease(p,.2,.98));
  return between(a,b,p);
}

export function pose(t:number) {
  let index=starts.findIndex((_,i)=>t<ends[i]);
  if(index===-1) index=starts.length-1;
  const from=poses[index],to=poses[index+1],p=ease(t,starts[index],ends[index]);
  const nodes:Record<string,{center:Point;opacity:number}>={};
  for(const key of allKeys) {
    const a=from[key],b=to[key];
    if(!a&&!b)continue;
    const center=a&&b?transit(index,key,a,b,p):(a??b);
    nodes[key]={center,opacity:a&&b?1:a?1-ease(p,0,.25):ease(p,.75,1)};
  }
  return nodes;
}
