// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {conversation,continuation,providerTurn,repair} from './providers';
import {schemaFor} from '../../src/features/dialectic/dcp/provider-schema';
import {plainContribution,sse,streamFixture} from './fixtures';
import {defaultProviderSettings,type Provider} from '../../src/features/dialectic/dcp/provider-contract';
const request={exchange:'exchange',protocolKey:{text:'Use DCP; semantic markup is optional.'}};
it.each(['openai','anthropic'] as Provider[])('%s removes only duplicate user guidance and preserves diagnostics, examples and authority',async provider=>{
 const full={...request,protocolKey:{version:'fixture',text:request.protocolKey.text},authoring:{version:1,instructions:'Unique authoritative authoring instruction.',examples:[{response:plainContribution('exchange')}],emptySemanticFields:1},semanticWorkspace:{authority:'current-exchange',entities:[{handle:'src:current:e1'}]},structuralContext:{sources:[{handle:'src:current:b1',revision:'current-revision'}]}};
 const before=structuredClone(full),state=conversation({...defaultProviderSettings,provider},full),fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 for(const phase of ['initial','continuation','repair']){
  if(phase==='continuation')continuation(state,[],[]);if(phase==='repair')repair(state,{code:'invalid-shape'});
  await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 }
 expect(full).toEqual(before);
 for(const [,init]of fetcher.mock.calls){
  const body=JSON.parse(String(init?.body)),system=body.instructions??body.system,projected=JSON.parse((body.input??body.messages)[0].content);
  expect(system.split(full.protocolKey.text)).toHaveLength(2);expect(system.split(full.authoring.instructions)).toHaveLength(2);
  expect(projected.protocolKey).toBeUndefined();expect(projected.authoring).toBeUndefined();const reference=JSON.parse(system.split('DCP AUTHORING REFERENCE (examples are illustrative placeholders, never source authority): ')[1].split('\nTOOL CONTINUATION:')[0]);expect(reference.authoring).toEqual({version:1,examples:full.authoring.examples,emptySemanticFields:1});
  expect(projected.semanticWorkspace).toEqual(full.semanticWorkspace);expect(projected.structuralContext).toEqual(full.structuralContext);
  const schema=body.text?.format.schema??body.output_config.format.schema;
  expect(schema.properties.suggestions).toBeUndefined();expect(schema.properties.promotionRecommendations).toBeUndefined();expect(schema.required).toContain('entities');
  expect(system).toContain('Empty semantic fields v1: omit suggestions, promotionRecommendations');
  if(provider==='openai')expect(body.text.format.strict).toBe(true);
 }
 expect(()=>conversation(defaultProviderSettings,{...full,authoring:{...full.authoring,emptySemanticFields:2}})).toThrow('Unsupported empty semantic fields version');
});
it.each(['openai','anthropic'] as Provider[])('%s advertises negotiated catalogue discovery and continues its results',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,capabilities:{version:1,items:[]},legend:{tools:['describe_capabilities']}});
 const fetcher=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'catalogue',name:'describe_capabilities',arguments:{ids:['composition.table','semantic.gloss']}})))
  .mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 const signal=new AbortController().signal,turn=await providerTurn(state,'fixture',signal,()=>{},fetcher);
 expect(turn.calls[0].tool).toBe('describe_capabilities');
 continuation(state,turn.calls,[{status:'complete',items:[{id:'composition.table',authorable:true}]}]);
 await providerTurn(state,'fixture',signal,()=>{},fetcher);
 for(const [,init]of fetcher.mock.calls){const body=JSON.parse(String(init?.body)),tool=body.tools.find((t:any)=>t.name==='describe_capabilities');expect(tool).toBeDefined();expect(tool.parameters??tool.input_schema).toMatchObject({required:['ids'],additionalProperties:false,properties:{ids:{maxItems:4}}});}
 expect(String(fetcher.mock.calls[1][1]?.body)).toContain('authorable');
 const disabled=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,'',{id:'unadvertised',name:'describe_capabilities',arguments:{ids:['composition.table']}})));
 await expect(providerTurn(conversation({...defaultProviderSettings,provider},request),'fixture',signal,()=>{},disabled)).rejects.toThrow('Unadvertised');
 expect(JSON.parse(String(disabled.mock.calls[0][1]?.body)).tools.map((t:any)=>t.name)).not.toContain('describe_capabilities');
});
it.each(['openai','anthropic'] as Provider[])('%s sends strict schemas with every required field defined and every reference resolvable',async provider=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(conversation({...defaultProviderSettings,provider},request),'fixture-only-key',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
 const schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 const check=(root:any)=>{
  const walk=(value:any,path:string)=>{
   if(!value||typeof value!=='object')return;
   if(value.type==='object'){
    expect(value.additionalProperties,path).toBe(false);
    expect([...value.required].sort(),path).toEqual(Object.keys(value.properties).sort());
   }
   if(value.$ref)expect(root.$defs?.[value.$ref.replace('#/$defs/','')],path).toBeDefined();
   for(const [key,child] of Object.entries(value))walk(child,path+'/'+key);
  };
  walk(root,'schema');
 };
 check(schema);
 for(const tool of body.tools)check(provider==='openai'?tool.parameters:tool.input_schema);
 expect(schema.$defs.LocalEntity.properties.description).toEqual({type:'string'});
});
it.each(['openai','anthropic'] as Provider[])('%s streams structured output and continues native tool calls without hosted history',async provider=>{
 const state=conversation({...defaultProviderSettings,provider,model:'configured-model'},request),signal=new AbortController().signal;
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'call-1',name:'read_source',arguments:{handle:'source-1'}}))).mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 const a=await providerTurn(state,'secret-fixture',signal,()=>{},fetcher);expect(a.calls).toHaveLength(1);continuation(state,a.calls,[{status:'complete',text:'Saturday?'}]);
 const chunks:string[]=[];const b=await providerTurn(state,'secret-fixture',signal,t=>chunks.push(t),fetcher);expect(JSON.parse(b.text).composition[0].markup).toContain('picnic');expect(b.receipt.usage?.output_tokens).toBe(20);expect(b.receipt.cost.status).toBe('unknown');expect(chunks.at(-1)).toBe(b.text);
 const body=JSON.parse(String(fetcher.mock.calls[1][1]?.body));expect(body.previous_response_id).toBeUndefined();expect(JSON.stringify(body)).toContain('Saturday?');expect(JSON.stringify(body)).not.toContain('secret-fixture');expect(body.model).toBe('configured-model');
 if(provider==='openai'){expect(body.store).toBe(false);expect(body.input.some((v:any)=>v.type==='function_call_output'&&v.call_id==='call-1')).toBe(true);expect(body.text.format.strict).toBe(true);}else{expect(body.messages.at(-1).content[0].tool_use_id).toBe('call-1');expect(body.output_config.format.type).toBe('json_schema');}
 repair(state);expect(JSON.stringify(state.input.at(-1))).toContain('corrected complete contribution');
});
it.each(['openai','anthropic'] as Provider[])('%s rejects token limits, refusals, truncated streams and arbitrary tools',async provider=>{
 const state=()=>conversation({...defaultProviderSettings,provider,model:'m'},request),signal=new AbortController().signal;
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(streamFixture(provider,'partial',undefined,provider==='openai'?'incomplete':'max_tokens')))).rejects.toThrow('incomplete');
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(streamFixture(provider,'').slice(0,-1)))).rejects.toThrow('interrupted');
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(streamFixture(provider,'',{id:'bad',name:'shell',arguments:{}})))).rejects.toThrow('Unsupported provider tool');
 const refused=provider==='openai'?[{type:'response.refusal.delta',delta:'no'}]:streamFixture(provider,'',undefined,'refusal');await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(refused))).rejects.toThrow('declined');
});
it('bounds stream bytes and hides upstream credentials and errors without retries',async()=>{
 const state=()=>conversation({...defaultProviderSettings,model:'m'},request),signal=new AbortController().signal;
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('secret upstream diagnostic',{status:429}));await expect(providerTurn(state(),'secret',signal,()=>{},fetcher)).rejects.toThrow('rate limit');expect(fetcher).toHaveBeenCalledTimes(1);
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>{throw Error('Bearer secret');})).rejects.toThrow('Provider connection failed');
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>new Response('x'.repeat(defaultProviderSettings.maxOutputTokens*1024+1)))).rejects.toThrow('byte budget');
});
it('compiles Anthropic schema without recursive references while retaining all core Block families',()=>{
 const schema=schemaFor('anthropic'),complete=new Set<string>();const walk=(v:any,seen=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){expect(seen.has(v.$ref),'recursive '+v.$ref).toBe(false);if(!complete.has(v.$ref)){walk(schema.$defs[v.$ref.split('/').at(-1)],new Set([...seen,v.$ref]));complete.add(v.$ref);}}else for(const [k,x]of Object.entries(v))if(k!=='$defs')walk(x,seen);};walk(schema);expect(schema.$defs.Table0).toBeTruthy();expect(schema.$defs.Node12.$ref).toBe('#/$defs/Paragraph');expect(schema.properties.intent.enum).toEqual(expect.arrayContaining(['reply','acknowledge','share','create']));
});
it.each([401,403])('distinguishes HTTP %s without leaking a key echoed by the provider',async status=>{
 const state=conversation({...defaultProviderSettings,model:'m'},request),code=status===401?'invalid_api_key':'permission_error';
 let message='';try{await providerTurn(state,'secret-fixture',new AbortController().signal,()=>{},async()=>new Response(JSON.stringify({error:{code,message:'Incorrect API key secret-fixture'}}),{status}));}catch(e){message=(e as Error).message;}
 expect(message).toContain('HTTP '+status);expect(message).toContain(code);expect(message).not.toContain('secret-fixture');expect(message).toContain(status===401?'authentication failed':'access denied');
});
it('sends bounded repair diagnostics and preserves native intent without forwarding raw error text',()=>{
 const state=conversation({...defaultProviderSettings},request);
 repair(state,{code:'source',path:'$.anchors[1]',message:'secret credential or source text'});
 const content=state.input.at(-1).content;expect(content).toContain('$.anchors[1]');expect(content).toContain('unambiguous prefix/suffix');expect(content).toContain('preserve valid requested addressing');expect(content).not.toContain('secret credential');expect(content).not.toContain('Prefer plain paragraphs');
 repair(state,{code:'arbitrary secret',path:'$.secret'});expect(state.input.at(-1).content).not.toContain('arbitrary secret');expect(state.input.at(-1).content).not.toContain('$.secret');
});
it('reports context exhaustion explicitly without retrying or leaking provider text',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{code:'context_length_exceeded',message:'private source and credential'}},{status:400}));
 await expect(providerTurn(conversation(defaultProviderSettings,request),'fixture',new AbortController().signal,()=>{},fetcher)).rejects.toThrow('History was not truncated and no stateless retry was sent');expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['openai','anthropic'] as Provider[])('%s keeps inventory and source tools available across successive continuations',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},request),signal=new AbortController().signal;
 const fetcher=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'list',name:'list_text_blocks',arguments:{cursor:null,limit:1,contributionId:null,participantId:null,fromOrdinal:1}})))
  .mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'read',name:'read_source',arguments:{handle:'fresh'}})))
  .mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 const first=await providerTurn(state,'fixture',signal,()=>{},fetcher);continuation(state,first.calls,[{items:[{handle:'fresh',blockId:'native-block',readRequired:true}]}]);
 const second=await providerTurn(state,'fixture',signal,()=>{},fetcher);expect(second.calls[0].tool).toBe('read_source');continuation(state,second.calls,[{status:'complete',handle:'fresh',revision:'current',text:'Garden.'}]);
 const final=await providerTurn(state,'fixture',signal,()=>{},fetcher);expect(final.calls).toEqual([]);expect(JSON.parse(final.text).kind).toBe('contribution');
 for(const [,init]of fetcher.mock.calls.slice(1)){const body=JSON.parse(String(init?.body));expect(body.tools.map((t:any)=>t.name)).toContain('list_text_blocks');expect(body.instructions??body.system).toContain('Further advertised tool calls remain available');}
});

it.each(['gpt-5.4-mini','gpt-5.4-mini-2026-03-17','gpt-4.1','custom-model'])('configures bounded native-authoring reasoning only for the qualified Mini model: %s',async model=>{
 const state=conversation({...defaultProviderSettings,model},request),fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture-key',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(body.reasoning).toEqual(model.startsWith('gpt-5.4-mini')?{effort:'low'}:undefined);expect(body.max_output_tokens).toBe(defaultProviderSettings.maxOutputTokens);
});

it.each(['openai','anthropic'] as Provider[])('%s sends source-operation requirements on the initial turn, after conversational defaults',async provider=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(conversation({...defaultProviderSettings,provider},request),'fixture-key',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),instructions=body.instructions??body.system;
 expect(instructions.indexOf('REQUESTED SOURCE OPERATIONS')).toBeGreaterThan(instructions.indexOf('a short acknowledgement is valid'));
 expect(instructions).toContain('Before declaring the passage unavailable, use list_text_blocks or search_symposium');
 expect(instructions).toContain('read_source to obtain its current text and revision');
 expect(instructions).toContain('Do not ask the participant for a source handle');
 expect(instructions).toContain('participant and contribution chronology');
 expect(instructions).toContain('including when you authored it yourself');
 expect(instructions).toContain('Reproducing those quotations in composition is allowed');
 expect(instructions).toContain('does not substitute for native source anchoring');
 expect(instructions).toContain('Keep source anchor aliases distinct from any aliases on reproduced composition text');
 expect(body.tools.map((tool:any)=>tool.name).sort()).toEqual(['list_text_blocks','read_source','search_symposium']);
 expect(body.max_output_tokens??body.max_tokens).toBe(defaultProviderSettings.maxOutputTokens);
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 1 schema without changing the disabled contract',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 expect(schema.$defs.Heading.properties.level).toEqual({type:'integer',minimum:1,maximum:6});expect(schema.$defs.YouTube.properties.url.maxLength).toBe(4096);
 expect(schemaFor(provider).$defs.Heading).toBeUndefined();
 const refs=new Set<string>();const walk=(value:any)=>{if(!value||typeof value!=='object')return;if(value.$ref)refs.add(value.$ref.slice('#/$defs/'.length));Object.values(value).forEach(walk);};walk(schema);
 for(const name of refs)expect(schema.$defs[name],name).toBeDefined();
 if(provider==='anthropic'){expect(schema.$defs.Node).toBeUndefined();expect(schema.$defs.Grid0).toBeDefined();expect(schema.$defs.Node12.anyOf.map((r:any)=>r.$ref)).toEqual(expect.arrayContaining(['#/$defs/Paragraph','#/$defs/Heading','#/$defs/YouTube']));}
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates strict Stage 2 literal nodes and nullable appearance without altering older profiles',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1,textAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 expect(schema.$defs.Code.required).toEqual(['id','kind','language','text']);expect(schema.$defs.Source.properties.format.enum).toEqual(['markdown','html']);
 expect(schema.$defs.Paragraph.required).toContain('textStyle');expect(schema.$defs.Heading.required).toContain('textStyle');
 expect(schema.$defs.TextStyle.required).toEqual(['alignment','indent','size']);expect(schema.$defs.Paragraph.properties.textStyle.anyOf).toContainEqual({type:'null'});
 expect(schemaFor(provider,true).$defs.Code).toBeUndefined();expect(schemaFor(provider,false,true).$defs.TextStyle).toBeUndefined();
 const refs=new Set<string>();const walk=(value:any)=>{if(!value||typeof value!=='object')return;if(value.$ref)refs.add(value.$ref.slice('#/$defs/'.length));if(value.type==='object'){expect(value.additionalProperties).toBe(false);expect(value.required.slice().sort()).toEqual(Object.keys(value.properties).sort());}Object.values(value).forEach(walk);};walk(schema);
 for(const name of refs)expect(schema.$defs[name],name).toBeDefined();
 if(provider==='anthropic')expect(schema.$defs.Node12.anyOf).toEqual(expect.arrayContaining([{$ref:'#/$defs/Code'},{$ref:'#/$defs/Source'}]));
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 2B layouts with bounded schemas and preserves Stage 2A',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1,textAuthoring:1,layoutAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 const list=schema.$defs[provider==='openai'?'List':'List0'],table=schema.$defs[provider==='openai'?'Table':'Table0'];
 expect(list.properties.style.enum).toContain('task');expect(list.required).toContain('configuration');expect(table.required).toContain('configuration');expect(schema.$defs.Code).toBeDefined();expect(schema.$defs.TextStyle).toBeDefined();
 expect(schemaFor(provider,true,false,true).$defs.ListConfiguration).toBeDefined();expect(schemaFor(provider,true,false,true).$defs.TextStyle).toBeUndefined();
 expect(schemaFor(provider,true,true).$defs.ListConfiguration).toBeUndefined();expect(schemaFor(provider,false,true,true).$defs.ListConfiguration).toBeUndefined();
 const visited=new Set<string>();const walk=(v:any,path=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){const name=v.$ref.slice('#/$defs/'.length);expect(schema.$defs[name],name).toBeDefined();if(provider==='anthropic')expect(path.has(name),'recursive '+name).toBe(false);if(!visited.has(name)){visited.add(name);walk(schema.$defs[name],new Set([...path,name]));}return;}if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect(v.required.slice().sort()).toEqual(Object.keys(v.properties).sort());}Object.entries(v).filter(([k])=>k!=='$defs').forEach(([,x])=>walk(x,path));};walk(schema);
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 2C recursive margins and compound schemas without leaking host authority',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1,textAuthoring:1,layoutAuthoring:1,compoundAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 const suffix=provider==='openai'?'':'0';expect(schema.$defs['Surface'+suffix].required).toEqual(['id','kind','front','back']);expect(schema.$defs['Pages'+suffix].required).toEqual(['id','kind','orientation','pages']);expect(schema.$defs['Paragraph'+suffix].required).toContain('margins');
 expect(schema.$defs['Tabs'+suffix].properties.tabs.items.properties).not.toHaveProperty('documentId');expect(schemaFor(provider,true,true,true).$defs.Surface).toBeUndefined();expect(schemaFor(provider,false,true,true,true).$defs.Surface).toBeUndefined();
 const checked=new Set<string>();const walk=(v:any,path=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){const name=v.$ref.slice('#/$defs/'.length);expect(schema.$defs[name],name).toBeDefined();if(provider==='anthropic')expect(path.has(name),'recursive '+name).toBe(false);if(!checked.has(name)){checked.add(name);walk(schema.$defs[name],new Set([...path,name]));}return;}if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect(v.required.slice().sort()).toEqual(Object.keys(v.properties).sort());}Object.entries(v).filter(([key])=>key!=='$defs').forEach(([,child])=>walk(child,path));};walk(schema);
 if(provider==='anthropic'){expect(schema.$defs.ParagraphLeaf.properties.margins).toEqual({type:'null'});expect(schema.$defs.Node12.anyOf.map((r:any)=>r.$ref)).not.toContain('#/$defs/Pages12');}
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 2D widgets independently and preserves earlier schemas',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1,textAuthoring:1,layoutAuthoring:1,compoundAuthoring:1,widgetAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 expect(schema.$defs.Timer.required).toEqual(['id','kind','durationSeconds','size']);expect(schema.$defs.Object3D.required).toEqual(['id','kind','configuration']);expect(schema.$defs[provider==='openai'?'StickyNote':'StickyNote0']).toBeDefined();
 expect(schemaFor(provider,true,true,true,true).$defs.Timer).toBeUndefined();expect(schemaFor(provider,false,true,true,true,true).$defs.Timer).toBeUndefined();
 const independent=schemaFor(provider,true,false,false,false,true);expect(independent.$defs.Timer).toBeDefined();expect(independent.$defs.TextStyle).toBeUndefined();
 const visited=new Set<string>();const walk=(v:any,path=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){const name=v.$ref.slice('#/$defs/'.length);expect(schema.$defs[name],name).toBeDefined();if(provider==='anthropic')expect(path.has(name),'recursive '+name).toBe(false);if(!visited.has(name)){visited.add(name);walk(schema.$defs[name],new Set([...path,name]));}return;}if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect(v.required.slice().sort()).toEqual(Object.keys(v.properties).sort());}Object.entries(v).filter(([k])=>k!=='$defs').forEach(([,x])=>walk(x,path));};walk(schema);
});


it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 3A managed binding without native resource identifiers',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1,textAuthoring:1,layoutAuthoring:1,compoundAuthoring:1,widgetAuthoring:1,managedImageAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 expect(schema.$defs.Image.required).toEqual(['id','kind','source','revision','alt']);expect(schema.$defs.Image.additionalProperties).toBe(false);
 expect(schemaFor(provider,true,true,true,true,true).$defs.Image).toBeUndefined();expect(schemaFor(provider,false,true,true,true,true,true).$defs.Image).toBeUndefined();
 const independent=schemaFor(provider,true,false,false,false,false,true);expect(independent.$defs.Image).toBeDefined();expect(independent.$defs.Timer).toBeUndefined();
 const visited=new Set<string>();const walk=(v:any,path=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){const name=v.$ref.slice('#/$defs/'.length);expect(schema.$defs[name],name).toBeDefined();if(provider==='anthropic')expect(path.has(name),'recursive '+name).toBe(false);if(!visited.has(name)){visited.add(name);walk(schema.$defs[name],new Set([...path,name]));}return;}if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect(v.required.slice().sort()).toEqual(Object.keys(v.properties).sort());}Object.entries(v).filter(([k])=>k!=='$defs').forEach(([,x])=>walk(x,path));};walk(schema);
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 3B external media independently from managed source binding',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1,textAuthoring:1,layoutAuthoring:1,compoundAuthoring:1,widgetAuthoring:1,managedImageAuthoring:1,externalMediaAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 expect(schema.$defs.ExternalImage.required).toEqual(['id','kind','url','alt']);expect(schema.$defs.Video.required).toEqual(['id','kind','url']);expect(schema.$defs.Embed.required).toEqual(['id','kind','url']);expect(schema.$defs.Image.required).toContain('source');
 expect(schemaFor(provider,true,true,true,true,true,true).$defs.ExternalImage).toBeUndefined();expect(schemaFor(provider,false,true,true,true,true,true,true).$defs.ExternalImage).toBeUndefined();
 const independent=schemaFor(provider,true,false,false,false,false,false,true);expect(independent.$defs.ExternalImage).toBeDefined();expect(independent.$defs.Image).toBeUndefined();
 const visited=new Set<string>();const walk=(v:any,path=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){const name=v.$ref.slice('#/$defs/'.length);expect(schema.$defs[name],name).toBeDefined();if(provider==='anthropic')expect(path.has(name),'recursive '+name).toBe(false);if(!visited.has(name)){visited.add(name);walk(schema.$defs[name],new Set([...path,name]));}return;}if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect(v.required.slice().sort()).toEqual(Object.keys(v.properties).sort());}Object.entries(v).filter(([k])=>k!=='$defs').forEach(([,x])=>walk(x,path));};walk(schema);
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 3C retained PDF independently from prior media',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1,textAuthoring:1,layoutAuthoring:1,compoundAuthoring:1,widgetAuthoring:1,managedImageAuthoring:1,externalMediaAuthoring:1,retainedPdfAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 expect(schema.$defs.RetainedPdf.required).toEqual(['id','kind','source','revision']);expect(schema.$defs.RetainedPdf.additionalProperties).toBe(false);
 expect(schemaFor(provider,true,true,true,true,true,true,true).$defs.RetainedPdf).toBeUndefined();expect(schemaFor(provider,false,true,true,true,true,true,true,true).$defs.RetainedPdf).toBeUndefined();
 const independent=schemaFor(provider,true,false,false,false,false,false,false,true);expect(independent.$defs.RetainedPdf).toBeDefined();expect(independent.$defs.ExternalImage).toBeUndefined();
 const visited=new Set<string>();const walk=(v:any,path=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){const name=v.$ref.slice('#/$defs/'.length);expect(schema.$defs[name],name).toBeDefined();if(provider==='anthropic')expect(path.has(name),'recursive '+name).toBe(false);if(!visited.has(name)){visited.add(name);walk(schema.$defs[name],new Set([...path,name]));}return;}if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect(v.required.slice().sort()).toEqual(Object.keys(v.properties).sort());}Object.entries(v).filter(([k])=>k!=='$defs').forEach(([,x])=>walk(x,path));};walk(schema);
});

it.each(['openai','anthropic'] as Provider[])('%s title utility has no tools, history link, or DCP schema',async provider=>{
 const {titleConversation}=await import('./providers');
 const state=titleConversation({...defaultProviderSettings,provider},'First contribution');
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify({title:'Historical interpretations'}))));
 const result=await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 expect(JSON.parse(result.text)).toEqual({title:'Historical interpretations'});
 const wire=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(wire.tools).toEqual([]);expect(wire.conversation).toBeUndefined();expect(wire.previous_response_id).toBeUndefined();
 expect(wire.max_output_tokens??wire.max_tokens).toBe(512);expect(JSON.stringify(wire)).not.toContain('mutable_dcp');expect(JSON.stringify(wire)).not.toContain('read_source');
 if(provider==='openai')expect(wire.store).toBe(false);
 expect((wire.input??wire.messages).filter((x:any)=>x.role==='user')).toHaveLength(1);
 const bad=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,'',{id:'call',name:'read_source',arguments:{handle:'forged'}})));
 await expect(providerTurn(titleConversation({...defaultProviderSettings,provider},'First'),'fixture',new AbortController().signal,()=>{},bad)).rejects.toThrow('Unadvertised');
});
it('keeps the initialised contract out of subsequent requests, preserves current authority and reports reasoning on exhaustion',async()=>{
 const full={...request,authoring:{instructions:'Stable native grammar',examples:[{name:'example'}]},semanticWorkspace:{entities:[]},structuralContext:{sources:[{handle:'src:current:b1',revision:'fresh',text:'Current',status:'complete',exactAnchorEligible:true}]}};
 const state=conversation(defaultProviderSettings,full);state.conversationId='conv_fixture';state.contractInitialised=true;
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(JSON.stringify(body)).not.toContain('Stable native grammar');expect(body.instructions.length).toBeLessThan(400);expect(JSON.parse(body.input[0].content).structuralContext).toEqual(full.structuralContext);expect(body.text.format.strict).toBe(true);
 continuation(state,[],[]);const length=state.system.length;continuation(state,[],[]);expect(state.system.length).toBe(length);
 const events=streamFixture('openai','partial',undefined,'incomplete') as any[];
 Object.assign(events.at(-1).response,{incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:123,output_tokens:4096,output_tokens_details:{reasoning_tokens:310},input_tokens_details:{cached_tokens:64,cache_write_tokens:59}}});
 const error=await providerTurn(state,'fixture',new AbortController().signal,()=>{},async()=>sse(events)).catch(e=>e);
 expect(error.receipt).toMatchObject({stop:'max_output_tokens',usage:{input_tokens:123,output_tokens:4096,reasoning_tokens:310,cached_input_tokens:64,cache_write_input_tokens:59}});expect(error.message).toContain('configured output limit 4096');
});
it.each(['openai','anthropic'] as const)('explicitly advertises PDF creation on continuing %s exchanges even after a prior refusal',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,artifacts:1});if(provider==='openai'){state.conversationId='conv_fixture';state.contractInitialised=true;}
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,'',{id:'make',name:'create_attachment',arguments:{filename:'report.pdf',format:'pdf',content:'A report'}})));
 const turn=await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher),wire=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
 expect(wire.tools.some((t:any)=>t.name==='create_attachment')).toBe(true);expect(wire.instructions??wire.system).toContain('you CAN create actual downloadable PDFs');expect(wire.instructions??wire.system).toContain('separate from the DCP native-block catalogue');expect(turn.calls[0].tool).toBe('create_attachment');
});
it('bounds SSE transport separately from output tokens and native response size',async()=>{
 const state=conversation({...defaultProviderSettings,maxOutputTokens:4096},request);
 // Representative verbose SSE envelope overhead, with a small native reply.
 const padding=Array.from({length:600},()=>({type:'response.output_text.delta',delta:'',padding:'x'.repeat(2000)}));
 const fetcher=async()=>sse([...padding,...streamFixture('openai',JSON.stringify(plainContribution('exchange')))]);
 const turn=await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);expect(turn.receipt.stop).toBe('completed');
 const oversized=async()=>sse([...Array.from({length:2200},()=>padding[0]),...streamFixture('openai',JSON.stringify(plainContribution('exchange')))]);
 await expect(providerTurn(state,'fixture',new AbortController().signal,()=>{},oversized)).rejects.toThrow('byte budget');
});

it('rejects a complete Claude request above its encoded byte limit before contacting the provider',async()=>{
 const state=conversation({...defaultProviderSettings,provider:'anthropic'},request),fetcher=vi.fn<typeof fetch>();
 // UTF-8 byte size, not JS character count, governs the complete request.
 state.input=[{role:'user',content:'é'.repeat(64000000)}];
 await expect(providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher)).rejects.toThrow('complete request exceeds 128 MB');
 expect(fetcher).not.toHaveBeenCalled();
});

it.each(['openai','anthropic'] as const)('advertises image generation and current instructions on continuing %s conversations',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,artifacts:1,imageGeneration:1});if(provider==='openai'){state.conversationId='conv_fixture';state.contractInitialised=true;}
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,'',{id:'image',name:'generate_image',arguments:{filename:'Forest.png',prompt:'A forest',size:'auto',quality:'auto'}})));
 const turn=await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher),wire=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
 expect(wire.tools.some((t:any)=>t.name==='generate_image')).toBe(true);expect(wire.instructions??wire.system).toContain('Current image-generation capability');expect(turn.calls[0].tool).toBe('generate_image');
});

it.each(['openai','anthropic'] as Provider[])('%s exposes authority image sourcing only when negotiated, including retained turns',async provider=>{
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>sse(streamFixture(provider,'<p>Portraits.</p>'))),state=conversation({...defaultProviderSettings,provider},{...request,authorityLookup:1});
 expect(state.system).toContain('existing historical portraits');state.contractInitialised=true;await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(body.tools.some((t:any)=>t.name==='lookup_authority')).toBe(true);expect(body.instructions??body.system).toContain('existing historical portraits');
 const disabled=conversation({...defaultProviderSettings,provider},request);await providerTurn(disabled,'fixture',new AbortController().signal,()=>{},fetcher);expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).tools.some((t:any)=>t.name==='lookup_authority')).toBe(false);
});

it.each(['openai','anthropic'] as Provider[])('%s sends semantic refresh instructions and the optional comment without generation tools',async provider=>{
 const semanticRefresh={comment:'Extract more claims and patronage relationships'},state=conversation({...defaultProviderSettings,provider},{...request,dialect:'xml/1',xmlFragments:false,semanticRefresh,authorityLookup:1,semanticWorkspaceAuthoring:1,xmlContext:{dialect:'xml/1',exchange:request.exchange,focus:'@current',semanticRefresh,sources:[]}});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,'<response><definitions/></response>')));
 await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);const wire=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
 expect(wire.instructions??wire.system).toContain('SEMANTIC REFRESH');expect(wire.instructions??wire.system).toContain('NO paragraphs');expect(JSON.stringify(wire.input??wire.messages)).toContain(semanticRefresh.comment);expect(wire.tools.some((t:any)=>t.name==='lookup_authority')).toBe(true);expect(wire.tools.some((t:any)=>['generate_image','create_attachment'].includes(t.name))).toBe(false);
});
