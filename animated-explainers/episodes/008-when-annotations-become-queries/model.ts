import {letters} from '../../shared/CellSequence';
import {namedRange} from '../../shared/TextRun';
import type {GraphEntity} from '../006-where-text-meets-the-graph/graph';

export type Context = {document:string; block:string; revision:number};
export type Source = {context:Context; text:string; cells:ReturnType<typeof letters>};
export function source(document:string,text:string):Source {
  return {context:{document,block:'01',revision:1},text,cells:letters(text,document+'-')};
}
export type Interval = {context:Context; start:number; end:number};
export type Kind = 'mention'|'speech'|'event'|'reported'|'irony';
export type Entity = GraphEntity & {kind:'person'|'place'};
export type Annotation = {id:string; kind:Kind; segments:Interval[]; entity?:Entity};
export function annotate(src:Source,id:string,kind:Kind,target:string,entity?:Entity):Annotation {
  const {start,end}=namedRange(id,src.text,target);
  return {id,kind,entity,segments:[{context:src.context,start,end}]};
}

export function compatible(a:Interval,b:Interval) {
  return a.context.document===b.context.document && a.context.block===b.context.block && a.context.revision===b.context.revision;
}
export function intersection(a:Interval,b:Interval):Interval|undefined {
  if(!compatible(a,b)) return;
  const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);
  if(start<end) return {context:a.context,start,end};
}
export function intersects(a:Annotation,b:Annotation) {
  return a.segments.some(left=>b.segments.some(right=>intersection(left,right)!==undefined));
}
// Cover every member segment. Adjacent covering pieces may jointly cover it,
// while a gap in the covering annotation must stop the sweep.
export function contains(outer:Annotation,inner:Annotation) {
  return inner.segments.length>0 && inner.segments.every(part=>{
    let covered=part.start;
    const pieces=outer.segments.filter(s=>compatible(s,part)).sort((a,b)=>a.start-b.start);
    for(const piece of pieces) {
      if(piece.start>covered) break;
      covered=Math.max(covered,piece.end);
      if(covered>=part.end) return true;
    }
    return false;
  });
}
export function meets(a:Interval,b:Interval) {
  return compatible(a,b) && (a.end===b.start || b.end===a.start);
}

function entity(id:string,kind:Entity['kind'],...name:string[]):Entity { return {id,kind,name}; }
export const napoleon=entity('napoleon','person','Napoleon','Bonaparte');
const wellesley=entity('wellesley','person','Arthur','Wellesley');
const paris=entity('paris','place','Paris'), lyon=entity('lyon','place','Lyon');
const madrid=entity('madrid','place','Madrid'), vienna=entity('vienna','place','Vienna'), brussels=entity('brussels','place','Brussels');

export type Passage = {source:Source; firstLine:string; remainder:string; preview:string; records:Annotation[]};
function passage(id:string,firstLine:string,remainder:string,personText:string,person:Entity,
  placeText:string,place:Entity,speech?:string,preview=firstLine):Passage {
  const src=source(id,firstLine+' '+remainder);
  const last=Number(id)*2;
  const records=[annotate(src,String(last-1).padStart(2,'0'),'mention',personText,person),
    annotate(src,String(last).padStart(2,'0'),'mention',placeText,place)];
  if(speech) records.push(annotate(src,id+'s','speech',speech));
  return {source:src,firstLine,remainder,preview,records};
}
export const corpus=[
  passage('01','“Napoleon will return to Paris,”','said the officer.','Napoleon',napoleon,'Paris',paris,'“Napoleon will return to Paris,”'),
  passage('02','Napoleon travelled to Lyons.','The journey was uneventful.','Napoleon',napoleon,'Lyons',lyon),
  passage('03','“Wellington has reached Madrid,”','the messenger declared.','Wellington',wellesley,'Madrid',madrid,'“Wellington has reached Madrid,”'),
  passage('04','“The Emperor has left Vienna,”','she whispered.','The Emperor',napoleon,'Vienna',vienna,'“The Emperor has left Vienna,”'),
  passage('05','Napoleon waited outside. “We shall depart for Brussels,”','said the officer.','Napoleon',napoleon,'Brussels',brussels,'“We shall depart for Brussels,”','Napoleon waited outside.'),
];

export type Evidence = {document:Passage; person:Annotation; speech:Annotation; place:Annotation};
export function inquire(documents:Passage[],subject:Entity) {
  const results=new Map<Entity,Evidence[]>();
  const evaluations=documents.map(document=>{
    const people=document.records.filter(r=>r.kind==='mention' && r.entity?.id===subject.id);
    const speeches=document.records.filter(r=>r.kind==='speech');
    const evidence:Evidence[]=[];
    const containing=speeches.filter(s=>people.some(p=>contains(s,p)));
    for(const speech of containing) {
      for(const place of document.records.filter(r=>r.kind==='mention' && r.entity?.kind==='place' && contains(speech,r))) {
        for(const person of people.filter(p=>contains(speech,p))) {
          const hit={document,person,speech,place};
          evidence.push(hit);
          const target=place.entity!;
          // Entity IDs, unlike mention wording, identify result groups.
          const key=Array.from(results.keys()).find(e=>e.id===target.id)??target;
          if(!results.has(key)) results.set(key,[]);
          results.get(key)!.push(hit);
        }
      }
    }
    return {document,people,speeches,containing,evidence};
  });
  return {evaluations,results};
}
export const inquiry=inquire(corpus,napoleon);

export const opening=source('example','Napoleon reportedly entered Paris.');
export const openingMarks=[
  annotate(opening,'person','mention','Napoleon',napoleon),annotate(opening,'place','mention','Paris',paris),
  annotate(opening,'event','event','Napoleon reportedly entered Paris'),
  annotate(opening,'report','reported','reportedly entered Paris'),
];
export const reading=source('reading','“A fine victory for Napoleon,” she said.');
export const person=annotate(reading,'subject','mention','Napoleon',napoleon);
export const speech=annotate(reading,'voice','speech','“A fine victory for Napoleon,”');
export const irony=annotate(reading,'tone','irony','fine victory');
export const readings=[person,speech,irony];
export const composed=contains(speech,person) && contains(speech,irony);
