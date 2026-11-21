// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {Show} from 'solid-js';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from './register-core-views';
import {ReactiveTreeView} from './reactive-tree-view';
import {PassiveComposition,admitPassiveComposition} from './passive-composition';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();});
const text=(id:string)=>({id,type:'standoff-editor-block',text:'Native argument',standoffProperties:[{id:'bold',type:'style/bold',start:0,end:5}]});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function setup(direct=true){
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'composition',type:'container-block',children:[text('text'),{id:'tabs',type:'tab-row-block',metadata:{orientation:'vertical'},children:[{id:'tab-a',type:'tab-block',metadata:{name:'A'},children:[text('a')]},{id:'tab-b',type:'tab-block',metadata:{name:'B'},children:[text('b')]}]},{id:'surface',type:'surface-block',metadata:{reversible:true},children:[{id:'front',type:'side-block',children:[text('front-text')]},{id:'back',type:'side-block',children:[text('back-text')]}]},{id:'unsupported',type:'arbitrary-widget'},{id:'detached-info',type:'resource-information-block'}]},{id:'unrelated',type:'container-block',children:[text('elsewhere')]}]},{features:{directDomCharacterCells:direct}});
 registerCoreViews(editor);const projection=editor.createView('source'),host=document.body.appendChild(document.createElement('div'));
 cleanup.push(()=>editor.dispose());cleanup.push(render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host));editor.installGateway(document);
 const node=(id:string)=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)!;
 const passive=(id:string,member:string)=>{const source=node(id),target=document.body.appendChild(document.createElement('div')),state={children:{}},dispose=render(()=><Show when={projection.node(source.key)}><PassiveComposition editor={editor} placement={source.placementKey} state={state} memberId={member} openSource={()=>{}}/></Show>,target);cleanup.push(dispose);return {target,dispose,state};};
 return {editor,projection,host,node,passive};
}
for(const direct of [true,false])it(`isolates native input and async callbacks, retaining source editing (${direct?'direct':'Solid'} Cells)`,async()=>{
 const f=setup(direct),source=f.node('text'),sourceMount=f.editor.mounts.get(source.key)!.root;
 f.editor.commands.insertInlineImage(source.key,source.inlineContent.length,{assetId:'probe',src:'https://example.test/image.png',alt:'Probe'});
 const before=f.editor.repository.state.revision,p=f.passive('composition','m1');await tick();
 const flow=p.target.querySelector<HTMLElement>('[data-block-id=text] .reactive-standoff-flow')!;expect(flow.getAttribute('contenteditable')).toBe('false');p.target.querySelector<HTMLElement>('.native-passive-composition')!.focus();
 const undo=vi.spyOn(f.editor.repository,'undo'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 flow.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
 for(const type of ['beforeinput','input','cut','paste','drop','compositionstart','compositionupdate','compositionend']){const e=new Event(type,{bubbles:true,cancelable:true});flow.dispatchEvent(e);expect(e.defaultPrevented).toBe(true);}
 for(const img of p.target.querySelectorAll('img')){img.dispatchEvent(new Event('load'));img.dispatchEvent(new Event('error'));}
 expect(undo).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(before);expect(snapshot).not.toHaveBeenCalled();
 const author=vi.fn();f.editor.commandRegistry.register({id:'test.author',label:'Author',canExecute:()=>true,execute:author});
 expect(f.editor.commandRegistry.canExecute('test.author',{targetKey:source.key,args:undefined})).toBe(false);
 const key=flow.closest<HTMLElement>('[data-runtime-key]')!.dataset.runtimeKey!;
 expect(()=>f.editor.commands.replaceInlineRange(key,0,1,'X')).toThrow('Open source');
 // An explicit source operation remains permitted even with a passive focus.
 f.editor.commands.replaceInlineRange(source.key,0,0,'Live ');await tick();expect(flow.textContent).toContain('Live Native');expect(f.editor.mounts.get(source.key)!.root).toBe(sourceMount);
 expect(p.target.querySelector('.native-passive-unavailable')?.textContent).toContain('arbitrary-widget');expect(p.target.querySelector('[data-block-selection-handle]')).toBeNull();expect(p.target.textContent).toContain('Detached resource information must be opened at source.');
});
it('overlapping occurrences have independent tabs/faces and disposal, with no unrelated updates',async()=>{
 const f=setup(),one=f.passive('composition','one'),two=f.passive('composition','two'),child=f.passive('text','child');await tick();
 const before=f.editor.repository.state.revision,sourceMount=f.editor.mounts.get(f.node('text').key)!.root;
 const b=[...one.target.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='B')!;b.click();await tick();
 expect(b.getAttribute('aria-selected')).toBe('true');expect(two.target.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('A');
 one.target.querySelector<HTMLButtonElement>('.surface-fold')!.click();await tick();
 expect(one.target.querySelector('.surface-fold')?.getAttribute('aria-label')).toBe('Return to front side');expect(two.target.querySelector('.surface-fold')?.getAttribute('aria-label')).toBe('Show reverse side');
 expect(Object.keys(one.state.children).length).toBeGreaterThanOrEqual(2);expect(f.editor.repository.state.revision).toBe(before);
 const observers=[...f.editor.passiveViews].map(id=>vi.spyOn(f.editor.projections.get(id)! as any,'build'));const snapshot=vi.spyOn(f.editor.repository,'snapshot');
 f.editor.commands.replaceInlineRange(f.node('elsewhere').key,0,0,'Unrelated ');await tick();observers.forEach(spy=>expect(spy).not.toHaveBeenCalled());expect(snapshot).not.toHaveBeenCalled();
 one.dispose();expect(f.editor.passiveViews.size).toBe(2);expect(f.editor.mounts.get(f.node('text').key)!.root).toBe(sourceMount);expect(two.target.textContent).toContain('Native argument');
 f.editor.commands.remove(f.node('text').key);await tick();expect(two.target.querySelector('[data-block-id=text]')).toBeNull();expect(child.target.querySelector('[data-block-id=text]')).toBeNull();
 f.editor.repository.undo();await tick();expect(two.target.querySelector('[data-block-id=text]')).not.toBeNull();expect(child.target.querySelector('[data-block-id=text]')).not.toBeNull();
});
it('refuses oversize closures before allocating a passive projection',()=>{
 const f=setup();f.editor.commands.replaceInlineRange(f.node('text').key,0,0,'x'.repeat(30001));const count=f.editor.projections.size;
 expect(()=>admitPassiveComposition(f.editor,f.node('composition').placementKey)).toThrow('30,000 Cell');expect(f.editor.projections.size).toBe(count);
});
