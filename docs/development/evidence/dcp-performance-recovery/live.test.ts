// @vitest-environment jsdom
// Opt-in bounded recovery qualification. Synthetic Documents and temporary continuity store only.
import {it,expect} from 'vitest';
import {createRequire} from 'node:module';

// Bundle the server service into a native Node module: Vite otherwise rewrites its filesystem worker URL.
import {loadEnvFile} from 'node:process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {workspaceFixture} from '../../../../src/features/dialectic/dcp/workspace.fixture';
import {ConversationHistory} from '../../../../src/features/dialectic/continuity';

import {conversation,providerTurn,continuation,repair} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';
import {validationDiagnostic,allowsSourceRecovery,sourceRecoveryTools} from '../../../../src/features/dialectic/dcp/diagnostics';
import {captureNative,nativeBytes,decodeNative} from '../../../../src/persistence/native-resource';
const directory='docs/development/evidence/dcp-performance-recovery';
const historical="I've always been fascinated by the relationship between Leonardo da Vinci and the Sforza court in Milan. Ludovico Sforza seems to have valued Leonardo as much for his engineering abilities as for his painting. How did Leonardo first enter Ludovico's service, and what were the major projects he undertook there?";
const scenarios=[['A', ['What is a palimpsest? Two sentences, please.']],['C', [historical,
 'Could we say Ludovico treated Leonardo mainly as an engineer? Give a brief competing interpretation.',
 'Please return to my first question and distinguish what it states from what your reply inferred about Ludovico. Keep it brief.',
 'My interpretation is that court patronage enabled ambitious projects but also made Leonardo vulnerable to political change. Do you agree? Briefly explain.',
 'Summarise our points of agreement and disagreement in about 100 words, referring to the earlier interpretations.']]] as const;
it.skipIf(process.env.DCP_RECOVERY_LIVE!=='1')('bounded A, B and ten-contribution C through retained conversation and native admission',async()=>{
 const bundleDir=mkdtempSync(tmpdir()+'/dcp-recovery-server-'),bundle=bundleDir+'/conversations.cjs';
 await(await import('esbuild')).build({entryPoints:['server/dialectic/conversations.ts'],outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external'});
 const {OpenAIConversations}=createRequire(bundle)(bundle);
 if(!process.env.OPENAI_API_KEY)loadEnvFile('.env.local');const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY unavailable');
 let input=0,output=0,calls=0;const results:any[]=[],scope={path:mkdtempSync(tmpdir()+'/dcp-recovery-'),cavernGuid:'recovery-fixture',session:'recovery-fixture'};
 try{for(const [scenario,prompts]of scenarios){
 const f=workspaceFixture(),history=new ConversationHistory(f.editor);f.editor.setAssetContext(()=>({cavernId:scope.cavernGuid,session:scope.session}));
 const build=()=>history.build(f.owner,'sol',f.root.children.map(k=>f.view.node(k)!.contentKey));
 let current:any;const fetcher:typeof fetch=async(url,init)=>{
  const started=performance.now(),body=init?.body?JSON.parse(String(init.body)):undefined;
  const wire:any={url:String(url),method:init?.method??'GET',body,startedUtc:new Date().toISOString()};current.wire.push(wire);
  const response=await fetch(url,init);wire.headersMs=performance.now()-started;wire.status=response.status;return response;
 };
 const service=new OpenAIConversations(()=>scope,fetcher);
 try{for(const [index,prompt]of prompts.entries()){
  if(input>140000||output>20000||calls>=12)throw Error('Qualification spending bound reached; do not retry automatically.');
  current={id:scenario==='C'&&index===0?'B':scenario+(index+1),prompt,wire:[],turns:[],timings:{},startedUtc:new Date().toISOString()};results.push(current);
  const start=performance.now(),human=f.addHuman(prompt),sources=f.open('general'),request=await f.req(sources,human,'sol',1);
  request.authoring.emptySemanticFields=1;request.task={action:'respond',focus:request.primaryReply,participantRequest:{handle:request.primaryReply,text:prompt}};
  const state=conversation({...defaultProviderSettings,maxOutputTokens:4096},request);current.request=request;current.contract=state.system;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);let receipt:any,repaired=false,recover=false;
  try{
   const native=await build();current.timings.assemblyMs=performance.now()-start;
   const prep=performance.now(),plan=await service.plan(native.manifest,key,state.system);
   receipt=await service.begin(native.manifest,plan,native.items.slice(plan.start),request.exchange,key,abort.signal,state.system);
   state.conversationId=receipt.conversationId;state.contractInitialised=true;state.onResponse=async(id:string)=>{(current.responseIds??=[]).push(id);await service.response(native.manifest,key,request.exchange,id);};
   current.continuity={...receipt,start:plan.start,recovery:plan.recovery};current.timings.continuityMs=performance.now()-prep;
   for(let round=0;round<8;round++){
    if(calls>=12||input>140000||output>20000)throw Error('Qualification spending bound reached');calls++;
    const turn=await providerTurn(state,key,abort.signal,()=>{},fetcher);current.turns.push(turn);input+=turn.receipt.usage?.input_tokens??0;output+=turn.receipt.usage?.output_tokens??0;
    if(turn.calls.length){if(repaired&&(!recover||turn.calls.some(c=>!sourceRecoveryTools.includes(c.tool as any))))throw Error('Invalid repair tool');const t=performance.now(),values=[];for(const call of turn.calls)values.push(await sources.tool(call));current.timings.toolsMs=(current.timings.toolsMs??0)+performance.now()-t;continuation(state,turn.calls,values);continue;}
    const t=performance.now();let p:any;
    try{current.response=JSON.parse(turn.text);p=await f.admit(sources,current.response,'sol',request);}
    catch(error){current.validationError=String(error);if(repaired)throw error;const diagnostic=validationDiagnostic(error);recover=allowsSourceRecovery(diagnostic);repair(state,diagnostic);repaired=true;continue;}
    current.timings.admissionMs=performance.now()-t;current.definitions=p.definitions;current.annotations=[...p.annotations];current.children=p.children;
    const pt=performance.now(),snapshot=captureNative(f.editor.repository.readState(),f.owner),bytes=nativeBytes(snapshot),decoded=decodeNative(bytes);
    writeFileSync(scope.path+'/'+current.id+'.ink',bytes);expect(Object.keys(decoded.contents).length).toBe(Object.keys(snapshot.contents).length);
    current.timings.persistenceMs=performance.now()-pt;current.nativeBytes=bytes.length;
    await service.prepared(native.manifest,key,request.exchange,repaired);const after=await build();await service.acknowledge(after.manifest,key,receipt);
    current.admitted=true;current.nativeContributions=after.items.length;break;
   }
  }catch(error){current.error=String(error);if((error as any).receipt){current.failedReceipt=(error as any).receipt;input+=current.failedReceipt.usage?.input_tokens??0;output+=current.failedReceipt.usage?.output_tokens??0;}if(receipt)await service.abandon((await build()).manifest,key,request.exchange);}
  finally{clearTimeout(timer);current.tools=sources.trail;current.repaired=repaired;current.timings.totalMs=performance.now()-start;current.completedUtc=new Date().toISOString();sources.dispose();writeFileSync(directory+'/'+current.id+'.json',JSON.stringify(current,null,2)+'\n');console.log(JSON.stringify({id:current.id,admitted:current.admitted,error:current.error,timings:current.timings,usage:current.turns.map((x:any)=>x.receipt.usage),entities:current.response?.entities?.length,relationships:current.response?.relations?.length}));}
  if(!current.admitted)break;
 }
 }finally{history.dispose();f.dispose();}
 }}finally{rmSync(scope.path,{recursive:true,force:true});rmSync(bundleDir,{recursive:true,force:true});writeFileSync(directory+'/summary.json',JSON.stringify({input,output,calls,results:results.map(({request,contract,wire,turns,response,definitions,annotations,children,tools,...r})=>({...r,usage:turns.map((t:any)=>t.receipt.usage),tools:tools.map((t:any)=>t.call.tool),entities:response?.entities,relationships:response?.relations,interpretations:response?.interpretations,glosses:response?.glosses}))},null,2)+'\n');}
 expect(results).toHaveLength(6);expect(results.every(x=>x.admitted)).toBe(true);expect(results.at(-1).nativeContributions).toBe(10);
},900000);
