import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {admitNative,captureNative,nativeBytes,nativeText} from '../../persistence/native-resource';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {fixture} from '../../qualification/quill/model';
import {quillRecord} from '../../application/quill-operations';
import {inlineText,logicalInline} from '../../block-tree/inline-sequence';
import {QUILL_TYPE} from './model';
import '../../index.css';
import '../../demo/workspace-demo.css';
const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'canvas-background-block',children:[]},{type:'workspace-object-bank-block',children:[]}]}),{features:{nativeKnowledge:false,sqliteKnowledge:false,nativeDocumentPersistence:false,flintLogo:false,flintProbe:false,desktopApplicationIcons:false}});
const editor=session.editor,bank=Object.values(session.projection.state.nodes).find(n=>n.viewType==='workspace-object-bank-block')!;
const seed=new ReactiveEditor(fixture(200));admitNative(editor.repository,nativeBytes(captureNative(seed.repository.readState(),'quill-document')),bank.contentKey);seed.dispose();
const sourcePlacement=Object.values(session.projection.state.nodes).find(n=>n.payload.id==='quill-source')!.placementKey;
const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';host.style.height='100vh';
render(()=><WorkspacePresentationView session={session}/>,host);editor.installGateway(document);
editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
const port=(id:string)=>documentApplicationPorts(editor).ports().filter(p=>p.applicationId===id).at(-1)!;
const sourceNode=(app='flint')=>port(app)?.session()?.projection.nodeForPlacement(sourcePlacement);
const button=(label:string)=>[...[...document.querySelectorAll<HTMLElement>('.quill-application')].at(-1)!.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
(window as any).quillProof={editor,session,sourcePlacement,sourceNode,record:(p:string)=>quillRecord(editor,p),text:()=>inlineText(logicalInline(editor.repository.readState(),quillRecord(editor,sourcePlacement))),native:()=>nativeText(captureNative(editor.repository.readState(),'quill-document')),
 open:()=>editor.commandRegistry.execute('quill.edit',{targetKey:sourceNode()!.key,args:undefined}),confirm:()=>button('Convert paragraph').click(),close:()=>button('Return to editor').click(),
 wrapper:()=>Object.values(editor.repository.readState().contents).find(c=>c.viewType===QUILL_TYPE),newDocument:()=>button('New Document').click(),port,
};
