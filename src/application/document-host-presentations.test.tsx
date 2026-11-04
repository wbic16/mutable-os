// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {WorkspaceSession} from './workspace-session';
import {WorkspacePresentationView} from './workspace-presentation-view';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from './document-application-ports';
const cleanups:Array<()=>void>=[];
afterEach(()=>{cleanups.reverse().splice(0).forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function setup(){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'isolated test'}),{status:503})));
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[{id:'doc',type:'document-block',metadata:{documentId:'doc',title:'Document'},children:[{id:'text',type:'standoff-editor-block',text:'Retain this editor.'}]}]}]}),{features:{nativeDocumentPersistence:false,nativeKnowledge:false,sqliteKnowledge:false}});
 cleanups.push(()=>session.dispose());const editor=session.editor;
 cleanups.push(render(()=><WorkspacePresentationView session={session}/>,document.body));
 await editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 await Promise.resolve();await Promise.resolve();
 const app=documentApplicationPorts(editor).ports()[0],doc=app.session()!,source=doc.host.port!,destination=document.body.appendChild(document.createElement('div'));
 const snapshot=vi.spyOn(editor.repository,'snapshot'),create=vi.spyOn(editor,'createView');
 return {session,editor,app,doc,source,destination,snapshot,create,present:()=>session.documentSessions!.presentations.present(doc,{container:destination,scrollport:destination,activity:()=>({mounted:true,visible:true,active:true})})};
}
it('presents the same retained DOM and owner, restores it, and performs no canonical or projection work',async()=>{
 const f=await setup(),flow=f.doc.element.querySelector('[contenteditable=true]'),projection=f.doc.projection,revision=f.editor.repository.state.revision;
 const restore=f.present();expect(f.destination.contains(flow)).toBe(true);expect(f.doc.host.windowId).toBe(f.source.windowId);expect(f.session.documentSessions!.transfers.atOrigin(f.doc)).toBe(true);expect(f.doc.projection).toBe(projection);
 expect(()=>f.session.documentSessions!.transfers.assertPersistable()).not.toThrow();
 restore();restore();expect(f.source.container.contains(flow)).toBe(true);expect(f.doc.host.port).toBe(f.source);expect(f.editor.repository.state.revision).toBe(revision);expect(f.snapshot).not.toHaveBeenCalled();expect(f.create).not.toHaveBeenCalled();
});
it('rolls back an attachment failure and refuses a competing presentation lease',async()=>{
 const f=await setup();vi.spyOn(f.destination,'append').mockImplementationOnce(()=>{throw Error('attachment failed');});
 expect(f.present).toThrow('attachment failed');expect(f.source.container.contains(f.doc.element)).toBe(true);expect(f.doc.host.port).toBe(f.source);
 const restore=f.present();expect(f.present).toThrow('already hosted');restore();expect(f.snapshot).not.toHaveBeenCalled();expect(f.create).not.toHaveBeenCalled();
});
it('retains composition/window guards and releases presentation state with its owning session',async()=>{
 const f=await setup();document.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));expect(f.present).toThrow('Finish composition');
 document.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));await Promise.resolve();await Promise.resolve();
 const restore=f.present();f.session.documentSessions!.release(f.doc);restore();expect(f.doc.current()).toBe(false);expect(f.destination.childElementCount).toBe(0);expect(f.snapshot).not.toHaveBeenCalled();
});
