import {expect,it} from 'vitest';
import {lowerXml} from './xml-authoring';
import {conversation} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from './provider-contract';
const authority={resolve:(s:string)=>s,revision:()=>''};
it('keeps optional Synopsis metadata out of DCP composition and accepts rootless/legacy order',()=>{
 for(const wrap of [false,true]){
  const accepted:string[]=[],xml='<synopsis>First title</synopsis><p>Content.</p><synopsis> Last valid title </synopsis><synopsis target="elsewhere">Wrong</synopsis><synopsis><b>Wrong</b></synopsis><synopsis> </synopsis><synopsis>'+ 'x'.repeat(161)+'</synopsis>';
  const result=lowerXml(wrap?'<response>'+xml+'</response>':xml,'x',authority,t=>accepted.push(t));
  expect(accepted).toEqual(['First title','Last valid title']);expect(result.composition).toHaveLength(1);expect(result.composition[0].markup).toBe('Content.');expect(result.synopsis).toBeUndefined();
 }
 expect(lowerXml('<p>No synopsis.</p>','x',authority).composition).toHaveLength(1);
});
it('advertises Synopsis only when the feature is negotiated, without extra targeting or inference',()=>{
 const request={dialect:'xml/1',exchange:'x',xmlContext:{dialect:'xml/1',exchange:'x'},synopsisAuthoring:1};
 expect(conversation(defaultProviderSettings,request).system).toContain('<synopsis>3–8 word title</synopsis>');
 expect(conversation(defaultProviderSettings,{...request,synopsisAuthoring:undefined}).system).not.toContain('<synopsis>');
});
