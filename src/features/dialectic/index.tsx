import {createEffect,createRoot,untrack} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {CodexFeature} from '../../feature-api';
import type {DocumentApplicationInstance} from '../../feature-api/document-application';
import {applicationKey} from '../../feature-api/application-presentation';
import {documentApplicationCapabilities} from '../../application/document-application-capabilities';
import {documentApplicationPorts,type DocumentApplicationPort} from '../../application/document-application-ports';
import {applicationPresentations} from '../../application/application-presentations';
import {conversationDocument,conversationTabs} from './model';
import {createDialecticController,type DialecticController} from './controller';
import {DialecticDesktop,DialecticTextual} from './view';
import './view.css';
import {registerDcpTypes} from './dcp/markup';
import {RANGE_ANCHOR} from './anchors';

export const dialecticApplication=applicationKey<DocumentApplicationPort>('dialectic');
/** Presentation contribution is independent of the application registration. */
export function createDialecticTextualFeature(editor:ReactiveEditor,get:(app:DocumentApplicationInstance)=>DialecticController,create:(app:DocumentApplicationInstance)=>void):CodexFeature {
 return {id:'dialectic-textual',activate(scope){scope.own(applicationPresentations(editor).registerPresentation(dialecticApplication,{
  id:'dialectic.textual.editor',workspace:'textual',default:true,entryPriority:1,interaction:'exclusive-session',
  available:()=>editor.features.textualWorkspace&&editor.documentSessions?undefined:'Textual requires retained Document sessions',
  admit:p=>{try{const s=p.session();if(s)editor.documentSessions?.presentations.check(s);}catch(e){return String(e);}},
  view:p=><DialecticTextual controller={get(p.instance.application)} port={p.instance} active={p.host.active} create={()=>create(p.instance.application)}/>,
 }));}};
}
export function createDialecticFeature(editor:ReactiveEditor):CodexFeature {
 return {id:'dialectic',activate(scope){
  if(editor.features.nativeTextProtection)scope.own(editor.textProtection.register(record=>{
   const d=(record.payload.metadata as any)?.dialectic;return d?.kind==='contribution'&&['committed','receiving'].includes(d.state);
  }));
  if(editor.features.dialecticDcp)scope.own(registerDcpTypes(editor.visualEffects,editor.features.scopedSemantics,editor.features.dcpProactiveSemanticAuthoring));
  scope.own(editor.visualEffects.registerType({type:RANGE_ANCHOR,renderers:[]}));
  const controllers=new Map<DocumentApplicationInstance,{value:DialecticController;dispose:()=>void;registered:boolean}>();
  const ports=documentApplicationPorts(editor);
  const get=(app:DocumentApplicationInstance)=>{
   let entry=controllers.get(app);if(entry)return entry.value;
   entry=createRoot(dispose=>({value:createDialecticController(editor,()=>ports.ports().find(p=>p.application===app)),dispose,registered:false}));
   controllers.set(app,entry);return entry.value;
  };
  scope.own(()=>{for(const c of controllers.values()){c.value.dispose();c.dispose();}controllers.clear();});
  createRoot(dispose=>{scope.own(dispose);createEffect(()=>{const live=ports.ports();untrack(()=>{for(const [app,c]of controllers){if(live.some(p=>p.application===app))c.registered=true;else if(c.registered){c.value.dispose();c.dispose();controllers.delete(app);}}});});});
  const bank=()=>{
   const state=editor.repository.readState(),root=state.rootPlacementKey,content=state.contents[state.placements[root].contentKey];
   const banks=content.children.filter(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');
   if(banks.length>1)throw Error('Ambiguous workspace object bank');
   return banks[0]??editor.commands.insert({id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:root,index:content.children.length});
  };
  const createConversation=()=>{
   const doc=conversationDocument();editor.commands.structuralTransaction('New conversation',()=>{const parent=bank();editor.commands.insert(doc,{kind:'at',parentKey:parent,index:editor.commands.childrenOf(parent).length});});return String(doc.id);
  };
  documentApplicationCapabilities(editor,scope).register({applicationId:'dialectic',launch:false,type:'dialectic-application-block',create:conversationTabs,
   view:p=><DialecticDesktop application={p.application} controller={get(p.application)} create={()=>p.application.openDocument(createConversation())}/>,
  });
  scope.own(editor.commandRegistry.register({id:'dialectic.open',label:'Open Dialectic',canExecute:()=>editor.repository.readState().contents[editor.repository.readState().placements[editor.repository.readState().rootPlacementKey].contentKey].viewType==='workspace-block',execute(){
   const state=editor.repository.readState(),root=state.rootPlacementKey,owner=state.contents[state.placements[root].contentKey];
   const parent=owner.children.find(k=>['image-background-block','video-background-block','youtube-video-background-block','canvas-background-block'].includes(state.contents[state.placements[k].contentKey].viewType))??root;
   let placement='';editor.commands.structuralTransaction('Open Dialectic',()=>{
    const id=createConversation();placement=editor.commands.insert({id:crypto.randomUUID(),type:'window-block',metadata:{title:'Dialectic',position:{x:60,y:65},size:{w:Math.min(1250,Math.max(780,window.innerWidth-120)),h:Math.min(860,Math.max(560,window.innerHeight-130))},...editor.windowManager?.launchMetadata()},children:[conversationTabs([{id,title:'New conversation'}])]},{kind:'at',parentKey:parent,index:0});
   });editor.windowManager?.activatePlacement(placement);
  }},scope.owner));
  if(editor.features.applicationPresentations)scope.own(editor.featureHost.activate(createDialecticTextualFeature(editor,get,app=>app.openDocument(createConversation()))));
 }};
}
