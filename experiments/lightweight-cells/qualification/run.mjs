import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const [name='500-274',mode='resident',trial='1']=process.argv.slice(2);
const [length,count,blocks=8]=name.split('-').map(Number);
const letter=name==='letter-dense'||name==='letter-native';
if(!letter&&(!Number.isInteger(length)||length<240||!Number.isInteger(count))||!['resident','numeric'].includes(mode))throw Error('Expected LENGTH-COUNT[-BLOCKS] resident|numeric TRIAL');
const output=path.resolve('artifacts/cell-qualification',name+'-'+mode+'-'+trial);
fs.mkdirSync(output,{recursive:true});
const owned=id=>({kind:'owned',placementId:'p-'+id,target:{kind:'local',blockId:id}});
const seed='A richly annotated paragraph about the White Rabbit. ';
const rows=Array.from({length:blocks},(_,i)=>({id:'text-'+i,type:'standoff-editor-block',children:[],
  relations:{opaque:{},owned:{}},inline:[{kind:'text',text:i?'Unrelated paragraph '+i:seed.repeat(Math.ceil(length/seed.length)).slice(0,length)}],
  properties:{standoffProperties:i?[]:Array.from({length:count},(_,j)=>{
    const start=j*37%length;
    return {id:'prop-'+j,type:['style/bold','style/italics','style/rectangle','codex/entity-reference','qualification/opaque'][j%5],value:'entity-'+j%5,start,end:Math.min(length-1,start+8)};
  })}}));
const doc={id:'doc',type:'main-list-block',properties:{metadata:{documentId:'doc',title:'Qualification'}},children:rows.map(b=>owned(b.id))};
let fixture={format:'mutable-document',version:1,valueEncoding:'codex-authored-value-v1',resourceId:'doc',definitionOwnerBlockIds:[],
 document:{format:'codex-portable-resource-gate',resourceId:'doc',version:1,root:owned('doc'),blocks:[doc,...rows]}};
if(letter){
  fixture=JSON.parse(fs.readFileSync(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink'));
  if(name==='letter-dense'){
    const b=fixture.document.blocks.filter(b=>b.inline?.length===1&&b.inline[0].kind==='text').sort((a,b)=>b.inline[0].text.length-a.inline[0].text.length)[0];
    const n=Array.from(b.inline[0].text).length;
    for(let i=0;i<256;i++){const start=i*37%n;b.properties.standoffProperties.push({id:'study-'+i,type:'study/range',start,end:Math.min(start+8,n-1)});}
  }
}
const fixturePath=path.join(output,'fixture.ink');fs.writeFileSync(fixturePath,JSON.stringify(fixture));
const run=spawnSync(process.execPath,['scripts/benchmark-flint-typing-browser.mjs'],{stdio:'inherit',env:{...process.env,
 BENCHMARK_CELL_LONG:length>=25000?'1':'0',BENCHMARK_DOCUMENT_PATH:fixturePath,BENCHMARK_OUTPUT:output,BENCHMARK_COMPACT:'1',BENCHMARK_RESIDENT_CELLS:String(mode==='resident'),BENCHMARK_CELL_QUALIFICATION:'1'}});
process.exitCode=run.status??1;
