import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { onCleanup } from 'solid-js';
import { matchSources } from '../runtime/search-matching';
vi.mock('../runtime/search-worker',()=>({runSearchWorker:async(sources:any,query:string,options:any)=>matchSources(sources,query,options)}));
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { resourceBlock } from '../interchange/resource-url';
import { resourceTypes, resourceInformation, resourceSurface } from '../interchange/resource-surface';
import { serializeSelection } from '../interchange/serializer';
import { materializeFragment } from '../interchange/materialize';
import { exportFragment } from '../interchange/export-plan';
import { captureNative, nativeEnvelope, decodeNative } from '../persistence/native-resource';
import { createPackage, openPackage } from '../interchange/package/format';
import { nativeBytes } from '../persistence/native-resource';
import { HttpApplicationServices } from '../runtime/application-services';
import { normalizeIIIF } from '../iiif/model';
import { manifestFixture } from '../iiif/fixtures';
import type { ExistingBlockDto } from '../block-tree/types';
const cleanups:Array<()=>void>=[];
afterEach(()=>{cleanups.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();localStorage.clear();});
const text=(id:string,value=id):ExistingBlockDto=>({type:'standoff-editor-block',id,text:value});
function setup(children:ExistingBlockDto[], enabled=true, direct=true, instrument?:(editor:ReactiveEditor)=>void) {
 const editor=new ReactiveEditor({type:'document-block',id:'doc',children},{features:{reversibleBlocks:enabled,directDomCharacterCells:direct}});registerCoreViews(editor);instrument?.(editor);
 const projection=editor.createView('reverse-proof'),host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host);editor.installGateway(document);
 cleanups.push(()=>{editor.dispose();dispose();});
 const byId=(id:string)=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)!;
 return {editor,projection,host,byId,dispose};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
describe('structural containers and recursive reverse surfaces',()=>{
 it('shows a corner only when a reverse exists, including an empty reverse',async()=>{
  const s=setup([text('ordinary'),{type:'surface-block',id:'front-only',children:[{type:'side-block',children:[text('front')]}]},{type:'surface-block',id:'empty-reverse',children:[{type:'side-block',children:[text('face')]},{type:'side-block',children:[]}]}]);
  const root=(id:string)=>s.editor.mounts.get(s.byId(id).key)!.root;
  expect(root('ordinary').querySelector('.surface-fold')).toBeNull();
  expect(root('front-only').querySelector('.surface-fold')).toBeNull();
  const corner=root('empty-reverse').querySelector<HTMLButtonElement>(':scope > .surface-fold')!;
  expect(corner.getAttribute('aria-label')).toBe('Show reverse side');expect(corner.title).toBe('Show reverse side');
  corner.click();await tick();expect(corner.getAttribute('aria-label')).toBe('Return to front side');
  expect(corner.classList.contains('surface-fold--back')).toBe(true);
  corner.click();await tick();expect(corner.classList.contains('surface-fold--back')).toBe(false);
 });
 it.each([true,false])('corner activation retains editor state without snapshots, commits, history or bubbled clicks (direct=%s)',async direct=>{
  const s=setup([text('a','Front phrase'),text('other')],true,direct);
  s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();
  const surface=s.editor.surfaces.nearest(s.byId('a').key)!,mount=s.editor.mounts.get(s.byId('a').key)!,root=s.editor.mounts.get(surface.key)!.root;
  const corner=root.querySelector<HTMLButtonElement>(':scope > .surface-fold')!,revision=s.editor.repository.state.revision;
  mount.focus();mount.restoreInlineSelection!({anchor:1,head:6});
  s.editor.blockSelection.select(s.byId('other').key,'single');const before=s.editor.encodeDocument();
  const snapshot=vi.spyOn(s.editor.repository,'snapshot'),commit=vi.spyOn(s.editor.repository,'commit'),command=vi.spyOn(s.editor.commandRegistry,'execute'),bubble=vi.fn();
  root.addEventListener('click',bubble);
  for(let i=0;i<4;i++){corner.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));await tick();}
  expect(s.editor.mounts.get(s.byId('a').key)).toBe(mount);expect(mount.captureInlineSelection!()).toEqual({anchor:1,head:6});
  expect(s.editor.repository.state.revision).toBe(revision);
  expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(command).not.toHaveBeenCalled();expect(bubble).not.toHaveBeenCalled();expect(s.editor.encodeDocument()).toEqual(before);
  // Native keyboard click remains focused for repeatable activation.
  corner.focus();corner.click();await tick();expect(document.activeElement).toBe(corner);
  corner.click();await tick();expect(document.activeElement).toBe(corner);
  // The preceding creation, not a presentation flip, remains the next undo.
  s.editor.repository.undo();await tick();expect(s.editor.surfaces.nearest(s.byId('a').key)).toBeUndefined();
 });
 it('corner respects the existing command permission gate',async()=>{
  const s=setup([text('a')]);s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();
  const surface=s.editor.surfaces.nearest(s.byId('a').key)!,corner=s.editor.mounts.get(surface.key)!.root.querySelector<HTMLButtonElement>(':scope > .surface-fold')!;
  s.editor.commandRegistry.permit=()=>false;corner.click();await tick();
  expect(s.editor.viewChildren[surface.key]??surface.children[0]).toBe(surface.children[0]);
  s.editor.commandRegistry.permit=()=>true;corner.click();await tick();expect(s.editor.viewChildren[surface.key]).toBe(surface.children[1]);
 });
 it('uses only the shared surface flip affordance for legacy reversible images',async()=>{
  const s=setup([{type:'surface-block',id:'legacy',children:[{type:'side-block',children:[{type:'image-block',id:'image',metadata:{url:'about:blank'}}]},{type:'side-block',children:[text('note','Preserved note')]}]}]);
  expect(s.host.querySelectorAll('.surface-fold')).toHaveLength(1);expect(s.host.querySelector('.reactive-flippable__flip')).toBeNull();
  const image=s.host.querySelector('img')!;image.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await tick();
  expect(s.editor.viewChildren[s.byId('legacy').key]).not.toBe(s.byId('legacy').children[1]);
  s.host.querySelector<HTMLButtonElement>('.surface-fold')!.click();await tick();
  expect(s.host.querySelector('img')).toBe(image);expect(s.byId('note').payload.id).toBe('note');
 });
 it('groups and dissolves contiguous Blocks with their identities and annotations; one undo entry',()=>{
  const s=setup([text('a'),{...text('b'),standoffProperties:[{id:'anno',type:'style/bold',start:0,end:0}]},text('c')]);
  const before=s.editor.encodeDocument();s.editor.blockSelection.select(s.byId('a').key,'single');s.editor.blockSelection.select(s.byId('b').key,'toggle');
  const commits=vi.spyOn(s.editor.repository,'commit');s.editor.surfaces.run('container.group',s.byId('a').key);
  const grouped=s.editor.encodeDocument();expect(grouped.children![0].type).toBe('container-block');expect(grouped.children![0].children).toEqual(before.children!.slice(0,2));expect(commits).toHaveBeenCalledTimes(1);
  const group=Object.values(s.projection.state.nodes).find(n=>n.viewType==='container-block')!;
  s.editor.surfaces.run('container.dissolve',group.key);expect(s.editor.encodeDocument().children).toEqual(before.children);
  s.editor.repository.undo();expect(s.editor.encodeDocument().children![0].type).toBe('container-block');
  s.editor.repository.undo();expect(s.editor.encodeDocument()).toEqual(before);
 });
 it('rejects gaps and cross-parent selections without committing',()=>{
  const s=setup([text('a'),text('b'),text('c'),{type:'container-block',id:'group',children:[text('d')]}]);const commit=vi.spyOn(s.editor.repository,'commit');
  for(const second of ['c','d']){s.editor.blockSelection.select(s.byId('a').key,'single');s.editor.blockSelection.select(s.byId(second).key,'toggle');s.editor.surfaces.run('container.group',s.byId('a').key);expect(s.editor.blockSelection.state.message).toMatch(/contiguous|same parent/);}
  expect(commit).not.toHaveBeenCalled();
 });
 it.each([true,false])('retains both editing DOMs, keys, caret and history while flipping (direct=%s)',async direct=>{
  const s=setup([text('a','Front text')],true,direct);s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();
  const front=s.byId('a'),surface=s.editor.surfaces.nearest(front.key)!;
  const backContainer=s.editor.node(s.editor.node(surface.children[1])!.children[0])!,back=s.editor.node(backContainer.children[0])!;
  s.editor.commands.replaceInlineRange(back.key,0,0,'Private notes');
  const mount=s.editor.mounts.get(front.key)!,backMount=s.editor.mounts.get(back.key)!,dom=mount.root,backDom=backMount.root,cells=[...front.inlineContent];
  mount.focus();mount.restoreInlineSelection!({anchor:2,head:7});
  const snapshot=vi.spyOn(s.editor.repository,'snapshot'),commit=vi.spyOn(s.editor.repository,'commit');
  for(let i=0;i<4;i++){s.editor.surfaces.run('surface.flip',front.key);await tick();}
  expect(s.editor.mounts.get(front.key)!.root).toBe(dom);expect(s.editor.mounts.get(back.key)!.root).toBe(backDom);expect(front.inlineContent).toEqual(cells);expect(mount.captureInlineSelection!()).toEqual({anchor:2,head:7});
  expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
  expect((backDom.closest('[data-surface-face]') as HTMLElement).inert).toBe(true);
 });
 it.each([true,false])('preserves the initial editing occurrence, Cells and selection through conversion and undo (direct=%s)',async direct=>{
  const s=setup([text('a','Already editing')],true,direct),before=s.byId('a'),key=before.key,cells=[...before.inlineContent],mount=s.editor.mounts.get(key)!,root=mount.root;
  mount.focus();mount.restoreInlineSelection!({anchor:2,head:9});
  const registers=vi.spyOn(s.editor.mounts,'register');
  s.editor.surfaces.run('surface.create',key);await tick();
  expect(s.byId('a').key).toBe(key);expect(s.byId('a').inlineContent).toEqual(cells);expect(s.editor.mounts.get(key)).toBe(mount);expect(mount.root).toBe(root);expect(mount.captureInlineSelection!()).toEqual({anchor:2,head:9});
  expect(registers.mock.calls.filter(([k])=>k===key)).toHaveLength(0);
  s.editor.repository.undo();await tick();expect(s.byId('a').key).toBe(key);expect(s.editor.mounts.get(key)).toBe(mount);
  s.editor.repository.redo();await tick();expect(s.byId('a').key).toBe(key);expect(s.editor.mounts.get(key)).toBe(mount);
  s.editor.commands.replaceInlineRange(key,0,0,'!');expect(mount.captureText!()).toBe('!Already editing');
 });
 it('refuses unsafe live iframe conversion in browsers without a state-preserving move API',()=>{
  const s=setup([{type:'iframe-block',id:'frame',metadata:{url:'about:blank'}}]),before=s.editor.encodeDocument();
  s.editor.surfaces.run('surface.create',s.byId('frame').key);
  expect(s.editor.encodeDocument()).toEqual(before);expect(s.editor.blockSelection.state.message).toMatch(/browser cannot move/);
 });
 it('defers structural conversion during composition without changing content',()=>{
  const s=setup([text('a')]),mount=s.editor.mounts.get(s.byId('a').key)!,before=s.editor.encodeDocument();mount.composing=true;
  s.editor.surfaces.run('surface.create',s.byId('a').key);expect(s.editor.encodeDocument()).toEqual(before);expect(s.editor.blockSelection.state.message).toMatch(/composition/);
 });
 it('preserves legacy image reverse content and normalizes only once, reopening on the front',()=>{
  const s=setup([{type:'surface-block',id:'old-card',metadata:{activeChildIndex:1},children:[{type:'side-block',id:'old-front',children:[{type:'image-block',id:'image',metadata:{url:'about:blank'}}]},{type:'side-block',id:'old-back',children:[{...text('note','Image note'),standoffProperties:[{id:'mark',type:'style/bold',start:0,end:3}]}]}]}]);
  const saved=s.editor.encodeDocument();expect(s.byId('note').payload.id).toBe('note');expect(s.byId('old-back').children).toHaveLength(1);
  expect(s.editor.surfaces.nearest(s.byId('image').key)!.key).toBe(s.byId('old-card').key);
  const second=setup(saved.children!);expect(second.editor.encodeDocument().children).toEqual(saved.children);
  expect(second.host.querySelector('[data-face-key="'+second.byId('old-front').key+'"]')?.getAttribute('aria-hidden')).toBe('false');
 });
 it('cancels populated-container dissolve, then unwraps both faces in order',async()=>{
  const s=setup([{type:'container-block',id:'group',children:[text('a'),text('b')]}]);s.editor.surfaces.run('surface.create',s.byId('group').key);await tick();
  const surface=s.editor.surfaces.nearest(s.byId('a').key)!,container=s.editor.node(s.editor.node(surface.children[1])!.children[0])!;
  s.editor.commands.insert(text('note'),{kind:'at',parentKey:container.key,index:0});const before=s.editor.encodeDocument(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  s.editor.surfaces.run('container.dissolve',s.byId('group').key);expect(s.editor.encodeDocument()).toEqual(before);
  confirm.mockReturnValue(true);s.editor.surfaces.run('container.dissolve',s.byId('group').key);expect(s.editor.encodeDocument().children!.slice(0,3).map(c=>c.id)).toEqual(['a','b','note']);
 });
 it('creates a nested reverse explicitly and flips the nearest surface',async()=>{
  const s=setup([text('a')]);s.editor.surfaces.run('surface.flip',s.byId('a').key);await tick();
  const outer=s.editor.surfaces.nearest(s.byId('a').key)!,back=s.editor.node(s.editor.node(s.editor.node(outer.children[1])!.children[0])!.children[0])!,id=String(back.payload.id);
  s.editor.surfaces.run('surface.create',back.key);await tick();const inner=s.editor.surfaces.nearest(s.byId(id).key)!;
  expect(inner.key).not.toBe(outer.key);s.editor.surfaces.run('surface.flip',s.byId(id).key);await tick();
  expect(s.editor.viewChildren[outer.key]).toBe(outer.children[1]);expect(s.editor.viewChildren[inner.key]).toBe(inner.children[1]);
 });
 it('unwraps reverse children after the whole owner, preserving IDs and Undo',async()=>{
  const s=setup([text('a'),text('z')]);s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();
  const surface=s.editor.surfaces.nearest(s.byId('a').key)!,container=s.editor.node(s.editor.node(surface.children[1])!.children[0])!;
  s.editor.commands.insert(text('note','Private note'),{kind:'at',parentKey:container.key,index:0});const before=s.editor.encodeDocument();
  s.editor.surfaces.run('surface.unwrap',s.byId('a').key);expect(s.editor.encodeDocument().children![1].id).toBe('note');expect(s.editor.encodeDocument().children!.at(-1)!.id).toBe('z');
  s.editor.repository.undo();expect(s.editor.encodeDocument()).toEqual(before);
 });
 it('cancels reverse deletion and preserves canonical resource attributes when confirmed',async()=>{
  const s=setup([text('a')]);s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();const before=s.editor.encodeDocument();
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);s.editor.surfaces.run('surface.delete',s.byId('a').key);expect(s.editor.encodeDocument()).toEqual(before);
  confirm.mockReturnValue(true);s.editor.surfaces.run('surface.delete',s.byId('a').key);expect(s.editor.surfaces.nearest(s.byId('a').key)!.children).toHaveLength(1);s.editor.repository.undo();expect(s.editor.encodeDocument()).toEqual(before);
 });
 it('wraps acquired video once, keeps iframe on flip, and does not repeat deleted information',async()=>{
  const s=setup([text('a')]),url='https://youtu.be/M7lc1UVf-VE',native=resourceSurface(resourceBlock(url).native);
  const root=s.editor.commands.insertFragment(native,{kind:'after',anchorKey:s.byId('a').key})[0];
  const surface=s.editor.nodeForPlacementInView(root,s.projection.viewId)!;const frame=s.host.querySelector('iframe');expect(frame).not.toBeNull();
  const resource=Object.values(s.projection.state.nodes).find(n=>n.viewType==='youtube-player-block')!;
  const commit=vi.spyOn(s.editor.repository,'commit');s.editor.surfaces.run('surface.flip',resource.key);await tick();
  expect(s.host.querySelector('iframe')).toBe(frame);expect(commit).not.toHaveBeenCalled();expect(s.host.querySelector('.resource-reverse-information a')?.getAttribute('href')).toBe(url);
  const info=Object.values(s.projection.state.nodes).find(n=>n.viewType==='resource-information-block')!;s.editor.commands.remove(info.key);
  s.editor.surfaces.run('surface.flip',surface.key);s.editor.surfaces.run('surface.flip',surface.key);await tick();
  expect(s.host.querySelector('.resource-reverse-information')).toBeNull();expect(resource.payload.sourceUrl).toBe(url);
 });
 it('round-trips both faces natively and through clipboard, excludes reverse text from reading exports',async()=>{
  const s=setup([text('a','Public front')]);s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();
  const surface=s.editor.surfaces.nearest(s.byId('a').key)!,container=s.editor.node(s.editor.node(surface.children[1])!.children[0])!;
  s.editor.commands.insert(text('secret','PRIVATE REVERSE'),{kind:'at',parentKey:container.key,index:0});
  const native=nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'));const loaded=decodeNative(new TextEncoder().encode(JSON.stringify(native)));const secret=Object.values(loaded.contents).find(c=>c.payload.id==='secret')!;expect(secret.inlineContent.map(k=>loaded.contents[(loaded.placements[k].target as any).contentKey].payload.text).join('')).toBe('PRIVATE REVERSE');
  const fragment=serializeSelection(s.editor.repository.readState(),[{placementKey:surface.placementKey}],{}),copy=materializeFragment(fragment);
  expect(Object.values(copy.state.contents).some(c=>c.viewType==='surface-block')).toBe(true);expect(Object.values(copy.state.contents).filter(c=>c.viewType==='standoff-editor-block')).toHaveLength(3);
  for(const format of ['html','markdown','text'] as const){const exported=exportFragment(fragment,format);expect(exported.text).toContain('Public front');expect(exported.text).not.toContain('PRIVATE REVERSE');}
 });
 it('disposes the retained real editor owner exactly once at final close',async()=>{
  let mounts=0,disposals=0;
  const s=setup([text('a')],true,true,editor=>{const registration=editor.registry.resolve('standoff-editor-block')!,View=registration.view;
   registration.view=props=>{if(editor.node(props.nodeKey)?.payload.id==='a'){mounts++;onCleanup(()=>disposals++);}return <View {...props}/>;};
  });
  const key=s.byId('a').key;s.editor.surfaces.run('surface.create',key);await tick();s.editor.repository.undo();await tick();s.editor.repository.redo();await tick();
  expect(mounts).toBe(1);expect(disposals).toBe(0);s.dispose();expect(disposals).toBe(1);await tick();expect(disposals).toBe(1);expect(document.querySelector('[data-block-transfer-parking]')).toBeNull();
 });
 it.each([...resourceTypes])('keeps %s missing-metadata fallback mounted and operable across faces',async type=>{
  const dto:ExistingBlockDto={type,id:'resource',text:''};
  const s=setup([{type:'surface-block',metadata:{reversible:true},children:[{type:'side-block',children:[dto]},{type:'side-block',children:[{type:'container-block',metadata:{structuralContainer:true},children:[resourceInformation({id:'resource'}),text('note')]}]}]}]);
  const n=s.byId('resource'),root=s.editor.mounts.get(n.key)?.root;expect(root).toBeDefined();
  s.editor.surfaces.run('surface.flip',n.key);await tick();s.editor.surfaces.run('surface.flip',n.key);await tick();
  expect(s.editor.mounts.get(n.key)?.root).toBe(root);expect(s.byId('note')).toBeDefined();
 });
 it('keeps valid citation, academic and web controls on their proper faces and preserves the web consent gate',async()=>{
  const asset={kind:'managed',cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)};
  const descriptors:ExistingBlockDto[]=[
   {id:'cite',type:'mutable/citation-block',citation:{version:1,entityId:'entity',snapshotId:'citation',provider:'crossref',retrievedAt:'2026-10-24',metadata:{doi:'10.1234/test',title:'Citation title',creators:[],providerType:'journal-article',fullTextCandidates:['https://example.org/article.pdf'],diagnostics:['Citation warning']}}},
   {id:'academic',type:'mutable/academic-resource-block',academic:{version:1,kind:'deterministic',snapshotId:'academic',resourceId:'resource',format:'orcid',source:'https://orcid.org/0000-0002-1825-0097',retrievedAt:'2026-10-24',asset,projection:{version:1,kind:'orcid',title:'Researcher',diagnostics:[],citations:[],person:{name:'Researcher'}}}},
   {id:'web',type:'mutable/web-resource-block',web:{version:1,snapshotId:'web',source:'https://www.google.com/maps?q=Brisbane',capturedAt:'2026-10-24T00:00:00Z',asset,projection:{provider:'google-maps',status:'captured',title:'Map',diagnostics:['Web warning'],location:{query:'Brisbane'}}}},
  ];
  const s=setup(descriptors.map(dto=>({type:'surface-block',metadata:{reversible:true},children:[{type:'side-block',children:[dto]},{type:'side-block',children:[{type:'container-block',children:[resourceInformation({id:dto.id})]}]}]})));
  const cite=s.editor.mounts.get(s.byId('cite').key)!.root,academic=s.editor.mounts.get(s.byId('academic').key)!.root,web=s.editor.mounts.get(s.byId('web').key)!.root;
  expect(cite.textContent).toContain('Citation title');expect(cite.textContent).not.toContain('Citation warning');expect(cite.textContent).not.toContain('Export CSL JSON');
  expect(academic.textContent).toContain('Researcher');expect(academic.textContent).not.toContain('Download retained original');
  const back=[...s.host.querySelectorAll('.resource-reverse-information')].map(e=>e.textContent).join(' ');expect(back).toContain('Export CSL JSON');expect(back).toContain('Download retained original');expect(back).toContain('Web warning');
  expect(web.querySelector('iframe')).toBeNull();[...web.querySelectorAll('button')].find(b=>b.textContent==='Load map')!.click();expect(web.querySelector('[aria-label="Third-party content permission"]')).not.toBeNull();expect(web.querySelector('iframe')).toBeNull();
  s.editor.surfaces.run('surface.flip',s.byId('web').key);await tick();s.editor.surfaces.run('surface.flip',s.byId('web').key);await tick();
  expect(web.querySelector('[aria-label="Third-party content permission"]')).not.toBeNull();expect(web.querySelector('iframe')).toBeNull();[...web.querySelectorAll('button')].find(b=>b.textContent==='Cancel')!.click();expect(web.querySelector('iframe')).toBeNull();
 });
 it('keeps IIIF consent and failed-load recovery on the front while moving attribution to the back',async()=>{
  const projection=normalizeIIIF(new TextEncoder().encode(JSON.stringify(manifestFixture(1))));
  const api=vi.spyOn(HttpApplicationServices.prototype,'call').mockImplementation((async(name:string)=>{if(name==='iiif.read')return {projection};throw Error('Fixture load failure');}) as any);
  const s=setup([{type:'surface-block',metadata:{reversible:true},children:[{type:'side-block',children:[{id:'iiif',type:'mutable/iiif-manifest-block',iiif:{snapshotId:'iiif',sourceUrl:'https://books.example/manifest.json',label:'Manuscript',retrievedAt:'2026-10-24'}}]},{type:'side-block',children:[{type:'container-block',children:[resourceInformation({id:'iiif'})]}]}]}]);await tick();
  const root=s.editor.mounts.get(s.byId('iiif').key)!.root;expect(root.textContent).toContain('Online activation sends');expect(root.textContent).not.toContain('Fixture collection');expect(s.host.querySelector('.resource-reverse-information')!.textContent).toContain('Fixture collection');
  expect(api.mock.calls.some(([name])=>name==='iiif.open')).toBe(false);[...root.querySelectorAll('button')].find(b=>b.textContent==='Activate online viewer')!.click();await tick();expect(root.textContent).toContain('Fixture load failure');expect(root.textContent).toContain('Activate online viewer');
 });
 it('whole-Block copy, grouping and deletion carry the reverse; confirmation cancellation is lossless',async()=>{
  const s=setup([text('a'),text('b')]);s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();const surface=s.editor.surfaces.nearest(s.byId('a').key)!;
  s.editor.blockSelection.select(s.byId('a').key);expect(s.editor.blockSelection.actionTargets().map(t=>t.nodeKey)).toEqual([surface.key]);
  s.editor.blockSelection.select(s.byId('b').key,'toggle');s.editor.surfaces.run('container.group',s.byId('a').key);await tick();
  expect(s.editor.encodeDocument().children![0].children!.map(c=>c.type)).toEqual(['surface-block','standoff-editor-block']);
  s.editor.blockSelection.select(s.byId('a').key);const before=s.editor.encodeDocument(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);s.editor.blockClipboard.remove(false);expect(s.editor.encodeDocument()).toEqual(before);
  confirm.mockReturnValue(true);s.editor.blockClipboard.remove(false);expect(s.byId('a')).toBeUndefined();expect(s.editor.node(surface.key)).toBeUndefined();s.editor.repository.undo();expect(s.editor.encodeDocument()).toEqual(before);
 });
 it('native packages retain reverse content and Find reveals the hidden face without editing',async()=>{
  const s=setup([text('a','Visible')]);s.editor.surfaces.run('surface.create',s.byId('a').key);await tick();const surface=s.editor.surfaces.nearest(s.byId('a').key)!,container=s.editor.node(s.editor.node(surface.children[1])!.children[0])!;
  s.editor.commands.insert(text('private','Secret searchable note'),{kind:'at',parentKey:container.key,index:0});
  const snapshot=captureNative(s.editor.repository.readState(),'doc'),data={kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[],provenance:{},selection:{},unresolved:[],excluded:[]} as any;
  const archive=await createPackage(nativeBytes(snapshot),{resourceId:'doc'},data,{kind:'mutable-knowledge-schema',version:1,tables:[]},[]),loaded=await openPackage(archive);
  expect(Object.values(loaded.snapshot.contents).some(c=>c.payload.id==='private')).toBe(true);
  const revision=s.editor.repository.state.revision;s.editor.find.open(s.byId('a').key);s.editor.find.setQuery('Secret searchable');await vi.waitFor(()=>expect(s.editor.find.state.result?.matches).toHaveLength(1));await s.editor.find.navigate(1);
  expect(s.editor.viewChildren[surface.key]).toBe(surface.children[1]);expect(s.editor.repository.state.revision).toBe(revision);
 });
 it('leaves commands unavailable under the feature fallback',()=>{const s=setup([text('a')],false);expect(s.editor.surfaces.can('surface.create',s.byId('a').key)).toBe(false);s.editor.surfaces.run('surface.create',s.byId('a').key);expect(s.editor.encodeDocument().children![0].id).toBe('a');});
});

it('resolves a resource information owner through its Surface without enumerating repository contents',()=>{
 const editor=new ReactiveEditor({type:'document-block',id:'bounded',children:[{type:'surface-block',children:[{type:'side-block',children:[{type:'iframe-block',id:'resource',metadata:{url:'https://example.org'}}]},{type:'side-block',children:[{type:'container-block',children:[resourceInformation({id:'resource'})]}]}]}]},{features:{reversibleBlocks:true}});registerCoreViews(editor);const projection=editor.createView('bounded-information');
 const read=editor.repository.readState.bind(editor.repository),keys=vi.fn(Reflect.ownKeys);vi.spyOn(editor.repository,'readState').mockImplementation(()=>{const state=read();return {...state,contents:new Proxy<typeof state.contents>(state.contents,{ownKeys:keys})};});
 const host=document.body.appendChild(document.createElement('div')),dispose=render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host);cleanups.push(()=>{dispose();editor.dispose();});
 expect(host.querySelector('.resource-reverse-information')).not.toBeNull();expect(keys).not.toHaveBeenCalled();
});
