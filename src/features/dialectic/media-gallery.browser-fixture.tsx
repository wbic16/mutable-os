import {semanticsWorkspaceFixture} from './semantics-workspace.browser-fixture';
/** Real Dialectic tabs and native image blocks; local images and no external API. */
export async function mediaGalleryFixture(){
 await semanticsWorkspaceFixture();const f=(window as any).semanticsFixture,{editor,port}=f,view=port.session().projection,root=view.node(port.session().rootKey);
 const images=[['snow-aurora','Northern lights over snow'],['clouds','Cloud study'],['green-aurora','A sky in motion'],['wood','Warm textures'],['nebula','Colours of the cosmos']];
 editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'ai',participant:{id:'gallery',kind:'ai',name:'Research assistant'},ordinal:2,replies:[]}},children:images.map(([file,alt])=>({id:crypto.randomUUID(),type:'image-block',metadata:{url:location.origin+'/src/assets/hosted/backgrounds/images/'+file+'.jpg',alt}}))},{kind:'at',parentKey:root.key,index:1});
 f.tab('Media').click();return {images:images.length,revision:editor.repository.state.revision};
}
