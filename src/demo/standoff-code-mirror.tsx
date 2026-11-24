import {language,syntaxTree} from '@codemirror/language';
import {onCleanup,onMount} from 'solid-js';
import {WorkspaceSession} from '../application/workspace-session';
import {WorkspacePresentationView} from '../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../application/document-application-ports';
import {nativeDocumentSession} from '../persistence/native-session';
import {mountedCodeMirrors} from '../features/standoff-code-mirror/view';
import {currentEditorInput} from '../runtime/editor-input';
import {liveDocumentEntities} from '../application/live-document-entities';
import {registerStandaloneEntityService} from '../application/entity-service';
import type {ReactiveEditorConfiguration} from '../configuration';
import './workspace-demo.css';
export default function StandoffCodeMirrorDemo(props:{configuration?:ReactiveEditorConfiguration}){
 const empty=new URLSearchParams(location.search).has('empty');
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[{id:empty?'cm-empty-document':'cm-document',type:'document-block',metadata:{title:'Annotated CodeMirror'},children:empty?[]:[
  {id:'cm-before',type:'standoff-editor-block',text:'Mutable paragraph before CodeMirror. Select source text and choose Annotate; Alt-click inspects overlaps.'},
  {id:'cm-code',type:'standoff-code-mirror-block',text:'const emoji = "😀";\nconsole.log(emoji);',metadata:{language:'javascript'},standoffProperties:[
   {id:'cm-name',type:'style/highlight',start:6,end:10,metadata:{description:'Variable name'}},
   {id:'cm-overlap',type:'note',start:6,end:16,value:'Overlapping source annotation',future:{preserved:true}},
  ]},
  {id:'cm-json',type:'standoff-code-mirror-block',text:'{ "language": "日本語", "emoji": "👩‍💻" }',metadata:{language:'json'},standoffProperties:[]},
  {id:'cm-after',type:'standoff-editor-block',text:'Mutable paragraph after CodeMirror. Save manually with Command-S / Control-S.'},
 ]}]}]}),{...props.configuration,features:{...props.configuration?.features,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSpatialGraph:false}});
 const editor=session.editor,native=nativeDocumentSession(editor);if(native)native.defaultVault=async()=>undefined;
 const application=()=>documentApplicationPorts(editor).ports().find(p=>p.applicationId==='flint')?.application;
 const codes=()=>mountedCodeMirrors(editor);
 onMount(async()=>{onCleanup(editor.installGateway(document));await editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});const w=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');if(w)editor.commands.setPayloadField(w.key,'metadata',{...w.payload.metadata as object,size:{w:1150,h:800},position:{x:20,y:95}});});
 const proof={editor,session,native,application,codes,syntax:()=>codes().map(code=>({key:code.nodeKey,id:code.record().payload.id,language:code.view.state.facet(language)?.name,tree:syntaxTree(code.view.state).toString()})),owner:()=>currentEditorInput(document)?.nodeKey,inventory:()=>{const root=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='cm-document')!;return liveDocumentEntities(editor,root.key);},mockEntities:()=>registerStandaloneEntityService(editor,()=>({search:async()=>({candidates:[{id:'ada',name:'Ada Lovelace',evidence:[]}],complete:true,diagnostics:[],current(){}}),get:async()=>({id:'ada',name:'Ada Lovelace',revision:1,aliases:[],description:'Browser fixture'}),names:async()=>[],dbMentions:async()=>[],summaries:async()=>({rows:[],complete:true,diagnostics:[]}),create:async()=>{throw Error('Fixture does not create Entities');},rename:async()=>{throw Error('Fixture does not rename Entities');},alias:async()=>{throw Error('Fixture does not change aliases');},dispose(){}}))};
 if(import.meta.env.DEV)(window as any).__standoffCodeMirror=proof;
 onCleanup(()=>{session.dispose();if((window as any).__standoffCodeMirror===proof)delete (window as any).__standoffCodeMirror;});
 return <main class="workspace-demo"><header style={{padding:'12px',background:'white',color:'#222'}}><strong>Annotated CodeMirror · mixed Mutable document</strong><p>Annotate, Entity search, Gloss, overlap inspection and native commands. Use a blank line for /code or /date; Commands opens explicit completion.</p></header><WorkspacePresentationView session={session}/></main>;
}
