import type {ExistingBlockDto} from './types';
import type {TabOrientation} from './tab-orientation';

export const compoundParameters={orientation:{type:'string',enum:['horizontal','vertical']},label:{type:'string',minLength:1,maxLength:256}} as const;
export const compoundOperations={
 surface:{purpose:'Present related front and reverse content on one native Surface.',nativeEffects:['surface-block','side-block','container-block']},
 tabs:{purpose:'Organize labelled alternatives in native horizontal or vertical tabs.',nativeEffects:['tab-row-block','tab-block']},
 pages:{purpose:'Compose labelled pages inside this contribution, without creating a Document or host session.',nativeEffects:['document-tab-row-block','document-tab-block','page-block']},
 margins:{purpose:'Attach left or right marginal content to a new TextBlock through native owned relations.',nativeEffects:['left-margin-block','right-margin-block','leftMargin','rightMargin']},
} as const;
const block=(type:string,children:ExistingBlockDto[],metadata?:Record<string,unknown>):ExistingBlockDto=>({id:crypto.randomUUID(),type,...(metadata?{metadata}:{}),children});
export function tabLabel(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value.length>256||/[\r\n]/.test(value))throw Error('Tab label must be nonempty, at most 256 characters and one line');return value.trim();
}
export function authoredTabOrientation(value:unknown):TabOrientation {
 if(value!=='horizontal'&&value!=='vertical')throw Error('Invalid native tab orientation');return value;
}
export const preparePage=(content:ExistingBlockDto[]=[])=>block('page-block',content);
export function tabPanel(label:string,content:ExistingBlockDto[],pages=false,active=true){
 return block(pages?'document-tab-block':'tab-block',pages?[preparePage(content)]:content,{name:tabLabel(label),active});
}
export function prepareTabs(panels:{label:string;content:ExistingBlockDto[]}[],orientation?:TabOrientation,pages=false){
 if(!Array.isArray(panels)||!panels.length)throw Error('Tabs require panels');
 return block(pages?'document-tab-row-block':'tab-row-block',panels.map((p,i)=>tabPanel(p.label,p.content,pages,i===0)),orientation===undefined?{}:{orientation:authoredTabOrientation(orientation)});
}
export const surfaceShell=(children:ExistingBlockDto[]=[])=>block('surface-block',children,{reversible:true});
export function surfaceSide(role:'front'|'back',content:ExistingBlockDto[]){
 if(role!=='front'&&role!=='back')throw Error('Invalid Surface role');
 const children=role==='back'||content.length>1?[block('container-block',content,{structuralContainer:true})]:content;
 return block('side-block',children,{surfaceRole:role});
}
export const prepareSurface=(front:ExistingBlockDto[],back:ExistingBlockDto[])=>surfaceShell([surfaceSide('front',front),surfaceSide('back',back)]);
export function marginText(side:'left'|'right',text:ExistingBlockDto={id:crypto.randomUUID(),type:'standoff-editor-block',text:'',children:[],standoffProperties:[]}){
 if(side!=='left'&&side!=='right'||text.type!=='standoff-editor-block')throw Error('Invalid native margin text');
 const props=(Array.isArray(text.blockProperties)?text.blockProperties:[]) as {type?:string;[key:string]:unknown}[];
 return {...text,blockProperties:[...props,...(props.some(p=>p.type?.startsWith('block/alignment'))?[]:[{type:'block/alignment',value:side}]),...(props.some(p=>p.type?.startsWith('block/font/size'))?[]:[{type:'block/font/size/three-quarters'}])]};
}
export function prepareMargin(side:'left'|'right',content:ExistingBlockDto[]):ExistingBlockDto {
 if(side!=='left'&&side!=='right')throw Error('Invalid native margin side');
 return {...block(side+'-margin-block',content.map(n=>n.type==='standoff-editor-block'?marginText(side,n):n)),blockProperties:[{type:'block/marginalia/'+side},...(side==='right'?[{type:'block/alignment',value:'right'}]:[])]};
}
export function attachMargins(owner:ExistingBlockDto,left:ExistingBlockDto[],right:ExistingBlockDto[]):ExistingBlockDto {
 if(owner.type!=='standoff-editor-block')throw Error('Margins require a Standoff source block');
 if(owner.relation?.leftMargin||owner.relation?.rightMargin)throw Error('Margin relation already exists');
 return {...owner,relation:{...owner.relation,...(left.length?{leftMargin:prepareMargin('left',left)}:{}),...(right.length?{rightMargin:prepareMargin('right',right)}:{})}};
}
