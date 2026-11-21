import {addQuillSource} from '../../application/quill-operations';
import {NATIVE_MIME} from '../../interchange/transport';
// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {registerApplicationViews} from '../../application/features';
import {defaultComposition,QUILL_TYPE} from './model';
const cleanups:Array<()=>void>=[];
beforeEach(()=>{vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({font:'',measureText:(s:string)=>({width:s.length*10})} as any);});
afterEach(()=>{cleanups.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();});
function setup(text='one two three',extra=0,compact=false){
 const c=defaultComposition();c.paths[0]={...c.paths[0],kind:'sine',amplitude:20,cycles:1};
 const e=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'composition',type:QUILL_TYPE,quill:c,blockProperties:[{type:'codex/block-reference',value:'source',metadata:{quillRole:'body'}}],children:[{id:'source',type:'standoff-editor-block',text,standoffProperties:[{id:'italic',type:'style/italics',start:4,end:6}]}]},...Array.from({length:extra},(_,i)=>({id:'unrelated-'+i,type:'standoff-editor-block',text:'Unrelated native text.'}))]},{features:{compactCanonicalText:compact,nativeKnowledge:false,sqliteKnowledge:false}});
 registerApplicationViews(e);const v=e.createView('test'),n=Object.values(v.state.nodes).find(n=>n.payload.id==='source')!;
 cleanups.push(()=>e.dispose());const host=document.body.appendChild(document.createElement('div'));cleanups.push(render(()=><ReactiveTreeView editor={e} projection={v}/>,host));e.installGateway(document);
 const sink=host.querySelector<HTMLElement>('.quill-input-sink')!,mount=()=>e.mounts.get(n.key)!,value=()=>host.querySelector('.quill-canvas')?.textContent;
 const key=(key:string,opts={})=>sink.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...opts}));
 const input=(data:string)=>sink.dispatchEvent(new InputEvent('beforeinput',{data,inputType:'insertText',bubbles:true,cancelable:true}));
 return {e,n,host,sink,mount,value,key,input};
}
describe('M1 checkpoint 1: mounted native SVG input',()=>{
 it('inserts, navigates, selects, replaces and deletes through the input gateway with native undo/redo',()=>{
  const f=setup();expect(f.sink).toBeTruthy();expect(f.host.querySelector('.reactive-standoff-flow')).toBeNull();
  f.mount().focus();f.mount().restoreInlineSelection!({anchor:4,head:4});f.input('new ');expect(f.value()).toBe('one new two three');
  f.key('ArrowRight',{shiftKey:true});f.key('ArrowRight',{shiftKey:true});f.input('X');expect(f.value()).toBe('one new Xo three');
  f.key('Backspace');expect(f.value()).toBe('one new o three');f.key('Delete');expect(f.value()).toBe('one new  three');
  f.e.repository.undo();expect(f.value()).toBe('one new o three');f.e.repository.redo();expect(f.value()).toBe('one new  three');
  expect(f.e.node(f.n.key)?.contentKey).toBe(f.n.contentKey);
 });
 it('preserves unsupported input and IME without committing or corrupting native text',()=>{
  const f=setup(),revision=f.e.repository.state.revision;f.input('مرحبا');f.sink.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'字'}));f.sink.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertCompositionText',data:'字',isComposing:true,bubbles:true,cancelable:true}));f.sink.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'字'}));
  expect(f.e.repository.state.revision).toBe(revision);expect(f.value()).toBe('one two three');expect(f.host.textContent).toContain('IME');
 });
 it('uses native range selection for clipboard and word navigation',()=>{
  const f=setup();f.mount().restoreInlineSelection!({anchor:0,head:0});f.key('ArrowRight',{altKey:true,shiftKey:true});expect(f.mount().captureInlineSelection!()).toEqual({anchor:0,head:4});
  const data={types:['text/plain'],getData:()=> 'new ',setData:vi.fn()};const clipboard=(type:string)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:data});f.sink.dispatchEvent(e);};clipboard('copy');expect(data.setData).toHaveBeenCalledWith('text/plain','one ');clipboard('paste');expect(f.value()).toBe('new two three');
 });
 it('diagnoses pre-existing unsupported text without flattening it',()=>{const f=setup('aאבb');expect(f.host.textContent).toContain('aאבb');expect(f.host.textContent).toContain('Unicode');});
});

it('previews numeric geometry, cancels it, and commits a single native undo/redo step',()=>{
 const f=setup();const button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 button('Three linked waves').click();const wrapper=Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!,before=JSON.stringify(wrapper.payload.quill);
 const field=f.host.querySelector<HTMLInputElement>('input[aria-label="amplitude"]')!;
 const preview=(n:string)=>{field.value=n;field.dispatchEvent(new Event('input',{bubbles:true}));};
 preview('40');preview('50');expect(JSON.stringify(f.e.repository.state.contents[wrapper.key].payload.quill)).toBe(before);button('Cancel preview').click();expect(field.value).toBe('20');
 preview('45');field.dispatchEvent(new Event('change',{bubbles:true}));expect((f.e.repository.state.contents[wrapper.key].payload.quill as any).paths[0].amplitude).toBe(45);
 f.e.repository.undo();expect(JSON.stringify(f.e.repository.state.contents[wrapper.key].payload.quill)).toBe(before);f.e.repository.redo();expect((f.e.repository.state.contents[wrapper.key].payload.quill as any).paths[0].amplitude).toBe(45);
});

it.each([false,true])('applies native formatting, entity and Gloss ranges on the SVG selection and displays overlaps (compact=%s)',compact=>{
 const f=setup('one two three',0,compact),button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 f.mount().restoreInlineSelection!({anchor:0,head:7});button('Italic').click();expect(f.e.node(f.n.key)?.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'style/italics',start:0,end:6})]));
 f.e.rangeAnnotations.apply([f.e.textRanges.snapshot(f.n.key,4,7)],'codex/entity-reference','entity-id');
 f.mount().restoreInlineSelection!({anchor:4,head:7});button('Gloss').click();expect(document.querySelector('[aria-label="Create Gloss"]')).not.toBeNull();expect(f.e.gloss.commit('note: a native Gloss')).toBe(true);
 expect(f.host.querySelector('.quill-range-effects [data-property-type="codex/entity-reference"]')).not.toBeNull();expect(f.host.querySelector('.quill-range-effects [data-property-type="mutable/gloss"]')).not.toBeNull();expect(f.host.querySelector('[data-quill-offset].mutable-gloss-anchor')).not.toBeNull();
 f.mount().restoreInlineSelection!({anchor:0,head:0});f.input('New ');const props=f.e.node(f.n.key)?.payload.standoffProperties as any[];expect(props.find(p=>p.type==='mutable/gloss')).toMatchObject({start:8,end:10});expect(props.find(p=>p.type==='codex/entity-reference')).toMatchObject({start:8,end:10});
 f.e.repository.undo();expect((f.e.node(f.n.key)?.payload.standoffProperties as any[]).find(p=>p.type==='mutable/gloss')).toMatchObject({start:4,end:6});
});
it('native fallback and return are local presentation changes with no canonical work',()=>{
 const f=setup('aאבb'),revision=f.e.repository.state.revision,snapshot=vi.spyOn(f.e.repository,'snapshot');
 [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Native text')!.click();expect(f.host.querySelector('.reactive-standoff-flow')).not.toBeNull();
 [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Return to SVG')!.click();expect(f.host.querySelector('.quill-canvas')).not.toBeNull();expect(f.e.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();
});

it.each([0,500])('mounted SVG input/undo with %s unrelated Blocks reads no unrelated payloads or snapshots',extra=>{
 const f=setup('one two three',extra),state=f.e.repository.readState(),restores:Array<()=>void>=[];let reads=0;
 for(const c of Object.values(state.contents))if(String(c.payload.id).startsWith('unrelated-')){const d=Object.getOwnPropertyDescriptor(c,'payload')!;Object.defineProperty(c,'payload',{configurable:true,get(){reads++;return d.value;}});restores.push(()=>Object.defineProperty(c,'payload',d));}
 const snapshot=vi.spyOn(f.e.repository,'snapshot'),changes:number[]=[],stop=f.e.repository.subscribeChanges(c=>changes.push(c.previousContents.size));
 try{f.mount().restoreInlineSelection!({anchor:4,head:4});f.input('new ');f.e.repository.undo();f.e.repository.redo();expect(reads).toBe(0);expect(snapshot).not.toHaveBeenCalled();expect(changes).toEqual([5,5,5]); /* Four inserted legacy Cells plus their source; bounded independently of unrelated Blocks. */ }finally{stop();restores.forEach(f=>f());}
});
it('retains glyph DOM and performs no glyph writes for caret-only movement',()=>{
 const f=setup(),glyph=f.host.querySelector('[data-quill-offset="0"]'),root=f.host.querySelector('.quill-text-surface') as HTMLElement&{quillDiagnostics():{glyphWrites:number}};
 f.mount().focus();f.mount().restoreInlineSelection!({anchor:4,head:4});const before=root.quillDiagnostics().glyphWrites;f.key('ArrowRight');expect(root.quillDiagnostics().glyphWrites).toBe(before);f.input('X');expect(f.host.querySelector('[data-quill-offset="0"]')).toBe(glyph);
});

it('unsupported-source select-all and clipboard remain non-destructive in canonical coordinates',()=>{
 const f=setup('aאבb'),revision=f.e.repository.state.revision;f.mount().restoreInlineSelection!({anchor:0,head:3});f.key('a',{metaKey:true});f.key('Backspace');f.input('x');
 expect(f.mount().captureInlineSelection!()).toEqual({anchor:0,head:3});expect(f.e.repository.state.revision).toBe(revision);expect(f.host.textContent).toContain('aאבb');
});

it('uses native rich clipboard between SVG and native surfaces, keeping geometry and linked Gloss definitions',async()=>{
 const f=setup('one two three',0,true),destination=setup('destination',0,true);
 f.mount().focus();f.mount().restoreInlineSelection!({anchor:4,head:7});
 [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Gloss')!.click();expect(f.e.gloss.commit('note: clipboard definition')).toBe(true);f.mount().focus();f.mount().restoreInlineSelection!({anchor:0,head:7});
 const values=new Map<string,string>(),data={get types(){return [...values.keys()];},getData:(type:string)=>values.get(type)??'',setData:(type:string,value:string)=>values.set(type,value)};
 const event=(sink:HTMLElement,type:string)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:data});sink.dispatchEvent(e);};
 event(f.sink,'copy');expect(values.has(NATIVE_MIME)).toBe(true);
 const geometry=JSON.stringify(Object.values(destination.e.repository.state.contents).find(c=>c.payload.id==='composition')!.payload.quill);
 destination.mount().focus();destination.mount().restoreInlineSelection!({anchor:0,head:11});event(destination.sink,'paste');await vi.waitFor(()=>expect(destination.mount().captureText!(),destination.e.clipboard.message()).toBe('one two'));
 expect(destination.e.node(destination.n.key)?.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'style/italics',start:4,end:6}),expect.objectContaining({type:'mutable/gloss',start:4,end:6})]));
 const gloss=(destination.e.node(destination.n.key)!.payload.standoffProperties as any[]).find(p=>p.type==='mutable/gloss');expect(destination.e.linkedAnnotations.resolve(gloss,destination.n.contentKey)).toBeTruthy();expect(JSON.stringify(Object.values(destination.e.repository.state.contents).find(c=>c.payload.id==='composition')!.payload.quill)).toBe(geometry);
 [...destination.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Native text')!.click();destination.mount().focus();destination.mount().restoreInlineSelection!({anchor:0,head:7});event(destination.mount().focusElement,'paste');await vi.waitFor(()=>expect(destination.e.clipboard.message()).not.toContain('Preparing'));expect(destination.mount().captureText!()).toBe('one two');
 event(destination.mount().focusElement,'copy');[...destination.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Return to SVG')!.click();destination.mount().focus();destination.mount().restoreInlineSelection!({anchor:0,head:7});event(destination.mount().focusElement,'paste');await vi.waitFor(()=>expect(destination.e.clipboard.message()).not.toContain('Preparing'));expect(destination.mount().captureText!()).toBe('one two');
});
it('pastes multiple plain paragraphs as line breaks in one owned SVG source',()=>{
 const f=setup('old',0,true);f.mount().focus();f.mount().restoreInlineSelection!({anchor:0,head:3});const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:['text/plain'],getData:()=> 'first\nsecond'}});f.sink.dispatchEvent(event);expect(f.mount().captureText!()).toBe('first\nsecond');expect(Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!.children).toHaveLength(1);f.e.repository.undo();expect(f.mount().captureText!()).toBe('old');
});

it('mounts independent sources on a shared artboard and edits only the chosen native source',()=>{
 const f=setup('body text',0,true),wrapper=Object.values(f.e.repository.state.placements).find(p=>f.e.repository.state.contents[p.contentKey]?.payload.id==='composition')!.key,title=addQuillSource(f.e,wrapper,'title'),titleNode=f.e.projections.get(f.n.viewId)!.nodeForPlacement(title)!,mount=f.e.mounts.get(titleNode.key)!;
 expect(f.host.querySelectorAll('.quill-source-stack')).toHaveLength(1);expect(f.host.querySelectorAll('.quill-canvas')).toHaveLength(2);mount.focus();mount.restoreInlineSelection!({anchor:0,head:5});mount.focusElement.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'The Raven',bubbles:true,cancelable:true}));expect(mount.captureText!()).toBe('The Raven');expect(f.mount().captureText!()).toBe('body text');f.e.repository.undo();expect(mount.captureText!()).toBe('Title');
});

it.each([false,true])('edits graphemes in scalar coordinates without splitting emoji or combining marks (compact=%s)',compact=>{
 const f=setup('Ae\u0301🙂漢B',0,compact);f.mount().focus();f.mount().restoreInlineSelection!({anchor:1,head:1});f.key('ArrowRight');expect(f.mount().captureInlineSelection!()).toEqual({anchor:3,head:3});f.key('ArrowRight');expect(f.mount().captureInlineSelection!()).toEqual({anchor:4,head:4});f.key('Backspace');expect(f.mount().captureText!()).toBe('Ae\u0301漢B');f.key('Backspace');expect(f.mount().captureText!()).toBe('A漢B');f.input('👩‍💻');expect(f.mount().captureInlineSelection!()).toEqual({anchor:4,head:4});f.key('Backspace');expect(f.mount().captureText!()).toBe('A漢B');f.e.repository.undo();expect(f.mount().captureText!()).toBe('A👩‍💻漢B');
});
it('visual-only effects reuse shaping and line fitting while layout effects refit',()=>{
 const f=setup(),root=f.host.querySelector('.quill-text-surface') as HTMLElement&{quillDiagnostics():any},wrapper=Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!,key=Object.values(f.e.repository.state.placements).find(p=>p.contentKey===wrapper.key)!.key;
 const before=root.quillDiagnostics(),change=(kind:string)=>{const c=JSON.parse(JSON.stringify(f.e.repository.state.contents[wrapper.key].payload.quill)) as any;c.flows[0].typography={effects:[{id:'effect',kind,curve:'linear',from:1,to:2}]};f.e.commands.setPayloadField(key,'quill',c);};
 change('rotation');expect(root.quillDiagnostics().measurements).toBe(before.measurements);expect(root.quillDiagnostics().fragmentFits).toBe(before.fragmentFits);change('size');expect(root.quillDiagnostics().fragmentFits).toBeGreaterThan(before.fragmentFits);
});

it('authors layers with local previews and native undo without remeasuring text',()=>{
 const f=setup(),button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!,root=f.host.querySelector('.quill-text-surface') as HTMLElement&{quillDiagnostics():any},wrapper=Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!,config=()=>f.e.repository.state.contents[wrapper.key].payload.quill as any;
 const measured=root.quillDiagnostics().measurements;button('Solid background').click();expect(config().layers).toHaveLength(1);const before=JSON.stringify(config()),revision=f.e.repository.state.revision,input=f.host.querySelector<HTMLInputElement>('[aria-label="Layer x"]')!;input.value='55';input.dispatchEvent(new Event('input',{bubbles:true}));expect(JSON.stringify(config())).toBe(before);input.dispatchEvent(new Event('change',{bubbles:true}));expect(f.e.repository.state.revision).toBe(revision+1);expect(config().layers[0].x).toBe(55);expect(root.quillDiagnostics().measurements).toBe(measured);f.e.repository.undo();expect(JSON.stringify(config())).toBe(before);
});

it('paints equal-style text in bounded SVG runs instead of one element per character',()=>{
 const f=setup('a'.repeat(70));expect(f.value()).toBe('a'.repeat(70));expect(f.host.querySelectorAll('[data-quill-offset]').length).toBeLessThanOrEqual(3);f.mount().restoreInlineSelection!({anchor:20,head:20});f.input('b');expect(f.value()).toBe('a'.repeat(20)+'b'+'a'.repeat(50));expect(f.host.querySelectorAll('[data-quill-offset]').length).toBeLessThanOrEqual(3);
});

it('keeps verified managed images when adapting rich clipboard content to a Quill source',async()=>{
 const {plainFragment}=await import('../../interchange/serializer'),{exportClipboard}=await import('../../interchange/transport');const f=setup('target');f.e.setAssetContext(()=>({cavernId:'cavern',session:'session'}));const ref={kind:'managed' as const,cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)},fragment=plainFragment('');fragment.embeds.push({localId:'image',type:'image-cell',data:{asset:ref,alt:'original'}});fragment.blocks[0].inline!.atoms.push({kind:'embed',embed:'image'});
 const verify=vi.spyOn(f.e.clipboard.assets,'verify').mockResolvedValue({...ref,mediaType:'image/png',byteLength:10,width:3,height:2});vi.spyOn(f.e.clipboard.assets,'bind').mockImplementation(()=>()=>{});const carrier=exportClipboard(fragment);f.mount().focus();f.mount().restoreInlineSelection!({anchor:0,head:6});const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:Object.keys(carrier),getData:(type:string)=>carrier[type]??'',files:[]}});f.sink.dispatchEvent(event);
 await vi.waitFor(()=>expect(Object.values(f.e.repository.readState().contents).find(c=>c.viewType==='image-cell')?.payload.asset).toEqual(ref));expect(verify).toHaveBeenCalledTimes(1);expect(f.host.textContent).toContain('Native text');f.e.repository.undo();expect(f.mount().captureText!()).toBe('target');
});

it('scales freeform nodes when changing path length and keeps the edit undoable',()=>{
 const f=setup(),button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;button('Paths').click();button('Convert to Freeform').click();const wrapper=Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!,config=()=>f.e.repository.state.contents[wrapper.key].payload.quill as any,before=JSON.stringify(config()),first=config().paths[0],x=first.nodes.at(-1).x;
 const field=f.host.querySelector<HTMLInputElement>('[aria-label="width"]')!;field.value=String(first.width/2);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));expect(config().paths[0].nodes.at(-1).x).toBeCloseTo(x/2);f.e.repository.undo();expect(JSON.stringify(config())).toBe(before);
});

it('retains managed image bindings across geometry and image-position edits',()=>{
 const f=setup(),bind=vi.spyOn(f.e.assets,'bind').mockImplementation(()=>()=>{}),wrapper=Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!,key=Object.values(f.e.repository.state.placements).find(p=>p.contentKey===wrapper.key)!.key;
 const change=(edit:(c:any)=>void)=>{const c=JSON.parse(JSON.stringify(f.e.repository.state.contents[wrapper.key].payload.quill));edit(c);f.e.commands.setPayloadField(key,'quill',c);};
 change(c=>c.layers=[{id:'image',name:'Image',kind:'image',x:0,y:0,width:50,height:50,asset:{kind:'managed',cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)}}]);expect(bind).toHaveBeenCalledTimes(1);change(c=>c.paths[0].width=500);change(c=>c.layers[0].x=20);expect(bind).toHaveBeenCalledTimes(1);
});

it('verifies embedded SVG identity and refuses mismatched artwork without native mutation',async()=>{
 const {webcrypto}=await import('node:crypto');const subtle=Object.getOwnPropertyDescriptor(globalThis.crypto,'subtle');Object.defineProperty(globalThis.crypto,'subtle',{configurable:true,value:webcrypto.subtle});cleanups.push(()=>{if(subtle)Object.defineProperty(globalThis.crypto,'subtle',subtle);else delete (globalThis.crypto as any).subtle;});
 const {sanitiseSvg}=await import('./svg-sanitize.mjs'),text=sanitiseSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>').svg,bytes=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(text)),assetId='sha256:'+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join(''),f=setup(),wrapper=Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!,key=Object.values(f.e.repository.state.placements).find(p=>p.contentKey===wrapper.key)!.key,config=JSON.parse(JSON.stringify(wrapper.payload.quill));
 config.layers=[{id:'vector',name:'Vector',kind:'svg',x:0,y:0,width:50,height:50,svg:text,asset:{kind:'managed',cavernId:'cavern',assetId}}];f.e.commands.setPayloadField(key,'quill',config);await vi.waitFor(()=>expect(f.host.querySelector('[data-quill-layer] image')?.getAttribute('href')).toContain('data:image/svg+xml;'));
 const changed=JSON.parse(JSON.stringify(config));changed.layers[0].svg=text.replace('L10 10','L20 20');f.e.commands.setPayloadField(key,'quill',changed);const revision=f.e.repository.state.revision;await vi.waitFor(()=>expect(f.host.querySelector('.quill-import-error')?.textContent).toContain('identity'));expect(f.host.querySelector('[data-quill-layer] image')?.getAttribute('href')).toBe('');expect(f.e.repository.state.revision).toBe(revision);
});
