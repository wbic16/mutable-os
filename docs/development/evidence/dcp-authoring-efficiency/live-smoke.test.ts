// @vitest-environment jsdom
// Explicit opt-in: one provider call, synthetic Document, no retained conversation.
import {it,expect} from 'vitest';
import {loadEnvFile} from 'node:process';
import {writeFileSync} from 'node:fs';
import {workspaceFixture} from '../../../../src/features/dialectic/dcp/workspace.fixture';
import {emptySemanticFields,emptySemanticFieldsVersion} from '../../../../src/features/dialectic/dcp/empty-fields';
import {conversation,providerTurn} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';
import {canonicalSearchSource} from '../../../../src/runtime/canonical-search-source';

it.skipIf(process.env.DCP_EFFICIENCY_LIVE!=='1')('GPT-6.1 Sol accepts omitted fields and authors all three native aliases',async()=>{
 if(!process.env.OPENAI_API_KEY)loadEnvFile('.env.local');
 const key=process.env.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY unavailable');
 const f=workspaceFixture(),evidence:any={model:'gpt-6.1-sol',continuity:false,providerCalls:0,admitted:false};
 const prompt='This is a small endpoint compatibility check, not a request for analysis. Create one Document Entity named Provenance with id new:e1. Return one paragraph with id new:b1 and exactly this markup: <e ref="new:e1">Provenance</e> <b>supports</b> <i>careful</i> interpretation. Use the three short aliases exactly. Supply the other required fields of the negotiated schema, but omit suggestions and promotionRecommendations, which are absent from this schema. No tools or other semantic operations are needed.';
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),120000);
 try{
  const human=f.addHuman(prompt),sources=f.open('general'),request=await f.req(sources,human,'smoke-agent');
  request.authoring.emptySemanticFields=emptySemanticFieldsVersion;
  request.task={action:'respond',focus:request.primaryReply,participantRequest:{handle:request.primaryReply,text:prompt}};
  evidence.request=request;evidence.startedUtc=new Date().toISOString();
  const state=conversation({...defaultProviderSettings,provider:'openai',model:'gpt-6.1-sol'},request);
  const fetcher:typeof fetch=async(url,init)=>{
   evidence.providerCalls++;evidence.wire={endpoint:String(url),body:JSON.parse(init!.body as string)};
   // Deliberately never retain headers or credentials.
   const response=await fetch(url,init);evidence.httpStatus=response.status;return response;
  };
  const turn=await providerTurn(state,key,abort.signal,()=>{},fetcher);evidence.turn=turn;
  expect(evidence.providerCalls).toBe(1);expect(evidence.httpStatus).toBe(200);expect(turn.calls).toEqual([]);
  expect(evidence.wire.body.text.format.strict).toBe(true);expect(evidence.wire.body.store).toBe(false);
  const value=JSON.parse(turn.text);evidence.response=value;
  evidence.omittedFields=emptySemanticFields(sources.vocabulary);
  for(const field of evidence.omittedFields){expect(evidence.wire.body.text.format.schema.properties).not.toHaveProperty(field);expect(value).not.toHaveProperty(field)}
  expect(value.composition).toHaveLength(1);
  expect(value.composition[0].markup).toBe('<e ref="new:e1">Provenance</e> <b>supports</b> <i>careful</i> interpretation.');
  const prepared=await f.admit(sources,value,'smoke-agent',request);
  const contribution=f.view.node(f.root.children.at(-1)!)!,block=f.view.node(contribution.children[0])!;
  expect(block.viewType).toBe('standoff-editor-block');
  const source=await canonicalSearchSource(f.editor.repository.readState(),block.contentKey,0),text=source.runs.map(run=>run.text).join('');
  expect(text).toBe('Provenance supports careful interpretation.');
  const properties=block.payload.standoffProperties as any[];
  expect(properties.map(p=>[p.type,p.start,p.end])).toEqual([['mutable/entity-reference',0,9],['style/bold',11,18],['style/italics',20,26]]);
  const entity=prepared.aliases['new:e1'].entity!;
  expect(properties[0].metadata.entityReference).toEqual(entity);
  expect(Object.hasOwn(f.root.payload.linkedAnnotations??{},entity.entityId)).toBe(true);
  evidence.native={blockId:block.payload.id,type:block.viewType,text,properties,entity,definitions:prepared.definitions};
  evidence.admitted=true;
 }catch(error){evidence.error=String(error);throw error}
 finally{
  clearTimeout(timer);evidence.completedUtc=new Date().toISOString();f.dispose();
  writeFileSync('docs/development/evidence/dcp-authoring-efficiency/live-smoke.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({model:evidence.turn?.receipt.model,httpStatus:evidence.httpStatus,providerCalls:evidence.providerCalls,admitted:evidence.admitted,usage:evidence.turn?.receipt.usage,error:evidence.error}));
 }
},140000);
