// @vitest-environment node
/** Opt-in offline wire capture. Credentials and external calls are never used. */
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {conversation,providerTurn} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';
import {inlineAliasInstructions} from '../../../../src/features/dialectic/dcp/authoring';
import {emptySemanticFields} from '../../../../src/features/dialectic/dcp/empty-fields';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
it.skipIf(process.env.DCP_EFFICIENCY_OFFLINE!=='1')('captures the implemented projection against the same retained request context',async()=>{
 const output:any[]=[];
 for(const [name,original]of [
  ['editorial-general',JSON.parse(read('/tmp/dcp-editorial-authoring/gpt-5.4-A.json').wire[0].body.input[0].content)],
  ['editorial-core',JSON.parse(read('/tmp/dcp-editorial-authoring/gpt-5.4-D.json').wire[0].body.input[0].content)],
  ['workspace-3',read('docs/development/evidence/dcp-semantic-workspace/exchange-3.json').request]
 ] as const)for(const provider of ['openai','anthropic'] as const){
  const capture=async(req:any)=>{
   let body:any;const state=conversation({...defaultProviderSettings,provider},req);
   await expect(providerTurn(state,'unused',new AbortController().signal,()=>{},async(_url,init)=>{body=JSON.parse(init!.body as string);return new Response('',{status:418})})).rejects.toThrow('HTTP 418');return body;
  };
  const originalCopy=structuredClone(original),dedup=await capture(original),before=structuredClone(dedup),inputKey=provider==='openai'?'input':'messages';
  // Controlled baseline: reconstruct ONLY the former full-request user projection.
  // It uses the same current system/schema/settings, not a claimed historical wire receipt.
  const scope=JSON.parse(before[inputKey][0].content).capabilityScope;
  before[inputKey][0].content=JSON.stringify({...original,capabilityScope:scope});
  const next=structuredClone(original);next.authoring.instructions+=inlineAliasInstructions(next.legend.types.map((t:any)=>t.type));next.authoring.emptySemanticFields=1;
  const after=await capture(next),projected=JSON.parse(after[inputKey][0].content);
  expect(original).toEqual(originalCopy);expect(projected.authoring.examples).toEqual(original.authoring.examples);expect(projected.semanticWorkspace).toEqual(original.semanticWorkspace);expect(projected.structuralContext).toEqual(original.structuralContext);
  output.push({name,provider,before,dedup,after,omitted:emptySemanticFields(next.vocabulary)});
 }
 writeFileSync('/tmp/dcp-efficiency-qualified-wire.json',JSON.stringify(output));
});
