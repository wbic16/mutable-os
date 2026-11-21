import type {FeatureFlags} from '../../../configuration';
import {ReactiveEditor} from '../../../reactive-editor/editor';
import {registerApplicationViews} from '../../../application/features';
import {DialecticReferences} from '../references';
import {defaultParticipant,conversationMetadata} from '../model';
import {DcpSources} from './sources';
import {prepare,request} from './exchange';
import {semanticWorkspace,enableSemanticWorkspace} from './workspace';
export const workspaceOwner='11111111-1111-4111-8111-111111111111';
export function workspaceFixture(enabled=true,proactive=true,features:Partial<FeatureFlags>={}){
 const owner=workspaceOwner,editor=new ReactiveEditor({id:owner,type:'document-block',metadata:{dialectic:conversationMetadata},children:[]},{features:{dcpProactiveSemanticAuthoring:proactive,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,dialecticConversationUpdates:false,dialecticAutomaticTitles:false,dcpSemanticWorkspace:enabled,...features}});
 registerApplicationViews(editor);const view=editor.createView('workspace-fixture'),root=view.node(view.state.rootKey)!;let ordinal=0;
 const refs=new DialecticReferences(editor,view,root.key),sessions:DcpSources[]=[];
 const addHuman=(text:string)=>{const id=crypto.randomUUID();editor.commands.insert({id,type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'human',participant:defaultParticipant(owner,'human'),ordinal:++ordinal,replies:[]}},children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text}]},{kind:'at',parentKey:root.key,index:root.children.length});return id;};
 const open=(profile:'general'|'research'='general')=>{const s=new DcpSources(editor,owner,()=>root.children.map(k=>view.node(k)!),k=>view.node(k),k=>view.parentOf(k),t=>refs.resolve(t),new AbortController().signal,id=>refs.relationsFor(id),120000,id=>refs.argumentsFor(id),{profile},refs);sessions.push(s);return s;};
 const req=async(sources:DcpSources,blockId:string,participantId='agent-A',proactiveSemantics?:1)=>{
  const v=sources.vocabulary!,s=v.stages,primary=sources.issue({kind:'contribution',resourceId:owner,blockId});
  const r=request(crypto.randomUUID(),primary,[],[],editor.visualEffects,true,sources.capabilities,s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v),structuralContext=await sources.manifest([primary],enabled?64000-8192:64000);
  if(proactiveSemantics)Object.assign(r.authoring,{proactiveSemantics});
  Object.assign(r,{structuralContext});if(enabled){enableSemanticWorkspace(r);Object.assign(r,{semanticWorkspace:await semanticWorkspace(sources,participantId,structuralContext.sources.map(x=>x.target).filter(Boolean))});}return r as any;
 };
 const admit=async(sources:DcpSources,value:any,participantId='agent-A',r?:any)=>{
  const prepared=await prepare(JSON.stringify(value),value.exchange,owner,editor.visualEffects,sources,true,'ai',participantId,r?.authoring?.emptySemanticFields,r?.authoring?.proactiveSemantics,r?.dialect==='xml/1');sources.check();
  editor.commands.boundedStructuralTransaction('Semantic workspace contribution',()=>{
   prepared.preparedResources.check();if(prepared.preparedResources.leaves.size)throw Error('Media outside fixture');
   if(Object.keys(prepared.definitions).length)editor.commands.setPayloadField(root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(root.payload.linkedAnnotations??{})),...prepared.definitions});
   for(const [key,marks]of prepared.annotations)editor.commands.setPayloadField(key,'standoffProperties',[...JSON.parse(JSON.stringify(view.node(key)!.payload.standoffProperties??[])),...marks]);
   editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'ai',participant:{id:participantId,kind:'ai',name:participantId},ordinal:++ordinal,replies:[],dcp:{version:1,identityMap:prepared.aliases,annotationRefs:prepared.annotationRefs,...(r?{request:JSON.parse(JSON.stringify(r)),response:JSON.stringify(value)}:{})}}},children:prepared.children},{kind:'at',parentKey:root.key,index:root.children.length});
  });return prepared;
 };
 return {owner,editor,view,root,refs,addHuman,open,req,admit,dispose(){sessions.forEach(s=>s.dispose());refs.dispose();editor.dispose();}};
}
export function workspaceResponse(exchange:string,ref='new:e1'):any{return {protocol:'dcp/1.0',kind:'contribution',exchange,intent:'reply',replyTargets:[],composition:[{id:'new:b1',kind:'paragraph',markup:`<annotation type="mutable/entity-reference" ref="${ref}">Authenticity</annotation> depends on evidence.`,ranges:[],textStyle:null,margins:null}],entities:ref==='new:e1'?[{id:ref,name:'Authenticity',typename:'Concept',description:'Criteria for genuineness.',aliases:['Genuineness']}]:[],anchors:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]};}
