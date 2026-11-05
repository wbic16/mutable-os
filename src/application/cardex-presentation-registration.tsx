import type {ReactiveEditor} from '../reactive-editor/editor';
import type {FeatureScope} from '../runtime/features';
import {cardexPresentationPorts} from './cardex-presentation-ports';
import {applicationPresentations} from './application-presentations';
import {cardexApplication} from './application-presentation-keys';
export function registerCardexPresentations(editor:ReactiveEditor,scope:FeatureScope){
 const registry=applicationPresentations(editor);
 scope.own(registry.registerApplication(cardexApplication,{
  name:'Cardex',instances:()=>cardexPresentationPorts(editor).ports(),key:p=>p.key,
  windowId:p=>p.windowKey?editor.windowManager?.ownerForNode(p.windowKey):undefined,
  open:()=>editor.commandRegistry.execute('cardex.open',{targetKey:[...editor.projections.values()][0].state.rootKey,args:undefined}),
  ownsNode:(p,key)=>editor.node(key)?.viewType==='cardex-application-block'&&editor.blockQueries.ancestors(key).find(n=>n.viewType==='window-block')?.key===p.windowKey,
  checkTransition:(p,from,to)=>{
   if(!['desktop','textual'].includes(from)||!['desktop','textual'].includes(to))return 'Cardex does not support this workspace route';
   const id=p.windowKey?editor.windowManager?.ownerForNode(p.windowKey):undefined;
   if(!id||!editor.windowManager?.lifecycle.canTransfer(id)||!p.canPresent())return 'Finish the Cardex operation, composition or window gesture first';
  },
 }));
 scope.own(registry.registerPresentation(cardexApplication,{id:'cardex.desktop.instrument',workspace:'desktop',default:true,interaction:'exclusive-instance',view:p=><>{p.instance.desktop?.()}</>}));
}
