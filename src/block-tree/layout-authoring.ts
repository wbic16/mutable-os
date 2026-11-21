import type {ExistingBlockDto} from './types';

const integer={type:'integer',minimum:Number.MIN_SAFE_INTEGER,maximum:Number.MAX_SAFE_INTEGER} as const;
const nullable=(schema:unknown)=>({anyOf:[schema,{type:'null'}]});
export const listConfiguration={type:'object',properties:{start:nullable(integer),reversed:{type:'boolean'},items:nullable({type:'array',maxItems:64,items:{type:'object',properties:{value:nullable(integer),checked:nullable({type:'boolean'})},required:['value','checked'],additionalProperties:false}})},required:['start','reversed','items'],additionalProperties:false} as const;
export const tableConfiguration={type:'object',properties:{headers:{type:'array',maxItems:64,items:{type:'array',maxItems:16,items:{type:'boolean'}}}},required:['headers'],additionalProperties:false} as const;
export const listOperation={purpose:'Organize ordered, bullet or task items with native numbering and nested content.',nativeEffects:['indented-list-block','container-block','metadata.htmlList','metadata.htmlListItem','checked']} as const;
export const layoutOperation={purpose:'Arrange content in owned native rows and cells; tables are rectangular, grids may have unequal row lengths.',constraints:{maxRows:64,maxColumns:16,maxCellChildren:32},nativeEffects:['table-block','table-row-block','table-cell-block','grid-block','grid-row-block','grid-cell-block']} as const;
const record=(input:unknown,keys:string[])=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k)))throw Error('Invalid native configuration fields');
 return input as Record<string,any>;
};
export function listMetadata(ordered:boolean,start=1,reversed=false){
 if(typeof ordered!=='boolean'||!Number.isSafeInteger(start)||typeof reversed!=='boolean')throw Error('Invalid native list numbering');
 return {htmlList:{ordered,start,reversed}};
}
export function taskChecked(value:unknown):boolean {
 if(typeof value!=='boolean')throw Error('Task state must be boolean');return value;
}
export function listItemPayload(value?:number,checked?:boolean){
 if(value!==undefined&&!Number.isSafeInteger(value))throw Error('Invalid native list item configuration');
 return {metadata:{htmlListItem:{...(value===undefined?{}:{value})}},...(checked===undefined?{}:{checked:taskChecked(checked)})};
}
const dto=(type:string,children:ExistingBlockDto[],data:Partial<ExistingBlockDto>={}):ExistingBlockDto=>({id:crypto.randomUUID(),type,...data,children});
/** The shell also serves native conversion, which moves existing owned placements. */
export function listShell(children:ExistingBlockDto[]=[],ordered=false,start=1,reversed=false){return dto('indented-list-block',children,{metadata:listMetadata(ordered,start,reversed)});}
export function prepareList(items:ExistingBlockDto[][],style:string,configuration?:unknown):ExistingBlockDto {
 if(!['bullet','ordered','task'].includes(style)||!items.length||items.length>64||items.some(i=>!Array.isArray(i)||!i.length||i.length>32))throw Error('Invalid native list items');
 const config=configuration==null?{start:null,reversed:false,items:null}:record(configuration,['start','reversed','items']);
 if(config.start!==null&&!Number.isSafeInteger(config.start)||typeof config.reversed!=='boolean')throw Error('Invalid native list numbering');
 if(style!=='ordered'&&(config.start!==null||config.reversed))throw Error('Numbering requires an ordered list');
 if(config.items!==null&&(!Array.isArray(config.items)||config.items.length!==items.length))throw Error('List item configuration must match items');
 const children=items.map((content,index)=>{
  const item=config.items===null?{value:null,checked:null}:record(config.items[index],['value','checked']);
  if(item.value!==null&&style!=='ordered')throw Error('Item value requires an ordered list');
  return dto('container-block',content,listItemPayload(item.value===null?undefined:item.value,item.checked===null?(style==='task'?false:undefined):item.checked));
 });
 return listShell(children,style==='ordered',config.start??(config.reversed?items.length:1),config.reversed);
}
/** Shared payload for native import headers. Spans may be retained by import but
 * are not authorable layout effects: the current view does not render them. */
export function tableCellMetadata(header:boolean,colSpan=1,rowSpan=1){
 if(typeof header!=='boolean'||![colSpan,rowSpan].every(n=>Number.isSafeInteger(n)&&n>=1))throw Error('Invalid native table cell metadata');
 return {htmlTableCell:{header,colSpan,rowSpan}};
}
export function prepareLayout(family:'table'|'grid',rows:ExistingBlockDto[][][],configuration?:unknown):ExistingBlockDto {
 if(!['table','grid'].includes(family)||!Array.isArray(rows)||!rows.length||rows.some(row=>!Array.isArray(row)||!row.length||row.some(cell=>!Array.isArray(cell))))throw Error('Invalid native layout rows/cells');
 if(family==='table'&&rows.some(row=>row.length!==rows[0].length))throw Error('Native table must be rectangular');
 const headers=configuration==null?null:record(configuration,['headers']).headers;
 if(configuration!=null&&(family!=='table'||!Array.isArray(headers)||headers.length!==rows.length||headers.some((row:any,i:number)=>!Array.isArray(row)||row.length!==rows[i].length||row.some((h:any)=>typeof h!=='boolean'))))throw Error('Header configuration must match table cells');
 return dto(family+'-block',rows.map((row,r)=>dto(family+'-row-block',row.map((cell,c)=>dto(family+'-cell-block',cell,headers===null?{}:{metadata:tableCellMetadata(headers[r][c])})))));
}
