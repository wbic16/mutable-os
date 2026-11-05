import {For,Show} from 'solid-js';
import type {CodexFeature} from '../runtime/features';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {applicationPresentations} from './application-presentations';
import {TextualCardex} from '../features/textual/cardex';
import {flintApplication,cardexApplication} from './application-presentation-keys';
import {FlintHost} from '../features/textual/flint';
import {useTextualApplicationHost} from '../features/textual/applications';
/** Independent feature: may register before or after the application feature. */
export function createTextualPresentationFeature(editor:ReactiveEditor):CodexFeature{
 return {id:'textual-application-presentations',activate(scope){
  const registry=applicationPresentations(editor);
  scope.own(registry.registerPresentation(cardexApplication,{
   id:'cardex.textual.instrument',workspace:'textual',default:true,interaction:'exclusive-instance',
   available:()=>editor.features.textualWorkspace?undefined:'Textual is disabled',
   admit:p=>p.canPresent()?undefined:'Finish the Cardex operation first',
   view:props=><TextualCardex editor={editor} port={props.instance} choose={props.host.select} close={destination=>props.host.back(typeof destination==='string'?{applicationId:'flint',instanceKey:destination}:destination)}/>,
  }));
  scope.own(registry.registerPresentation(flintApplication,{
   id:'flint.textual.editor',workspace:'textual',default:true,entryPriority:1,interaction:'exclusive-session',
   available:()=>!editor.features.textualWorkspace||!editor.documentSessions?'Textual Flint requires retained Document sessions':undefined,
   admit:p=>{try{const s=p.session();if(s)editor.documentSessions?.presentations.check(s);}catch(e){return String(e);}},
   view:props=>{const context=useTextualApplicationHost();const ports=()=>registry.application(flintApplication)?.instances()??[];
    return <FlintHost covered={!props.host.active()} openCardex={()=>void props.host.open('cardex')} port={props.instance} session={context.session} grid={context.grid()} applications={<Show when={ports().length>1}><select aria-label="Flint application" value={props.instance.key} onChange={e=>props.host.select(e.currentTarget.value)}><For each={ports()}>{(app,index)=><option value={app.key}>Flint {index()+1}</option>}</For></select></Show>}/>;
   }
  }));
 }};
}
