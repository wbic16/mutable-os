// Isolated browser qualification; the runner supplies a temporary Vault/broker.
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {nativeDocumentSession} from '../../persistence/native-session';
import {captureNative,nativeBytes,decodeNative,admitNative} from '../../persistence/native-resource';
import '../../index.css';
import '../../demo/workspace-demo.css';
const configuration=await(await fetch('/__configuration')).json();
const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{dialecticProviderContinuity:false,dialecticAutosave:false,dialecticAutomaticTitles:false,dcpTestPhaseLogging:false,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}}),editor=session.editor;
const native=nativeDocumentSession(editor);native.defaultVault=async()=>'isolated';native.establishVault=async()=>({vault:'isolated'} as any);native.list=async()=>[];
native.browseVault=native.discoverVault=async()=>({vault:'isolated',folders:['isolated'],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true} as any);
let restored:string|undefined;
if(location.search.includes('reload')){
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const bytes=new Uint8Array(await(await fetch('/__saved')).arrayBuffer());restored=decodeNative(bytes).resourceId;admitNative(editor.repository,bytes,editor.repository.readState().placements[bank].contentKey);
}
const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';render(()=><WorkspacePresentationView session={session}/>,host);editor.installGateway(document);
await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});
const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;if(restored)port.application.openDocument(restored);
editor.setAssetContext(()=>({cavernId:configuration.cavernId,session:configuration.session}));
const root=()=>port.session()!.projection.node(port.session()!.rootKey)!;
const rows=()=>root().children.map(k=>port.session()!.projection.node(k)!).filter(n=>(n.payload.metadata as any)?.dialectic);
const draft=()=>rows().find(n=>(n.payload.metadata as any).dialectic.state==='draft')!;
const text=()=>port.session()!.projection.node(draft().children[0])!;
const proof:any={restored:!!restored,editor,session,port,rows,draft,text,host,root,ready:true};
(window as any).proof=proof;
proof.seedHistory=()=>editor.commands.boundedStructuralTransaction('Drop regression fixture',()=>editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'human',ordinal:1,replies:[]}},children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text:'Previously submitted contribution. Drop a PDF over this protected text.'}]},{kind:'before',anchorKey:draft().key}));
proof.protectedText=()=>port.session()!.projection.node(rows().find(n=>(n.payload.metadata as any).dialectic.state==='committed')!.children[0])!;
proof.type=()=>{editor.commands.replaceInlineRange(text().key,0,0,'Please read the attached files and create a PDF report, CSV result and a garden image.');};
proof.attachments=()=>rows().flatMap(n=>(n.payload.metadata as any).dialectic.attachments??[]);
proof.save=()=>port.application.files!.save({folder:'isolated',filename:'Attachments.ink'});
proof.roundTrip=()=>{const a=nativeBytes(captureNative(editor.repository.readState(),String(root().payload.id)));return new TextDecoder().decode(nativeBytes(decodeNative(a)))===new TextDecoder().decode(a);};
proof.boundedTyping=async()=>{
 const old=editor.repository.snapshot.bind(editor.repository),values=Object.values,fetcher=window.fetch;let snapshots=0,scans=0,requests=0;
 editor.repository.snapshot=(...args)=>{snapshots++;return old(...args);};Object.values=((value:any)=>{if(value===editor.repository.state.contents||value===editor.repository.state.placements)scans++;return values(value);}) as typeof Object.values;
 window.fetch=(...args)=>{requests++;return fetcher(...args);};
 try{for(let i=0;i<20;i++)editor.commands.replaceInlineRange(text().key,0,0,'x');await new Promise(requestAnimationFrame);return {snapshots,scans,requests};}
 finally{editor.repository.snapshot=old;Object.values=values;window.fetch=fetcher;}
};
