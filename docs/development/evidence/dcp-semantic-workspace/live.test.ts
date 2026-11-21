// @vitest-environment jsdom
// Explicit opt-in; synthetic Document, no user files or retained provider session.
import {it,expect} from 'vitest';
import {loadEnvFile} from 'node:process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {workspaceFixture} from '../../../../src/features/dialectic/dcp/workspace.fixture';
import {conversation,providerTurn,continuation,repair} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';
import {validationDiagnostic,allowsSourceRecovery,sourceRecoveryTools} from '../../../../src/features/dialectic/dcp/diagnostics';
const prompts=[
 'What makes a historical object authentic? I am especially interested in whether original material or continuity of history matters more. Keep your answer concise.',
 'Suppose a museum restores a damaged object using some modern material, but has an excellent record of where it came from. How would you assess that case?',
 'Could a reconstruction ever preserve something important that the original material no longer does? Relate that to the criteria we have been discussing.'
];
it.skipIf(process.env.DCP_WORKSPACE_LIVE!=='1')('ordinary authenticity conversation, N → N+1 → second agent N+2',async()=>{
 if(!process.env.OPENAI_API_KEY)loadEnvFile('.env.local');const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY unavailable');
 const f=workspaceFixture(),directory='docs/development/evidence/dcp-semantic-workspace';mkdirSync(directory,{recursive:true});const results:any[]=[];
 try{for(let n=0;n<prompts.length;n++){
  const actor=n===2?'agent-B':'agent-A',id=f.addHuman(prompts[n]),sources=f.open('research'),req=await f.req(sources,id,actor);
  Object.assign(req,{task:{action:'respond',focus:req.primaryReply,participantRequest:{handle:req.primaryReply,text:prompts[n]}}});
  const state=conversation(defaultProviderSettings,req),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
  const result:any={exchange:n+1,participant:actor,prompt:prompts[n],request:req,continuity:false,turns:[],started:Date.now()};results.push(result);let repaired=false,recover=false;
  try{for(let round=0;round<8;round++){
   const turn=await providerTurn(state,key,abort.signal,()=>{});result.turns.push(turn);
   if(turn.calls.length){if(repaired&&(!recover||turn.calls.some(c=>!sourceRecoveryTools.includes(c.tool as any))))throw Error('Unpermitted repair tool');const values=[];for(const call of turn.calls)values.push(await sources.tool(call));continuation(state,turn.calls,values);continue;}
   try{const value=JSON.parse(turn.text),prepared=await f.admit(sources,value,actor,req);result.response=value;result.definitions=prepared.definitions;result.identityMap=prepared.aliases;result.annotationRefs=prepared.annotationRefs;result.admitted=true;break;}
   catch(error){result.validationError=String(error);if(repaired)throw error;const diagnostic=validationDiagnostic(error);recover=allowsSourceRecovery(diagnostic);repair(state,diagnostic);repaired=true;}
  }}catch(error){result.error=String(error);}finally{clearTimeout(timer);result.elapsedMs=Date.now()-result.started;result.repaired=repaired;result.tools=sources.trail;result.diagnostics={...sources.diagnostics};sources.dispose();writeFileSync(directory+`/exchange-${n+1}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({exchange:n+1,admitted:result.admitted,error:result.error,entities:result.response?.entities.length,glosses:result.response?.glosses.length,workspaceBytes:req.semanticWorkspace.coverage.bytes,tools:result.tools.map((x:any)=>x.call.tool)}));}
  expect(result.admitted,result.error??result.validationError).toBe(true);
 }
 expect(results.some(r=>r.response.entities.length>0)).toBe(true);
 const cross=results[2],handles=cross.request.semanticWorkspace.entities.map((e:any)=>e.handle);expect(handles.some((h:string)=>JSON.stringify(cross.response.composition).includes(h))).toBe(true);expect(cross.tools.some((x:any)=>x.call.tool==='search_entities')).toBe(false);expect(cross.response.arguments.length+cross.response.relations.length+cross.response.glosses.length).toBeGreaterThan(0);
 }finally{f.dispose();writeFileSync(directory+'/summary.json',JSON.stringify(results.map(({request,turns,response,definitions,tools,...r})=>({...r,workspace:request.semanticWorkspace,usage:turns.map((t:any)=>t.receipt.usage),entities:response?.entities,glosses:response?.glosses,tools:tools?.map((x:any)=>x.call.tool)})),null,2));}
},380000);
