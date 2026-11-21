import type {NativeDocument} from '../../src/persistence/native-resource';
export const edge=(placementId:string,blockId:string,kind:'owned'|'reference'='owned')=>({placementId,kind,target:{kind:'local' as const,blockId}});
export function fixture():NativeDocument{return {
 format:'mutable-document',version:1,resourceId:'experiment-document',definitionOwnerBlockIds:[],
 document:{format:'codex-portable-resource-gate',version:1,resourceId:'experiment-document',root:edge('root','doc'),blocks:[
 {id:'doc',type:'document-block',properties:{metadata:{documentId:'experiment-document'},linkedAnnotations:{linked:{type:'style/bold',value:'retained definition'}}},children:[edge('page','page')]},
 {id:'page',type:'page-block',properties:{},children:[edge('a','a'),edge('b','b'),edge('shared-a','a','reference'),edge('mode','mode'),edge('neighbour','neighbour')]},
 {id:'a',type:'standoff-editor-block',properties:{standoffProperties:[
  {id:'duplicate',type:'style/bold',start:0,end:4,text:'cached'},
  {id:'duplicate',type:'style/italics',start:1,end:6},
  {type:'text/colour',value:'#c00000',start:2,end:5},
  {annotationId:'linked',type:'style/underline',start:0,end:2},
  {type:'tei/persName',start:1,end:3,metadata:{references:[{raw:'#absent',status:'unresolved'},{raw:'https://example.invalid/person',status:'unresolved'}]}},
  {type:'future/unknown',start:3,end:5,custom:{preserved:true}}
 ],blockProperties:[{type:'block/alignment',value:'left'},{type:'block/alignment',value:'center'}]},
 inline:[{kind:'text',text:'A😀é漢 '},{kind:'image',properties:{src:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="blue"/%3E%3C/svg%3E',alt:'blue square',width:20,height:20}},{kind:'text',text:' tail'}],relations:{owned:{alternative:edge('alt','alt')},opaque:{source:'tei/choice'}}},
 {id:'b',type:'standoff-editor-block',properties:{standoffProperties:[{type:'style/strikethrough',start:1,end:4}]},inline:[{kind:'text',text:'Second text.'}]},
 {id:'alt',type:'standoff-editor-block',properties:{metadata:{'tei/reading':'original'}},inline:[{kind:'text',text:'Alternate'}]},
 {id:'mode',type:'standoff-editor-block',properties:{mode:'tei/verse-line',metadata:{sourceId:'line1'}},inline:[{kind:'text',text:'Mode bearing text'}]},
 {id:'neighbour',type:'plain-text-block',properties:{text:'Plain neighbour'}}
 ]}};}
export const fixtureBytes=()=>new TextEncoder().encode(JSON.stringify(fixture()));
