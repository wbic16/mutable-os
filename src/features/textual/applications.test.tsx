import {afterEach,expect,it,vi} from 'vitest';
import {onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import {TextualApplications} from './applications';
import {measuredGrid} from './grid';
import {applicationPresentations} from '../../application/application-presentations';
import {applicationKey,type ApplicationPresentationHost} from '../../feature-api/application-presentation';
import type {WorkspaceSession} from '../../application/workspace-session';
const cleanup:(()=>void)[]=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.innerHTML='';});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
it('restores an ordinary presentation after another view fails to mount, retaining the shared instance and DOM',async()=>{
 const session={editor:{}} as WorkspaceSession,r=applicationPresentations(session.editor),first={key:'first',text:'draft'},second={key:'first'},a=applicationKey<typeof first>('first'),b=applicationKey<typeof second>('second');
 let navigation!:ApplicationPresentationHost;const stopped=vi.fn();
 r.registerApplication(a,{name:'First',instances:()=>[first],key:p=>p.key});r.registerApplication(b,{name:'Second',instances:()=>[second],key:p=>p.key});
 r.registerPresentation(a,{id:'first.textual',workspace:'textual',entryPriority:1,interaction:'noninteractive',view:p=>{navigation=p.host;onCleanup(stopped);return <input value={p.instance.text}/>;}});
 r.registerPresentation(b,{id:'second.textual',workspace:'textual',interaction:'noninteractive',view:()=>{throw Error('Mount failed');}});
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><TextualApplications session={session} grid={measuredGrid(1280,900,10,20)}/>,host));
 const input=host.querySelector('input');expect(input?.value).toBe('draft');await navigation.open('second');await tick();
 expect(host.querySelector('input')).toBe(input);expect(stopped).not.toHaveBeenCalled();expect(navigation.active()).toBe(true);expect(host.textContent).toContain('Mount failed');
});
it('keeps the active presentation when the destination is temporarily blocked or unsupported',async()=>{
 const session={editor:{}} as WorkspaceSession,r=applicationPresentations(session.editor),first={key:'a'},second={key:'b'},a=applicationKey<typeof first>('a'),b=applicationKey<typeof second>('b');let navigation!:ApplicationPresentationHost;
 r.registerApplication(a,{name:'A',instances:()=>[first],key:p=>p.key});r.registerApplication(b,{name:'B',instances:()=>[second],key:p=>p.key});
 r.registerPresentation(a,{id:'a.textual',workspace:'textual',entryPriority:1,interaction:'noninteractive',view:p=>{navigation=p.host;return <input value="keep"/>;}});
 const remove=r.registerPresentation(b,{id:'b.textual',workspace:'textual',interaction:'noninteractive',admit:()=> 'Finish composition',view:()=>null});
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><TextualApplications session={session} grid={measuredGrid(1280,900,10,20)}/>,host));const input=host.querySelector('input');
 await navigation.open('b');expect(host.textContent).toContain('Finish composition');expect(host.querySelector('input')).toBe(input);
 remove();await navigation.open('b');expect(host.textContent).toContain('no textual presentation');expect(host.querySelector('input')).toBe(input);
});
