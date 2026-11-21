import type {ExistingBlockDto} from '../../feature-api';
import {defaultComposition,QUILL_TYPE,SOURCE_REFERENCE,type QuillComposition} from './model';
/** Original geometry/ornaments; Poe's 1845 text is public domain. No font/image bundle. */
export function quillExample(raven=false):ExistingBlockDto {
 const body=raven?'Once upon a midnight dreary, while I pondered, weak and weary,\nOver many a quaint and curious volume of forgotten lore—\nWhile I nodded, nearly napping, suddenly there came a tapping,\nAs of some one gently rapping, rapping at my chamber door.':'Write your text here.';
 const texts=raven?[['title','The Raven'],['author','by Edgar Allan Poe'],['body',body]]:[['body',body]];
 const sources=texts.map(([role,text])=>({role,text,id:crypto.randomUUID()}));
 const config:QuillComposition=raven?{version:1,viewport:{width:1100,height:740},sources:sources.map(({role})=>({role})),paths:[
  {id:'title-line',kind:'line',x:80,y:150,width:800}, {id:'author-line',kind:'line',x:90,y:210,width:750},
  ...Array.from({length:4},(_,i)=>({id:'body-'+i,kind:'sine' as const,x:75,y:315+i*90,width:950,amplitude:22,cycles:1,phase:i%2?Math.PI:0}))],
 flows:[{id:'title',sourceRole:'title',pathIds:['title-line'],typography:{family:'Georgia',size:88,italic:true,color:'#f5dfb0'}},{id:'author',sourceRole:'author',pathIds:['author-line'],typography:{size:28,italic:true,color:'#e9c98a'}},{id:'body',sourceRole:'body',pathIds:['body-0','body-1','body-2','body-3'],typography:{size:25,color:'#f5dfb0',alignment:'center',effects:[{id:'body-swell',kind:'size',curve:'bell',from:.96,to:1.24}]}}],layers:[
  {id:'night',name:'Midnight background',kind:'gradient',x:0,y:0,width:1100,height:740,color:'#181622',color2:'#453340',locked:true},
  {id:'border',name:'Manuscript border',kind:'ornament',ornament:'border',x:24,y:24,width:1052,height:692,color:'#8e5c51',locked:true},
  {id:'raven',name:'Raven silhouette',kind:'ornament',ornament:'raven',x:830,y:45,width:210,height:155,color:'#d4b57d',opacity:.65},
  {id:'title-flourish',name:'Title flourish',kind:'ornament',ornament:'flourish',x:60,y:220,width:980,height:65,color:'#a74440'},
  {id:'footer-flourish',name:'Closing flourish',kind:'ornament',ornament:'flourish',x:160,y:640,width:780,height:60,color:'#a74440'}]}:defaultComposition();
 return {id:crypto.randomUUID(),type:QUILL_TYPE,quill:config,blockProperties:sources.map(s=>({id:crypto.randomUUID(),type:SOURCE_REFERENCE,value:s.id,metadata:{quillRole:s.role}})),children:sources.map(s=>({id:s.id,type:'standoff-editor-block',text:s.text,standoffProperties:s.role==='body'&&raven?[{id:crypto.randomUUID(),type:'style/italics',start:12,end:27}]:[]}))};
}
