import {unwrap} from 'solid-js/store';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {ScopedEntities} from '../../application/scoped-entities';
import {enrichEntityDefinition} from '../../feature-api/entity-enrichment';
import {createSignal} from 'solid-js';
import {SemanticGraph} from './semantic-graph';
import {semanticThumbnail} from './semantic-thumbnail';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import '../../index.css';import '../../demo/workspace-demo.css';
/** In-memory visual fixture: no file saves, authority requests or canonical writes. */
export async function semanticsWorkspaceFixture(){
 const host=document.body.appendChild(document.createElement('div'));host.style.cssText='position:fixed;inset:0;z-index:99999;background:#fafaff';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeKnowledge:false,sqliteKnowledge:false,authorityCache:false,dialecticAutomaticTitles:false,dialecticAutosave:false,flintProbe:false}}),editor=session.editor,stop=render(()=><WorkspacePresentationView session={session}/>,host);
 editor.installGateway(document);await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});await Promise.resolve();await Promise.resolve();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!,root=port.session()!.projection.node(port.session()!.rootKey)!,resourceId=String(root.payload.id),scoped=new ScopedEntities(editor,root.key,resourceId),provenance={actor:'ai',participantId:'Research assistant',exchangeId:'visual-fixture'};
 const definitions:Record<string,any>={},people=[['Leonardo da Vinci','Person','Italian Renaissance artist and engineer','Artist,Engineer,Inventor'],['Ludovico Sforza','Person','Duke of Milan and patron of the arts','Ruler,Patron'],['Beatrice d’Este','Person','Duchess of Milan','Noble'],['Milan','Place','City in northern Italy','City']];
 const entities=people.map(([name,typename,description,subtypes])=>{let d:any=scoped.prepare({name,typename,description,aliases:[]},provenance);d=enrichEntityDefinition(d,{enrichment:{subtypes:subtypes.split(','),...(name==='Leonardo da Vinci'?{dates:[{type:'birth',startYear:1452,startMonth:4,startDay:15,precision:'day',expression:'15 April 1452'},{type:'death',startYear:1519,startMonth:5,startDay:2,precision:'day',expression:'2 May 1519'}]}:{})}},provenance);definitions[d.id]=d;return d;});
 const ref=(i:number)=>({scope:'document' as const,resourceId,entityId:entities[i].id});
 for(const [from,to,type]of [[1,0,'patron of'],[0,3,'worked in'],[2,1,'spouse of']] as const){const d=scoped.prepareRelation(type,ref(from),ref(to),provenance);definitions[d.id]=d;}
 const blockId=crypto.randomUUID(),anchor=crypto.randomUUID(),argument=crypto.randomUUID(),text='Leonardo da Vinci worked at the court of Ludovico Sforza in Milan. Patronage offered opportunities for artistic and engineering work.';
 definitions[anchor]={id:anchor,type:'dialectic/range-anchor',metadata:{dialecticRange:{version:1,excerpt:text,source:{resourceId,blockId}}}};
 definitions[argument]={id:argument,type:'dialectic/argument',metadata:{dialecticArgument:{version:1,anchor:{resourceId,anchorId:anchor},provenance}}};
 editor.commands.structuralTransaction('Visual fixture',()=>{
  editor.commands.setPayloadField(root.key,'linkedAnnotations',definitions);
  editor.commands.setPayloadField(root.key,'metadata',{...unwrap(root.payload.metadata as Record<string,any>),title:'Leonardo da Vinci and Ludovico Sforza’s Court'});
  editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'ai',participant:{id:'research',kind:'ai',name:'Research assistant'},ordinal:1,replies:[]}},children:[{id:blockId,type:'standoff-editor-block',text,standoffProperties:[{id:crypto.randomUUID(),type:'mutable/entity-reference',start:0,end:16,metadata:{entityReference:ref(0)}},{id:crypto.randomUUID(),type:'dialectic/range-anchor',annotationId:anchor,start:0,end:text.length-1},{id:crypto.randomUUID(),type:'dialectic/claim',start:63,end:text.length-1}]}]},{kind:'at',parentKey:root.key,index:0});
 });
 const window=editor.blockQueries.ancestors(port.key).find(n=>n.viewType==='window-block');if(window)editor.commands.setPayloadField(window.key,'metadata',{...unwrap(window.payload.metadata as Record<string,any>),position:{x:0,y:0},size:{w:1580,h:940}});
 const tab=(name:string)=>[...host.querySelectorAll<HTMLButtonElement>('.conversation-subtabs button')].find(b=>b.textContent?.trim().endsWith(name))!;
 tab('Semantics').click();await Promise.resolve();const entityButton=[...host.querySelectorAll<HTMLButtonElement>('.semantics-list-item')].find(b=>b.textContent?.includes('Leonardo da Vinci'))!;entityButton?.click();
 (globalThis as any).semanticsFixture={editor,session,host,port,tab,dispose:()=>{scoped.dispose();stop();session.dispose();host.remove();}};
 return {entities:entities.length,relationships:3,arguments:1,claims:1,resourceId};
}

/** Deterministic managed-image binding: exercises the real thumbnail queue, raster and sandbox. */
export function semanticGraphThumbnailFixture(){
 const host=document.body.appendChild(document.createElement('div'));host.style.cssText='position:fixed;inset:0;z-index:100000;background:white';
 const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;const context=canvas.getContext('2d')!;context.fillStyle='#38776c';context.fillRect(0,0,240,160);context.fillStyle='#f2d68f';context.beginPath();context.arc(120,80,55,0,Math.PI*2);context.fill();const url=canvas.toDataURL();
 const asset={kind:'managed' as const,cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)},diagnostics={binds:0,releases:0};
 const editor={features:{managedAssetClipboard:true},readAssetContext:()=>({cavernId:'fixture',session:'fixture'}),assets:{bind:(image:HTMLImageElement)=>{diagnostics.binds++;const timer=setTimeout(()=>image.src=url,10);return()=>{clearTimeout(timer);diagnostics.releases++;};}}} as unknown as ReactiveEditor;
 const [thumbnails,setThumbnails]=createSignal({}),[selected,setSelected]=createSignal('');
 const nodes=[{id:'canonical',label:'Canonical Entity'},{id:'missing',label:'No image'}];
 const stop=render(()=><div class="semantics-workspace"><SemanticGraph editor={editor} portraits nodes={nodes} edges={[]} active selected={selected()} select={setSelected} thumbnails={thumbnails()}/></div>,host);
 const update=()=>setThumbnails({canonical:semanticThumbnail({}, {status:'linked',canonical:{id:'canonical',name:'Canonical Entity',revision:1,aliases:[],imageRef:asset}})});
 (globalThis as any).semanticThumbnailFixture={host,update,clear:()=>setThumbnails({}),selected,diagnostics,dispose:()=>{stop();host.remove();}};
}
