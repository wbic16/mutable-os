import {expect,it} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from '../rendering/register-core-views';
import {blockMenuItems} from '../runtime/block-menu-actions';
import {prepareSurface,prepareTabs,attachMargins} from './compound-authoring';
import type {ExistingBlockDto} from './types';

// Compare authored structure/configuration, not freshly allocated host identities
// or editor focus bookkeeping. Identity preservation is covered by command tests.
function shape(n:ExistingBlockDto):any {
 const m=n.metadata as any,configuration:any={};
 for(const key of ['name','active','surfaceRole','structuralContainer','reversible'])if(m?.[key]!==undefined)configuration[key]=m[key];
 if(['tab-row-block','document-tab-row-block'].includes(n.type!))configuration.orientation=m?.orientation??'horizontal';
 return {type:n.type,text:n.text,configuration,properties:n.blockProperties??[],children:(n.children??[]).map(shape),relations:Object.fromEntries(Object.entries(n.relation??{}).map(([name,child])=>[name,shape(child as ExistingBlockDto)]))};
}
it.each(['tabs','pages','surface','margins'])('shares the %s native structure with the human authoring command',kind=>{
 const text:ExistingBlockDto={id:'text',type:'standoff-editor-block',text:'Original'},blank:ExistingBlockDto={type:'standoff-editor-block',text:''};
 const e=new ReactiveEditor({id:'doc',type:'document-block',children:[text]},{features:{verticalTabs:true,reversibleBlocks:true}});registerCoreViews(e);
 const view=e.createView('equivalence'),key=Object.values(view.state.nodes).find(n=>n.payload.id==='text')!.key;
 try{
  let expected:ExistingBlockDto;
  if(kind==='tabs'){e.tabs.run('tabs.create.vertical',key);expected=prepareTabs([{label:'Tab 1',content:[text]}],'vertical');}
  else if(kind==='pages'){blockMenuItems(e,key).find(item=>item.label==='Convert to page')!.run!();expected=prepareTabs([{label:'Page 1',content:[text]}],'horizontal',true);}
  else if(kind==='surface'){e.surfaces.run('surface.create',key);expected=prepareSurface([text],[blank]);}
  else{e.commands.ensureMargin(key,'left');e.commands.ensureMargin(key,'right');expected=attachMargins(text,[blank],[blank]);}
  expect(shape(e.encodeDocument().children![0])).toEqual(shape(expected));
 }finally{e.dispose();}
});
