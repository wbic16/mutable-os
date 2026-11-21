// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';import {render} from 'solid-js/web';
import {RetrievalControls} from './retrieval-controls';
vi.mock('./cavern-startup',()=>({useCurrentCavern:()=>({current:()=>({name:'Test Cavern'})})}));
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
it('first-use refusal is explicit and later permission changes separate Documents from queries',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 let state:any={decision:'unasked',documents:false,queries:false,documentTokens:50000,queryTokens:5000,indexed:0,known:1,provider:{configured:true},index:{complete:false}},last:any;
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{if(String(url).endsWith('/configure')){last=JSON.parse(init.body);state={...state,decision:last.indexDocuments?'enabled':'declined',documents:last.indexDocuments,queries:last.embedQueries};}return new Response(JSON.stringify({Success:true,Data:state}));}));
 let launch:()=>void=()=>{};clean.push(render(()=><RetrievalControls launcher={f=>{launch=f;}}/>,document.body));
 await vi.waitFor(()=>expect(document.querySelector('dialog')?.textContent).toContain('sent to OpenAI'));
 const click=(text:string)=>{([...document.querySelectorAll('button')].find(b=>b.textContent===text) as HTMLButtonElement).click();};click('Not now');await vi.waitFor(()=>expect(state.decision).toBe('declined'));expect(last).toMatchObject({indexDocuments:false,embedQueries:false});await vi.waitFor(()=>expect(document.querySelector('dialog')).toBeNull());
 launch();await vi.waitFor(()=>expect(document.querySelector('dialog')).toBeTruthy());const boxes=document.querySelectorAll<HTMLInputElement>('input[type=checkbox]');boxes[0].click();click('Apply permissions');await vi.waitFor(()=>expect(last.indexDocuments).toBe(true));expect(last.embedQueries).toBe(false);expect(document.querySelector('dialog')?.textContent).toContain('Unsaved content');
});
it('shows remaining applied allowances and never substitutes zero when accounting is unavailable',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 let state:any={decision:'enabled',documents:true,queries:false,documentTokens:50000,queryTokens:5000,documentTokensUsed:25042,queryTokensUsed:0,indexed:229,known:2314,provider:{configured:true},index:{complete:false,state:'indexing'}};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:true,Data:state}))));
 let launch:()=>void=()=>{};clean.push(render(()=><RetrievalControls launcher={f=>{launch=f;}}/>,document.body));launch();
 await vi.waitFor(()=>expect(document.querySelector('dialog')?.textContent).toContain('24958 remaining of 50000 tokens'));
 (document.querySelector('input[type=number]') as HTMLInputElement).value='100';document.querySelector('input[type=number]')!.dispatchEvent(new Event('input',{bubbles:true}));
 expect(document.querySelector('dialog')?.textContent).toContain('24958 remaining');
 state={...state,documentTokensUsed:null,indexed:null,index:{state:'unavailable'}};launch();
 await vi.waitFor(()=>expect(document.querySelector('dialog')?.textContent).toContain('usage and remaining allowance unavailable'));
 expect(document.querySelector('dialog')?.textContent).toContain('unknown indexed');
});
