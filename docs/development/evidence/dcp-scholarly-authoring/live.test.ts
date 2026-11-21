// @vitest-environment jsdom
// Opt-in, one bounded before/after sequence; no user Document or provider-history writes.
import {it,expect} from 'vitest';
import {loadEnvFile} from 'node:process';
import {readFileSync,writeFileSync} from 'node:fs';
import {workspaceFixture} from '../../../../src/features/dialectic/dcp/workspace.fixture';
import {conversation,providerTurn,continuation,repair} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';
import {proactiveEditorialPolicy} from '../../../../src/features/dialectic/dcp/editorial-policy';
import {scholarlyWorkspaceInstructions} from '../../../../src/features/dialectic/dcp/workspace';
import {validationDiagnostic,allowsSourceRecovery,sourceRecoveryTools} from '../../../../src/features/dialectic/dcp/diagnostics';
import {captureNative,nativeBytes,decodeNative} from '../../../../src/persistence/native-resource';
const directory='docs/development/evidence/dcp-scholarly-authoring';
const cases=[
 ['A','Discuss this supplied account without adding biographical facts: "Leonardo da Vinci moved from Florence to Milan to work for Ludovico Sforza. Ludovico commissioned The Last Supper from Leonardo. Leonardo painted Cecilia Gallerani. French forces under Louis XII conquered Milan in 1499, disrupting Ludovico\'s court and Leonardo\'s employment." What does this show about patronage? Keep your reply to about 120 words.'],
 ['B','Mercury can mean the Roman god, a planet or a chemical element. The god was identified with Hermes; the planet was named after the god; the element was associated with the planet in alchemy. Explain these distinctions briefly. In "Mercury fascinated Alex; it was dazzling", can we tell which Mercury is meant?'],
 ['C','Returning to Leonardo and Ludovico: Leonardo depended on Ludovico, but Leonardo\'s skills were portable. Ludovico lost Milan. Does that make Leonardo less vulnerable than Ludovico? Keep the response to about 90 words.'],
 ['D','Compare these readings of the supplied account: "Ludovico\'s patronage caused Leonardo\'s engineering advances" versus "Ludovico\'s court provided opportunities, but opportunities do not establish completed engineering work." Which inference is better supported, and what would distinguish them? Keep your answer concise.'],
 ['E','I\'m planning a weekend in Brisbane with Sam. We might visit the Queensland Art Gallery on Saturday and watch Spirited Away at home on Sunday. What would make this relaxed? Keep it friendly and brief.']
];
function persisted(snapshot:any){return Object.values(snapshot.contents).filter((c:any)=>c.viewType!=='text-cell').map((c:any)=>({blockId:c.payload.id,type:c.viewType,properties:c.payload.standoffProperties??[],definitions:c.payload.linkedAnnotations??{}})).sort((a,b)=>String(a.blockId).localeCompare(String(b.blockId)));}
it.skipIf(process.env.DCP_SCHOLARLY_LIVE!=='1')('GPT-6.1 Sol before/after A–E with native occurrence and persistence evidence',async()=>{
 if(!process.env.OPENAI_API_KEY)loadEnvFile('.env.local');const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY unavailable');
 const baselinePolicy=readFileSync(directory+'/baseline-policy.txt','utf8'),baselineWorkspace=readFileSync(directory+'/baseline-workspace.txt','utf8'),results:any[]=[];
 for(const variant of ['before','after']){
  const f=workspaceFixture();
  try{for(const [id,prompt] of cases){
   const human=f.addHuman(prompt),sources=f.open('general'),request=await f.req(sources,human,'sol',1);
   request.authoring.emptySemanticFields=1;if(variant==='before')request.authoring.instructions=request.authoring.instructions.replace(scholarlyWorkspaceInstructions,baselineWorkspace);
   request.task={action:'respond',focus:request.primaryReply,participantRequest:{handle:request.primaryReply,text:prompt}};
   const state=conversation({...defaultProviderSettings,model:'gpt-6.1-sol',maxOutputTokens:4096},request);if(variant==='before')state.system=state.system.replace(proactiveEditorialPolicy,baselinePolicy);
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000),result:any={variant,id,prompt,request,system:state.system,maxOutputTokens:4096,continuity:false,turns:[],startedUtc:new Date().toISOString()};results.push(result);let repaired=false,recover=false;
   try{for(let round=0;round<8;round++){
    const turn=await providerTurn(state,key,abort.signal,()=>{});result.turns.push(turn);
    if(turn.calls.length){if(repaired&&(!recover||turn.calls.some(c=>!sourceRecoveryTools.includes(c.tool as any))))throw Error('Unpermitted repair tool');const values=[];for(const call of turn.calls)values.push(await sources.tool(call));continuation(state,turn.calls,values);continue;}
    let p:Awaited<ReturnType<typeof f.admit>>;
    try{const value=JSON.parse(turn.text);result.response=value;p=await f.admit(sources,value,'sol',request);}
    catch(error){result.validationError=String(error);if(repaired)throw error;const diagnostic=validationDiagnostic(error);recover=allowsSourceRecovery(diagnostic);repair(state,diagnostic);repaired=true;continue;}
    const snapshot=captureNative(f.editor.repository.readState(),f.owner),bytes=nativeBytes(snapshot),decoded=decodeNative(bytes);
    expect(persisted(decoded)).toEqual(persisted(snapshot));
    Object.assign(result,{admitted:true,persistenceVerified:true,nativeBytes:bytes.length,definitions:p.definitions,aliases:p.aliases,children:p.children,annotations:[...p.annotations],persisted: persisted(decoded).filter(b=>b.properties.length||Object.keys(b.definitions).length)});break;
   }}catch(error){result.error=String(error)}finally{
    clearTimeout(timer);result.repaired=repaired;result.tools=sources.trail;result.completedUtc=new Date().toISOString();sources.dispose();writeFileSync(`${directory}/${variant}-${id}.json`,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({variant,id,admitted:result.admitted,error:result.error,entities:result.response?.entities?.length,arguments:result.response?.arguments?.length,relations:result.response?.relations?.length,interpretations:result.response?.interpretations?.length,glosses:result.response?.glosses?.length,usage:result.turns.map((t:any)=>t.receipt.usage)}));
   }
  }}finally{f.dispose();}
 }
 writeFileSync(`${directory}/summary.json`,JSON.stringify(results.map(({request,system,turns,response,definitions,aliases,children,annotations,persisted,tools,...r})=>({...r,usage:turns.map((t:any)=>t.receipt.usage),entities:response?.entities,relations:response?.relations,interpretations:response?.interpretations,glosses:response?.glosses,tools:tools?.map((t:any)=>t.call.tool)})),null,2)+'\n');
 expect(results.every(r=>r.admitted),results.filter(r=>!r.admitted).map(r=>r.error)).toBe(true);
},1250000);
