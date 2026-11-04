import type {DocumentApplicationPort} from '../../application/document-application-ports';
import type {BlockMenuItem} from '../../runtime/block-menu-types';
/** Evaluated on menu opening, never on a text-revision subscription. */
export function textualFileActions(port:DocumentApplicationPort,save:(as?:boolean)=>Promise<void>,create:()=>void):BlockMenuItem[]{
 const app=port.application,vault=app.vault,files=app.files,interchange=app.interchange;
 const run=(label:string,action:()=>unknown):BlockMenuItem=>({label,run:async()=>{await action();}});
 return [
  {label:'New Document…',disabled:!vault,run:create},
  {label:'Open Document',loadChildren:()=>app.documents().map(doc=>run(doc.title,()=>app.openDocument(doc.id)))},
  ...(app.recentDocuments?[{label:'Recent Documents',loadChildren:()=>app.recentDocuments!.items().map(doc=>run(doc.title,()=>app.recentDocuments!.open(doc.id)))}]:[]),
  {label:'Save Document',disabled:!files,run:()=>save()},
  {label:'Save as…',disabled:!port.saveAs,run:()=>save(true)},
  run('Close Document',()=>app.closeActiveTab()),
  ...(vault?[{label:'Vault',loadChildren:():BlockMenuItem[]=>[
   {label:'Open Vault…',input:{label:'Managed directory',value:vault.state()?.root??'.',submit:value=>vault.open(value)}},
   ...(vault.choose?[run('Choose Vault…',vault.choose)]:[]),run('Refresh',()=>vault.refresh()),...(vault.verify?[run('Verify',()=>vault.verify!())]:[]),
   {label:'Open saved Document',loadChildren:()=>vault.state()?.documents.map(doc=>run(doc.title,()=>vault.openFile(doc.location)))??[]},
   {label:'New directory…',input:{label:'Directory name',submit:value=>vault.createDirectory(vault.state()?.root??'.',value)}},
   run('Close Vault',()=>vault.close()),
  ]}]:[]),
  ...(app.properties()?[{label:'Rename Document…',input:{label:'Title',value:app.properties()!.title,submit:(value:string)=>app.renameDocument(app.properties()!.id,value)}}]:[]),
  ...(interchange?[
   {label:'Import',children:[run('Files…',interchange.importFiles),run('Package…',interchange.importPackage),run('Inspect package…',interchange.inspectPackage),run('Collection…',interchange.importCollection)]},
   {label:'Export',children:[...(['html','markdown','text'] as const).map(format=>run(format.toUpperCase(),()=>interchange.exportDocument(format))),run('Portable HTML',()=>interchange.exportPortable('html',true)),run('Portable Markdown',()=>interchange.exportPortable('markdown')),run('Package…',interchange.exportPackage),run('Collection…',interchange.exportCollection),run('Download viewer',interchange.downloadViewer)]},
  ]:[]),
  ...(app.publish?[run('Publish…',app.publish)]:[]),
  ...(files?[{label:'Storage',children:[run('Retry / recover',()=>{const location=files.location();if(!location)throw Error('No saved Document selected.');return files.recover(location);}),run('Keep Mutable',()=>files.keepMutable())]}]:[]),
 ];
}
