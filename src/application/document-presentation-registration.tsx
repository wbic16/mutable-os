import type {FeatureScope} from '../runtime/features';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {applicationKey} from '../feature-api/application-presentation';
import {applicationPresentations} from './application-presentations';
import {documentApplicationPorts,type DocumentApplicationPort} from './document-application-ports';
/** Registration adapter over existing document owners, never a second application instance. */
export function registerDocumentPresentations(editor:ReactiveEditor,scope:FeatureScope,id:string){
 const key=applicationKey<DocumentApplicationPort>(id),registry=applicationPresentations(editor);
 scope.own(registry.registerApplication(key,{
  name:id==='flint'?'Flint':id,instances:()=>documentApplicationPorts(editor).ports().filter(p=>p.applicationId===id),key:p=>p.key,windowId:p=>p.windowId(),
  open:()=>editor.commandRegistry.execute(`${id}.open`,{targetKey:[...editor.projections.values()][0].state.rootKey,args:undefined}),
  checkTransition:(p,from,to)=>{if(from!=='textual'&&to!=='textual')return;try{const s=p.session();if(s)editor.documentSessions?.presentations.check(s);}catch(e){return String(e);}},
  remember:p=>{const s=p.session();if(s)editor.documentSessions?.presentations.remember(s);},
  resume:(p,navigation)=>{const s=p.session();if(!s)return;if(navigation){editor.concertina.claim('application/source-navigation');editor.concertina.clearAll();editor.documentSessions?.presentations.remember(s);}editor.documentSessions?.presentations.restorePosition(s,true);},
 }));
 scope.own(registry.registerPresentation(key,{id:`${id}.desktop.editor`,workspace:'desktop',default:true,interaction:'exclusive-session',view:p=><>{p.instance.desktop?.()}</>}));
 return key;
}
