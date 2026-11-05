import {afterEach,expect,it,vi} from 'vitest';
import {createSignal,onCleanup,onMount} from 'solid-js';
import {render} from 'solid-js/web';
import {ApplicationPresentations} from './application-presentations';
import {FeatureHost} from './features';
import {applicationKey,type ApplicationPresentation} from '../feature-api/application-presentation';
import {RegisteredApplicationView,applicationPresentations,originPresentationHost} from '../application/application-presentations';
import type {ReactiveEditor} from '../reactive-editor/editor';
const cleanup:(()=>void)[]=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.innerHTML='';});
const key=applicationKey<{draft:string}>('example'),instance={draft:'unsaved'};
const definition={name:'Example',instances:()=>[instance],key:()=> 'instance'};
const view=(id:string,options:Partial<ApplicationPresentation<typeof instance>>={}):ApplicationPresentation<typeof instance>=>({id,workspace:'textual',interaction:'noninteractive',view:()=>null,...options});
it('allows independent features in either order and retains dormant contributions safely',()=>{
 const r=new ApplicationPresentations(),host=new FeatureHost();cleanup.push(()=>host.dispose());
 const removeView=host.activate({id:'view-feature',activate:s=>s.own(r.registerPresentation(key,view('independent',{default:true})))});
 expect(r.resolve(key,'textual',instance).status).toBe('unsupported');
 const removeApp=host.activate({id:'app-feature',activate:s=>s.own(r.registerApplication(key,definition))});
 expect(r.resolve(key,'textual',instance).status).toBe('ready');removeApp();expect(r.resolve(key,'textual',instance).status).toBe('unsupported');
 const replacement={draft:'new'};r.registerApplication(key,{...definition,instances:()=>[replacement]});
 expect(r.resolve(key,'textual',instance).status).toBe('unsupported');expect(r.resolve(key,'textual',replacement).status).toBe('ready');
 removeView();expect(r.resolve(key,'textual',replacement).status).toBe('unsupported');expect(replacement.draft).toBe('new');
});
it('resolves explicit IDs/defaults without workspace or availability substitution; separates temporary barriers',()=>{
 const r=new ApplicationPresentations();r.registerApplication(key,definition);let busy=true;
 r.registerPresentation(key,view('full',{default:true,admit:()=>busy?'Finish composition':undefined}));r.registerPresentation(key,view('compact'));
 expect(r.resolve(key,'textual',instance)).toMatchObject({status:'blocked',reason:'Finish composition'});
 expect(r.resolve(key,'textual',instance,'compact').status).toBe('ready');expect(r.resolve(key,'desktop',instance,'full').status).toBe('unsupported');
 expect(()=>r.registerPresentation(key,view('second-default',{default:true}))).toThrow('Default');
 expect(()=>r.registerPresentation(key,view('full'))).toThrow('already registered');busy=false;expect(r.resolve(key,'textual',instance).status).toBe('ready');
 r.registerPresentation(key,view('restricted',{available:()=> 'Requires graphics'}));expect(r.resolve(key,'textual',instance,'restricted')).toMatchObject({status:'unsupported',reason:'Requires graphics'});
});
it('does not choose arbitrarily among multiple non-defaults; release is idempotent',()=>{
 const r=new ApplicationPresentations();r.registerApplication(key,definition);const descriptor=view('a'),release=r.registerPresentation(key,descriptor);release();r.registerPresentation(key,descriptor);release();
 expect(r.resolve(key,'textual',instance).status).toBe('ready');r.registerPresentation(key,view('b'));expect(r.resolve(key,'textual',instance).status).toBe('unsupported');
});
it('mounts ordinary reconstructible components; contribution/app disposal cleans views without touching the shared instance',()=>{
 const editor={} as ReactiveEditor,r=applicationPresentations(editor),host=document.body.appendChild(document.createElement('div'));let mounts=0,disposals=0;const[busy,setBusy]=createSignal(true);
 const removeApp=r.registerApplication(key,definition);const descriptor=view('ordinary',{default:true,admit:()=>busy()?'Busy':undefined,view:props=>{onMount(()=>mounts++);onCleanup(()=>disposals++);return <input value={props.instance.draft}/>;}});
 const remove=r.registerPresentation(key,descriptor);cleanup.push(render(()=><RegisteredApplicationView editor={editor} application={key} instance={instance} workspace="textual" host={originPresentationHost}/>,host));
 expect(mounts).toBe(0);expect(host.textContent).toContain('Busy');setBusy(false);expect(mounts).toBe(1);setBusy(true);expect(disposals).toBe(0);remove();expect(disposals).toBe(1);expect(host.textContent).toContain('no textual presentation');
 setBusy(false);r.registerPresentation(key,descriptor);expect(mounts).toBe(2);removeApp();expect(disposals).toBe(2);expect(instance.draft).toBe('unsaved');
});
it('requires owner-scoped transition permission and preserves temporary admission barriers',()=>{
 const r=new ApplicationPresentations(),remember=vi.fn();let busy=false;
 r.registerApplication(key,{...definition,ownsNode:(_,node)=>node==='owned',checkTransition:(_,from,to)=>from==='desktop'&&to==='textual'&&!busy?undefined:'Finish operation',remember});
 r.registerPresentation(key,view('desktop',{workspace:'desktop'}));r.registerPresentation(key,view('textual'));
 expect(r.allowsNode('other','desktop','textual')).toBe(false);expect(r.allowsNode('owned','desktop','textual')).toBe(true);busy=true;expect(r.allowsNode('owned','desktop','textual')).toBe(false);expect(()=>r.checkTransition('desktop','textual')).toThrow('Finish operation');r.remember();expect(remember).toHaveBeenCalledOnce();
});
