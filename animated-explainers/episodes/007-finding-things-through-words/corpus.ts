import {letters} from '../../shared/CellSequence';
import {namedRange} from '../../shared/TextRun';
import type {Segment} from '../005-beyond-the-contiguous-range/model';
import type {Document} from '../006-where-text-meets-the-graph/corpus';
import type {GraphEntity} from '../006-where-text-meets-the-graph/graph';

type Entity = GraphEntity & {designations: string[]};
export const bond:Entity = {id:'bond',name:['James Bond'],designations:['007']};
export const leiter:Entity = {id:'leiter',name:['Felix Leiter'],designations:[]};
export const description = 'The man in the dinner jacket';

export type Mention = {id:string; document:Document; segment:Segment; entity:Entity};
function passage(id:string, lines:string[], references:[string,string,Entity][]) {
  const text=lines.join(' ');
  const block={id:'doc-'+id+'/01',cells:letters(text,'doc-'+id+'-')};
  const document:Document={id,lines,block};
  const mentions:Mention[]=references.map(([key,expression,entity])=>{
    const range=namedRange(key,text,expression);
    return {id:key,document,entity,segment:{block,start:block.cells[range.start],end:block.cells[range.end-1]}};
  });
  return {document,mentions};
}

export const corpus=[
  passage('01',['Bond','entered the casino.'],[['01','Bond',bond]]),
  passage('02',['007','received his instructions.'],[['02','007',bond]]),
  passage('03',['The British agent','ordered a drink.'],[['03','The British agent',bond]]),
  passage('04',[description,'approached the table.'],[['04',description,bond]]),
  passage('05',['Bond opened the envelope.','He examined the dossier.'],[['05','Bond',bond],['06','He',bond]]),
  passage('06',['Felix Leiter entered the room.','He took a seat.'],[['07','Felix Leiter',leiter],['08','He',leiter]]),
];

export function bounds({segment}:Mention) {
  return {start:segment.block.cells.indexOf(segment.start), end:segment.block.cells.indexOf(segment.end)+1};
}
export function targetText(m:Mention) {
  const {start,end}=bounds(m);
  return m.segment.block.cells.slice(start,end).map(c=>c.value).join('');
}
export const matches = (a:string,b:string) => a.toLowerCase()===b.toLowerCase();
export function searchNames(query:string) {
  return [bond,leiter].filter(entity=>[entity.name.join(' '),...entity.designations].some(value=>matches(value,query)));
}
export function searchMentions(query:string) {
  const results=new Map<Entity,Mention[]>();
  for(const {mentions} of corpus) {
    for(const mention of mentions) {
      if(!matches(targetText(mention),query)) continue;
      const group=results.get(mention.entity);
      if(group) group.push(mention);
      else results.set(mention.entity,[mention]);
    }
  }
  return results;
}
