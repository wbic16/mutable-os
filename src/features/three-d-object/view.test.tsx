// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {registerApplicationViews} from '../../application/features';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {objectDto} from './model';
const mocks=vi.hoisted(()=>({scenes:[] as any[]}));
vi.mock('./scene-runtime',()=>({createObjectScene:(_canvas:any,state:any)=>{
 let current=state.view;
 const scene={size:vi.fn(),view:(next?:any)=>next?current=next:current,update:vi.fn((next:any)=>{current=next.view;}),activity:vi.fn(),fit:vi.fn(),dispose:vi.fn()};mocks.scenes.push(scene);return scene;
}}));
afterEach(()=>{document.body.replaceChildren();vi.unstubAllGlobals();vi.restoreAllMocks();mocks.scenes.splice(0);});
it('preserves native orbit/menu presentation in protected content and disposes the scene',async()=>{
 vi.stubGlobal('ResizeObserver',class{constructor(private cb:Function){}observe(target:HTMLElement){Object.defineProperty(target,'clientWidth',{value:280});Object.defineProperty(target,'clientHeight',{value:280});this.cb([]);}disconnect(){}});
 vi.stubGlobal('IntersectionObserver',class{constructor(private cb:Function){}observe(){this.cb([{isIntersecting:true}]);}disconnect(){}});
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 const e=new ReactiveEditor({id:'doc',type:'document-block',children:[{...objectDto(),id:'cup'}]});registerApplicationViews(e);const projection=e.createView(),host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={e} projection={projection}/>,host);
 try{
  await vi.waitFor(()=>expect(mocks.scenes.length).toBe(1));
  const n=Object.values(projection.state.nodes).find(n=>n.payload.id==='cup')!,root=e.mounts.get(n.key)!.root,canvas=root.querySelector('canvas')!;
  const release=e.textProtection.protect(n.contentKey),before=e.encodeDocument(),revision=e.repository.state.revision;
  const snapshots=vi.spyOn(e.repository,'snapshot'),scene=mocks.scenes[0];
  expect(root.querySelector('[aria-label="Resize 3D Object"]')).toBeNull();
  const items=()=>e.mounts.get(n.key)!.contextActions!()[0].children!;
  expect(items().find(i=>i.label==='Lighting')!.disabled).toBe(true);expect(items().find(i=>i.label==='Reset Object')!.disabled).toBe(true);expect(items().find(i=>i.label.startsWith('Steam:'))!.disabled).toBe(true);
  items().find(i=>i.label==='View')!.children!.find(i=>i.label==='Side')!.run!();expect(scene.view().azimuth).toBe(90);const unrelated=e.textProtection.register(()=>false);expect(scene.view().azimuth).toBe(90);unrelated();
  canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));canvas.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowLeft',bubbles:true}));await new Promise(r=>setTimeout(r,350));expect(scene.view().azimuth).toBe(85);
  items().find(i=>i.label.startsWith('Auto Rotate:'))!.run!();expect(items().some(i=>i.label==='Auto Rotate: On')).toBe(true);
  expect(e.repository.state.revision).toBe(revision);expect(snapshots).not.toHaveBeenCalled();expect(e.encodeDocument()).toEqual(before);
  expect(()=>e.commands.setPayloadField(n.key,'object3D',{})).toThrow(/protected/);
  release();expect(items().find(i=>i.label==='Lighting')!.disabled).not.toBe(true);items().find(i=>i.label==='Lighting')!.children![1].run!();expect((e.node(n.key)!.payload.object3D as any).lighting).toBe('warm');
 }finally{dispose();e.dispose();}
 expect(mocks.scenes[0].dispose).toHaveBeenCalledTimes(1);
});
