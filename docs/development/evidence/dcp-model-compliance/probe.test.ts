// @vitest-environment jsdom
// Explicit opt-in investigation only. No production settings, user Documents or provider memory.
import {it} from 'vitest';
import {loadEnvFile} from 'node:process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ReactiveEditor} from '../../../../src/reactive-editor/editor';
import {registerApplicationViews} from '../../../../src/application/features';
import {DialecticReferences} from '../../../../src/features/dialectic/references';
import {defaultParticipant,conversationMetadata} from '../../../../src/features/dialectic/model';
import {DcpSources} from '../../../../src/features/dialectic/dcp/sources';
import {request,prepare} from '../../../../src/features/dialectic/dcp/exchange';
import {validationDiagnostic,allowsSourceRecovery} from '../../../../src/features/dialectic/dcp/diagnostics';
import {conversation,providerTurn,continuation,repair} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';

const enabled=process.env.DCP_COMPLIANCE_LIVE==='1';
const directory=process.env.DCP_COMPLIANCE_OUTPUT??'/tmp/dcp-model-compliance';
const prompts={
 A:'Explain in three short paragraphs why museum interpretations can change while remaining accountable to evidence.',
 B:'Compare handwritten notes, a spreadsheet, and a relational database in a table, with columns for best use and one limitation.',
 C:'Create a short heading and a grouped bullet list with a nested bullet list comparing observation and interpretation. Bold the phrase "material evidence" in your new explanation. Highlight the exact phrase "green patina" in the earlier AI-authored passage and add a short explanatory gloss to that source passage. Keep the response concise.',
};
for(const model of ['gpt-5.4','gpt-5.4-mini'])for(const [scenario,prompt]of Object.entries(prompts))it.skipIf(!enabled)(`${model} scenario ${scenario}`,async()=>{
 if(!process.env.OPENAI_API_KEY)loadEnvFile('.env.local');
 const key=process.env.OPENAI_API_KEY;
 if(!key)throw Error('OPENAI_API_KEY unavailable');
 mkdirSync(directory,{recursive:true});
 const owner='11111111-1111-4111-8111-111111111111',sourceId='22222222-2222-4222-8222-222222222222',humanId='33333333-3333-4333-8333-333333333333';
 const contribution=(id:string,author:'human'|'ai',ordinal:number,text:string)=>({id,type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author,participant:defaultParticipant(owner,author),ordinal,replies:[]}},children:[{id:author==='ai'?'44444444-4444-4444-8444-444444444444':'55555555-5555-4555-8555-555555555555',type:'standoff-editor-block',text}]});
 const editor=new ReactiveEditor({id:owner,type:'document-block',metadata:{dialectic:conversationMetadata},children:[contribution(sourceId,'ai',1,'The bronze vessel has a green patina. Material evidence constrains interpretation, but later communities can give an object new meanings.'),contribution(humanId,'human',2,prompt)]},{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,dialecticConversationUpdates:false,dialecticAutomaticTitles:false,dcpTestPhaseLogging:false}});
 registerApplicationViews(editor);const projection=editor.createView('compliance');const root=projection.node(projection.state.rootKey)!;
 const references=new DialecticReferences(editor,projection,root.key),abort=new AbortController();
 const sources=new DcpSources(editor,owner,()=>root.children.map(k=>projection.node(k)!),key=>projection.node(key),key=>projection.parentOf(key),t=>references.resolve(t),abort.signal,()=>[],120000);
 const result:any={model,scenario,prompt,reasoning:'low',maxOutputTokens:2048,continuity:false,turns:[],wire:[]};
 const timeout=setTimeout(()=>abort.abort(),120000);
 try{
  const primary=sources.issue({kind:'contribution',resourceId:owner,blockId:humanId}),v=sources.vocabulary!,s=v.stages;
  const req=request('COMPLIANCE_'+scenario,primary,[],[{handle:primary,plainTextExcerpt:prompt}],editor.visualEffects,true,sources.capabilities,s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v);
  Object.assign(req,{structuralContext:await sources.manifest([primary]),task:{action:'respond',focus:primary,participantRequest:{handle:primary,text:prompt}}});
  const state=conversation({...defaultProviderSettings,model},req);let repaired=false;
  for(let round=0;round<4;round++){
   const turn=await providerTurn(state,key,abort.signal,()=>{},async(url,init)=>{
    const body=JSON.parse(String(init?.body));body.reasoning={effort:'low'}; // Match both models without changing production defaults.
    result.wire.push({endpoint:String(url),body});
    return fetch(url,{...init,body:JSON.stringify(body)});
   });
   const attempt:any={...turn};result.turns.push(attempt);
   if(turn.calls.length){
    if(repaired&&turn.calls.some(c=>!['read_source','list_text_blocks','search_symposium'].includes(c.tool)))throw Error('Unpermitted repair tool');
    const values=[];for(const call of turn.calls)values.push(await sources.tool({id:call.id,tool:call.tool,arguments:call.arguments}));
    continuation(state,turn.calls,values);continue;
   }
   try{
    const prepared=await prepare(turn.text,req.exchange,owner,editor.visualEffects,sources,true,'ai');
    attempt.nativePrepared=true;
    editor.commands.boundedStructuralTransaction('Synthetic compliance admission',()=>{
     prepared.preparedResources.check();
     if(Object.keys(prepared.definitions).length)editor.commands.setPayloadField(root.key,'linkedAnnotations',{...root.payload.linkedAnnotations as any,...prepared.definitions});
     for(const [key,marks]of prepared.annotations){const node=projection.node(key)!;editor.commands.setPayloadField(key,'standoffProperties',[...node.payload.standoffProperties as any[]??[],...marks]);}
     if(prepared.preparedResources.leaves.size)throw Error('Unexpected media in synthetic fixture');
     editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'ai',ordinal:3,replies:[],participant:defaultParticipant(owner,'ai')}},children:prepared.children},{kind:'at',parentKey:root.key,index:root.children.length});
    });
    result.nativeAdmitted=true;result.response=JSON.parse(turn.text);result.children=prepared.children;result.annotationRefs=prepared.annotationRefs;result.definitions=prepared.definitions;result.sourceAnnotations=[...prepared.annotations].map(([key,marks])=>({blockId:projection.node(key)?.payload.id,marks}));break;
   }catch(error){attempt.error=String(error);attempt.diagnostic=validationDiagnostic(error);if(repaired)throw error;repaired=true;result.sourceRepairAllowed=allowsSourceRecovery(attempt.diagnostic);repair(state,attempt.diagnostic);}
  }
  result.repaired=repaired;if(!result.nativeAdmitted)result.error='Experiment round limit';
 }catch(error){result.error=String(error);}
 finally{
  result.tools=sources.trail;clearTimeout(timeout);sources.dispose();references.dispose();editor.dispose();
  writeFileSync(directory+'/'+model+'-'+scenario+'.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({model,scenario,nativeAdmitted:!!result.nativeAdmitted,error:result.error,turns:result.turns.length,tools:result.tools.map((x:any)=>x.call.tool)}));
 }
},125000);
