// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerApplicationViews} from '../application/features';
import {blockMenuItems} from '../runtime/block-menu-actions';
import {stickyNoteDto,prepareStickyNote,canvasPreviewDto} from './note-authoring';
import {timerBlockDto,timerDuration,timerDimensions} from '../features/timer/model';
import {objectDto,objectConfiguration} from '../features/three-d-object/model';
import type {ExistingBlockDto} from './types';
const shape=(n:ExistingBlockDto):any=>({type:n.type,text:n.text??'',metadata:n.metadata??{},timer:n.timer??null,object:n.object3D??null,properties:n.blockProperties??[],children:(n.children??[]).map(shape)});
it.each([['Insert Sticky Note Here',()=>stickyNoteDto()],['Timer',()=>timerBlockDto()],['3D Object — Coffee Cup',()=>objectDto()],['Canvas',()=>canvasPreviewDto()]] as const)('shares %s preparation with the actual native Add Block command',async(label,prepare)=>{
 const e=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'Original'}]});registerApplicationViews(e);const view=e.createView(),key=Object.values(view.state.nodes).find(n=>n.payload.id==='p')!.key;
 try{await blockMenuItems(e,key).find(i=>i.label==='Add Block')!.children!.find(i=>i.label===label)!.run!();expect(shape(e.encodeDocument().children![1])).toEqual(shape(prepare()));}finally{e.dispose();}
});
it('validates widget authoring without normalizing malformed or future settings into an approximation',()=>{
 const text={type:'standoff-editor-block',text:'x'};
 for(const size of [{width:199,height:200},{width:200,height:Infinity},{width:200,height:200,position:'fixed'}])expect(()=>prepareStickyNote([text],size)).toThrow();
 expect(()=>prepareStickyNote([],null)).toThrow();expect(prepareStickyNote([text],{width:200,height:160}).metadata).toMatchObject({size:{width:200,height:160}});
 for(const duration of [0,-1,1.5,86401,NaN,'30'])expect(()=>timerDuration(duration)).toThrow();expect(timerDuration(86400)).toBe(86400);expect(()=>timerDimensions({width:130,height:130,extra:true})).toThrow();
 const config={scene:'coffee-cup',view:{azimuth:0,elevation:10},lighting:'neutral',autoRotate:false,steam:true,coffeeStain:false,size:160};expect(objectConfiguration(config).size).toBe(160);
 for(const patch of [{scene:'unknown'},{lighting:'future'},{size:Infinity},{view:{azimuth:1,elevation:30,extra:true}},{autoRotate:1},{version:2}])expect(()=>objectConfiguration({...config,...patch})).toThrow();
});
