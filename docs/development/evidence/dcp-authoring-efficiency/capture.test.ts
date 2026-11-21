/** Offline request reconstruction; intentionally opt-in, never calls a provider. */
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {conversation,providerTurn} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from '../../../../src/features/dialectic/dcp/provider-contract';
import {dcpEditorialPolicy} from '../../../../src/features/dialectic/dcp/editorial-policy';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
it.skipIf(process.env.DCP_EFFICIENCY_OFFLINE!=='1')('captures current schema projections without network access',async()=>{
 const data:any={editorialPolicy:dcpEditorialPolicy,requests:{}};
 for(const [name,request]of [
  ['workspace-3',read('docs/development/evidence/dcp-semantic-workspace/exchange-3.json').request],
  ['editorial-core',JSON.parse(read('/tmp/dcp-editorial-authoring/gpt-5.4-D.json').wire[0].body.input[0].content)]
 ] as const){
  for(const provider of ['openai','anthropic'] as const){
   let body:any;
   const fetcher:typeof fetch=async(_url,init)=>{body=JSON.parse(init!.body as string);return new Response('',{status:418})};
   await expect(providerTurn(conversation({...defaultProviderSettings,provider,model:'offline-only'},request),'not-a-credential',new AbortController().signal,()=>{},fetcher)).rejects.toThrow('HTTP 418');
   expect(body).toBeDefined();data.requests[name+'-'+provider]=body;
  }
 }
 writeFileSync('/tmp/dcp-efficiency-reconstructed.json',JSON.stringify(data));
});
