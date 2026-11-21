import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {ReactiveTreeView} from '../rendering/reactive-tree-view';
import {registerApplicationViews} from '../application/features';
import '../index.css';
const wait=async(fn:()=>boolean)=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Retrieval browser timeout');};
const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
const editor=new ReactiveEditor({id:'fixture',type:'document-block',children:[{id:'source',type:'standoff-editor-block',text:'Ship identity'}]});registerApplicationViews(editor);const view=editor.createView(),host=document.createElement('div');document.body.append(host);render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);editor.installGateway(document);
const original=window.fetch.bind(window),calls:any[]=[];let release:()=>void=()=>{};
window.fetch=async(input,init)=>{
 if(String(input)==='/api/retrieval/query'){const body=JSON.parse(String(init?.body));calls.push(body);if(body.strategy==='hybrid')await new Promise<void>(r=>{release=r;});const text=body.strategy==='hybrid'?'Related interpretation':'Lexical passage';return new Response(JSON.stringify({Success:true,Data:{results:[{text,source:{resourceId:'saved',path:'saved.ink',sourceHash:'hash',spans:[{blockGuid:body.strategy,start:0}]}}]}}));}
 if(String(input).startsWith('/api/'))return new Response(JSON.stringify({Success:false,Error:'Isolated fixture'}),{status:409});return original(input,init);
};
(window as any).proof={ready:true,async run(){
 const n=Object.values(view.state.nodes).find(n=>n.payload.id==='source')!;await wait(()=>!!editor.mounts.get(n.key));editor.mounts.get(n.key)!.focus();editor.mounts.get(n.key)!.restoreInlineSelection?.({anchor:0,head:13});
 await editor.commandRegistry.execute('autocomplete.search',{targetKey:n.key,args:undefined});await wait(()=>!!document.querySelector('.autocomplete-workstation'));
 await wait(()=>[...document.querySelectorAll('[role=option]')].some(n=>n.textContent?.includes('Lexical passage')));
 const s=(editor.overlays.overlays.find(x=>x.viewType==='autocomplete')!.data as any).session;s.select(s.state.rows[0].id);const selected=s.state.selected;const input=document.querySelector<HTMLInputElement>('.autocomplete-workstation input')!;input.focus();await wait(()=>calls.some(c=>c.strategy==='hybrid'));check(s.state.rows.length===1,'Lexical first');release();await wait(()=>s.state.rows.length===2);check(s.state.selected===selected,'Selection preserved');check(document.activeElement===input,'Focus preserved');
 return {lexicalFirst:true,semanticLater:true,selectionPreserved:true,focusPreserved:true,calls:calls.map(c=>c.strategy),status:s.state.retrievalStatus};
}};
