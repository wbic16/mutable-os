// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {ProviderSettingsView} from './provider-settings';
import {DialecticProviderSession} from './dcp/live';
import {defaultProviderSettings,providerSettings} from './dcp/provider-contract';
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).forEach(f=>f());vi.unstubAllGlobals();localStorage.clear();});
it('accepts 16000 and makes unapplied settings distinct from the active budget',()=>{
 const [active]=createSignal({...defaultProviderSettings,maxOutputTokens:2048}),configure=vi.fn();
 const c:any={resourceId:()=>'fixture',providerSettings:active,editor:{features:{}},busy:()=>false,providerConfiguring:()=>false,aiParticipants:()=>[],providerNotice:()=>'',configureProvider:configure,forgetProvider:vi.fn()};
 const host=document.createElement('div');document.body.append(host);clean.push(render(()=> <ProviderSettingsView c={c}/>,host),()=>host.remove());
 const input=host.querySelector<HTMLInputElement>('[aria-label="Maximum output tokens"]')!;input.value='16000';input.dispatchEvent(new Event('input',{bubbles:true}));
 expect(input.checkValidity()).toBe(true);expect(host.querySelector('summary')!.textContent).toContain('2,048');expect(host.textContent).toContain('not applied yet');
 host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(configure.mock.calls[0][0].maxOutputTokens).toBe(16000);
 expect(providerSettings({...defaultProviderSettings,maxOutputTokens:16000}).maxOutputTokens).toBe(16000);expect(()=>providerSettings({...defaultProviderSettings,maxOutputTokens:16385})).toThrow('16384');
});
it('retains only accepted nonsecret preferences across reload without restoring credential readiness',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>String(url).endsWith('/session')?Response.json({token:'session-secret'}):Response.json({settings:JSON.parse(init.body).settings,ready:true})));
 const first=new DialecticProviderSession();clean.push(()=>first.dispose());await first.configure({...defaultProviderSettings,maxOutputTokens:16000},'key-secret');
 const saved=JSON.stringify({...localStorage});expect(saved).not.toContain('key-secret');expect(saved).not.toContain('session-secret');
 const next=new DialecticProviderSession();clean.push(()=>next.dispose());expect(next.settings.maxOutputTokens).toBe(16000);expect(next.ready).toBe(false);
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({error:'Rejected settings'},{status:400}));await expect(first.configure({...defaultProviderSettings,maxOutputTokens:1024})).rejects.toThrow('Rejected settings');expect(first.settings.maxOutputTokens).toBe(16000);
});
it('can explicitly reconnect a child after the shared credential connection expires',async()=>{
 let roots=0,children=0;
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{
  if(String(url).endsWith('/session')){
   if(init.method==='DELETE')return Response.json({ok:true});
   if(init.headers['x-dialectic-parent']){children++;return children===1?Response.json({error:'Provider connection expired.'},{status:401}):Response.json({token:'child'});}
   return Response.json({token:'root-'+(++roots)});
  }
  return Response.json({settings:JSON.parse(init.body).settings,ready:true});
 }));
 const parent=new DialecticProviderSession(),child=new DialecticProviderSession(false,()=>({}),parent);clean.push(()=>child.dispose(),()=>parent.dispose());
 await expect(child.configure(defaultProviderSettings)).rejects.toThrow('expired');await expect(child.configure(defaultProviderSettings,'new-key-fixture')).resolves.toBe(true);expect(roots).toBe(2);expect(children).toBe(2);
});

it('retains exact artifact failures in native-ready provenance and warning notices',async()=>{
 const {artifactFailureNotices}=await import('./dcp/provider-contract');let turn=0;
 const receipt={provider:'openai',model:'fixture',usage:null,stop:'completed',cost:{status:'unknown'}},error='OpenAI image generation failed (HTTP 400, moderation_blocked). Please revise the request or try again.';
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{
  if(String(url).endsWith('/session'))return Response.json({token:'fixture'});
  if(String(url).endsWith('/settings'))return Response.json({settings:defaultProviderSettings,ready:true});
  if(String(url).endsWith('/exchange'))return Response.json({id:'fixture-exchange',settings:defaultProviderSettings});
  if(String(url).endsWith('/artifact'))return Response.json({error});
  if(String(url).endsWith('/turn'))return new Response(JSON.stringify({type:'result',receipt,calls:turn++===0?[{id:'image',tool:'generate_image',arguments:{}}]:[],text:'<p>No image was produced.</p>'})+'\n');
  return Response.json({});
 }));
 const provider=new DialecticProviderSession();clean.push(()=>provider.dispose());await provider.configure(defaultProviderSettings,'fixture-key');const transport=provider.transport();
 await transport.run({exchange:'fixture'} as any,{owner:'document',check(){}} as any,()=>{},new AbortController().signal);
 expect(transport.details.attempts[0].artifactResults).toEqual([{id:'image',tool:'generate_image',status:'failed',error}]);expect(artifactFailureNotices(transport.details)[0].detail).toContain('HTTP 400, moderation_blocked');expect(JSON.stringify(transport.details)).not.toContain('fixture-key');
});
