// @vitest-environment jsdom
// Opt-in bounded comparison; isolated native Documents, no user files/history.
import {it,expect} from 'vitest';
import {loadEnvFile} from 'node:process';
import {writeFileSync} from 'node:fs';
import {workspaceFixture} from '../../../../src/features/dialectic/dcp/workspace.fixture';
import {conversation,providerTurn,continuation,repair} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';
import {validationDiagnostic,allowsSourceRecovery,sourceRecoveryTools} from '../../../../src/features/dialectic/dcp/diagnostics';
const directory='docs/development/evidence/dcp-proactive-semantic-authoring';
const theseus='A maintained ship gradually receives replacement planks; its original planks are later assembled into a reconstructed ship. Which ship is the original? Compare historical continuity, material continuity and numerical identity. Please keep the discussion concise.';
const cases=[
 {id:'baseline-A',prompt:theseus,proactive:false},
 {id:'A',prompt:theseus,proactive:true},
 {id:'B',prompt:'I think the maintained ship must be the original because its use and history continued without interruption. Material continuity is irrelevant. Is that reasoning sound?',proactive:true},
 {id:'C',prompt:'Consider this invented diary passage, not a real historical source: “On Monday, Marta the bronze worker carried the cracked bell from the riverside chapel to the guild workshop. The council ordered repairs before the autumn procession, but the guild refused payment until the crack was assessed.” What does the passage reveal about roles, objects, events and uncertainty? Keep the response concise and do not add historical facts.',proactive:true},
 {id:'D',prompt:'Thanks! Have a lovely afternoon.',proactive:true}
];
it.skipIf(process.env.DCP_PROACTIVE_LIVE!=='1')('small GPT-6.1 Sol baseline and A–D native semantic exercise',async()=>{
 if(!process.env.OPENAI_API_KEY)loadEnvFile('.env.local');const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY unavailable');
 const results:any[]=[];let ongoing:ReturnType<typeof workspaceFixture>|undefined;
 try{for(const test of cases){
  const f=test.id==='B'?ongoing!:workspaceFixture(true,test.proactive);if(test.id==='A')ongoing=f;
  const human=f.addHuman(test.prompt),sources=f.open('general'),request=await f.req(sources,human,'sol');
  Object.assign(request.authoring,{emptySemanticFields:1,...(test.proactive?{proactiveSemantics:1}:{})});
  request.task={action:'respond',focus:request.primaryReply,participantRequest:{handle:request.primaryReply,text:test.prompt}};
  // Explicit qualification setting; the production default is left unchanged.
  const state=conversation({...defaultProviderSettings,model:'gpt-6.1-sol',maxOutputTokens:4096},request),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
  const result:any={id:test.id,request,system:state.system,continuity:false,maxOutputTokens:4096,turns:[],startedUtc:new Date().toISOString()};results.push(result);let repaired=false,recover=false;
  try{for(let round=0;round<8;round++){
   const turn=await providerTurn(state,key,abort.signal,()=>{});result.turns.push(turn);
   if(turn.calls.length){if(repaired&&(!recover||turn.calls.some(c=>!sourceRecoveryTools.includes(c.tool as any))))throw Error('Unpermitted repair tool');const values=[];for(const call of turn.calls)values.push(await sources.tool(call));continuation(state,turn.calls,values);continue;}
   try{const value=JSON.parse(turn.text);result.response=value;const p=await f.admit(sources,value,'sol',request);Object.assign(result,{admitted:true,definitions:p.definitions,aliases:p.aliases,children:p.children,annotations:[...p.annotations]});break;}
   catch(error){result.validationError=String(error);if(repaired)throw error;const diagnostic=validationDiagnostic(error);recover=allowsSourceRecovery(diagnostic);repair(state,diagnostic);repaired=true;}
  }}catch(error){result.error=String(error)}finally{
   clearTimeout(timer);result.repaired=repaired;result.tools=sources.trail;result.completedUtc=new Date().toISOString();sources.dispose();writeFileSync(`${directory}/${test.id}.json`,JSON.stringify(result,null,2)+'\n');
   console.log(JSON.stringify({id:test.id,admitted:result.admitted,error:result.error,entities:result.response?.entities?.length,arguments:result.response?.arguments?.length,relations:result.response?.relations?.length,glosses:result.response?.glosses?.length,usage:result.turns.map((t:any)=>t.receipt.usage)}));
   if(test.id!=='A'&&test.id!=='B')f.dispose();
  }
 }
 expect(results.every(r=>r.admitted),results.filter(r=>!r.admitted).map(r=>r.error)).toBe(true);
 }finally{ongoing?.dispose();writeFileSync(`${directory}/summary.json`,JSON.stringify(results.map(({request,system,turns,response,definitions,aliases,children,annotations,tools,...r})=>({...r,usage:turns.map((t:any)=>t.receipt.usage),entities:response?.entities,arguments:response?.arguments,relations:response?.relations,glosses:response?.glosses,tools:tools?.map((t:any)=>t.call.tool)})),null,2)+'\n');}
},650000);
