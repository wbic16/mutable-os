import {expect,it,vi} from 'vitest';
import {capabilityCatalogue} from './capabilities';
import {responseSchema} from './provider-schema';
import {compositionLimits,capabilityLimits} from './limits';
import {registerDcpTypes} from './markup';
import {VisualEffectRegistry} from '../../../runtime/visual-effect-registry';
import {featureFlags} from '../../../configuration';
it('qualifies Stage 3B reference/embed discovery independently of managed resources and retained captures',()=>{
 const {editor}=fixture();Object.assign(editor.features,{dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage2Text:true,dcpNativeAuthoringStage2Layouts:true,dcpNativeAuthoringStage2Compounds:true,dcpNativeAuthoringStage2Widgets:true,dcpNativeAuthoringStage3ExternalMedia:true,documentInterchange:true,resourceUrlPaste:true,reversibleBlocks:true,timer:true,threeDObjects:true});
 const catalogue=capabilityCatalogue(editor);
 for(const id of ['media.external-image','media.video','media.embed']){
  const detail=catalogue.describe({ids:[id]});expect(detail.status).toBe('complete');expect(detail.items[0]).toMatchObject({authorable:true,availability:{resources:'validated-external-reference',resourceReadiness:'input-required'}});
  expect(JSON.stringify(detail.parameters)).not.toContain('source');expect(JSON.stringify(detail.parameters)).not.toContain('assetId');
 }
 expect(catalogue.describe({ids:['media.image']}).items[0].authorable).toBe(false);expect(catalogue.describe({ids:['media.retained-viewers']}).items[0].authorable).toBe(false);
 for(const item of catalogue.summary.items){const detail=catalogue.describe({ids:[item.id]});expect(detail.status,item.id).toBe('complete');expect(new TextEncoder().encode(JSON.stringify(detail)).length).toBeLessThanOrEqual(capabilityLimits.bytes);}
 editor.features.documentInterchange=false;editor.features.resourceUrlPaste=false;
 expect(capabilityCatalogue(editor).describe({ids:['media.video']}).items[0].authorable).toBe(false);expect(capabilityCatalogue(editor).describe({ids:['media.embed']}).items[0].authorable).toBe(false);
 editor.features.dcpNativeAuthoringStage3ExternalMedia=false;expect(capabilityCatalogue(editor).summary.items.some(i=>i.id==='media.external-image')).toBe(false);
});
it('advertises bounded Stage 3A binding independently of resource possession, with no acquisition route',()=>{
 const {editor}=fixture();Object.assign(editor.features,{dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage3ManagedImages:true,managedAssetClipboard:true});
 const catalogue=capabilityCatalogue(editor),detail=catalogue.describe({ids:['media.image']});
 expect(detail.status).toBe('complete');expect(detail.items[0]).toMatchObject({authorable:true,availability:{resources:'existing-managed-resource',resourceReadiness:'input-required'}});
 expect((detail.parameters.$defs.Image as any).required).toEqual(['id','kind','source','revision','alt']);
 expect(JSON.stringify(detail)).not.toContain('assetId');expect(JSON.stringify(detail)).not.toContain('cavernId');
 for(const item of catalogue.summary.items)expect(new TextEncoder().encode(JSON.stringify(catalogue.describe({ids:[item.id]}))).length).toBeLessThanOrEqual(capabilityLimits.bytes);
 editor.features.managedAssetClipboard=false;expect(capabilityCatalogue(editor).describe({ids:['media.image']}).items[0].authorable).toBe(false);
 editor.features.managedAssetClipboard=true;editor.features.dcpNativeAuthoringStage3ManagedImages=false;expect(capabilityCatalogue(editor).describe({ids:['media.image']}).items[0].authorable).toBe(false);
});

function fixture(semantics=true,missing=''){
 const visualEffects=new VisualEffectRegistry();registerDcpTypes(visualEffects,semantics);
 visualEffects.registerRenderer({name:'css-class',target:'cell-style',defaults:{},validate:()=>{},classes:()=>[]});
 if(missing!=='mutable/gloss')visualEffects.registerType({type:'mutable/gloss',renderers:[{id:'gloss-marker',name:'css-class',params:{classes:['mutable-gloss-anchor']}}]});
 const resolve=vi.fn((type:string)=>type===missing?undefined:{view:()=>null});
 const editor={features:{dialecticDcp:true,scopedSemantics:semantics},registry:{resolve},visualEffects} as any;
 return {editor,resolve,catalogue:capabilityCatalogue(editor)};
}
it('describes purpose and only complete authoring paths, regardless of available renderers',()=>{
 const {catalogue}=fixture();
 for(const id of ['composition.table','composition.group','source.anchor','semantic.gloss']){
  const result=catalogue.describe({ids:[id]});expect(result.status).toBe('complete');
  expect(result.items[0]).toMatchObject({id,authorable:true,availability:{constructor:true,renderer:true,providerAdapter:true,enabled:true}});
  expect(result.items[0].purpose.length).toBeGreaterThan(20);
 }
 for(const id of ['composition.card-grid','media.image','media.youtube','composition.markdown-fallback']){
  expect(catalogue.describe({ids:[id]}).items[0]).toMatchObject({authorable:false,availability:{renderer:true,constructor:false,providerAdapter:false}});
 }
 expect(catalogue.describe({ids:['future.magic']}).items[0]).toMatchObject({status:'unknown',authorable:false});
 expect(catalogue.describe({ids:['presentation.workspace']}).items[0]).toMatchObject({status:'presentation-only',authorable:false,availability:{constructor:false,renderer:'host-controlled'}});
 expect(catalogue.summary.items.every(item=>item.name&&item.purpose)).toBe(true);
 expect(featureFlags.dcpCapabilityCatalogue).toBe(true);
 expect(catalogue.summary.items.find(i=>i.id==='composition.markdown-fallback')?.status).toBe('unavailable');
});
it('derives parameter definitions from the negotiated schema, with resolvable shared references and admission limits',()=>{
 const {catalogue}=fixture();
 const result=catalogue.describe({ids:['composition.table','composition.group','source.anchor','semantic.gloss']});
 expect(result.status).toBe('complete');expect(result.omittedIds).toEqual([]);
 expect(result.parameters.$defs.Table).toEqual(responseSchema.$defs.Table);
 expect(result.parameters.$defs.Gloss).toEqual(responseSchema.$defs.Gloss);
 expect(result.items.find(i=>i.id==='composition.table')?.constraints).toMatchObject({maxRows:compositionLimits.tableRows,maxColumns:compositionLimits.tableColumns});
 const walk=(value:any)=>{if(!value||typeof value!=='object')return;if(value.$ref)expect(result.parameters.$defs[value.$ref.replace('#/$defs/','')]).toBeDefined();Object.values(value).forEach(walk);};
 walk(result.parameters);
});
it('bounds every individual detail and combined responses without rereading registries or native content',()=>{
 const {catalogue,resolve}=fixture();const reads=resolve.mock.calls.length;
 for(const {id} of catalogue.summary.items){
  const result=catalogue.describe({ids:[id]});expect(result.status,id).toBe('complete');expect(result.items,id).toHaveLength(1);
  expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThanOrEqual(capabilityLimits.bytes);
 }
 const result=catalogue.describe({ids:['composition.paragraph','composition.table','semantic.gloss','source.anchor']});
 expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThanOrEqual(capabilityLimits.bytes);
 expect(result.items.length+result.omittedIds.length).toBe(4);expect(resolve).toHaveBeenCalledTimes(reads);
 for(const ids of [[],['x','x'],['a','b','c','d','e'],['x'.repeat(65)],[null]])expect(()=>catalogue.describe({ids})).toThrow('Invalid capability');
 expect(()=>catalogue.describe({ids:['composition.table'],extra:true})).toThrow();
});
it('recomputes availability for each exchange and respects profile, feature and renderer prerequisites',()=>{
 expect(fixture(false).catalogue.describe({ids:['semantic.gloss']}).items[0].authorable).toBe(false);
 expect(fixture(true,'table-cell-block').catalogue.describe({ids:['composition.table']}).items[0]).toMatchObject({authorable:false,availability:{constructor:true,renderer:false}});
 expect(fixture(true,'mutable/gloss').catalogue.describe({ids:['semantic.gloss']}).items[0]).toMatchObject({authorable:false,availability:{constructor:true,renderer:false}});
 const {editor,catalogue}=fixture();editor.features.dialecticDcp=false;
 expect(catalogue.describe({ids:['composition.table']}).items[0].authorable).toBe(true);
 expect(capabilityCatalogue(editor).describe({ids:['composition.table']}).items[0].authorable).toBe(false);
});

it('discovers every Stage 1 projection within the existing budget and distinguishes external prerequisites',()=>{
 expect(featureFlags.dcpNativeAuthoringStage1).toBe(true);
 const {editor}=fixture();editor.features.dcpNativeAuthoringStage1=true;
 const catalogue=capabilityCatalogue(editor);
 for(const {id} of catalogue.summary.items){const detail=catalogue.describe({ids:[id]});expect(detail.status,id).toBe('complete');expect(detail.items,id).toHaveLength(1);expect(new TextEncoder().encode(JSON.stringify(detail)).length).toBeLessThanOrEqual(capabilityLimits.bytes);}
 for(const id of ['composition.heading','composition.card-grid','media.youtube','formatting.colour'])expect(catalogue.describe({ids:[id]}).items[0]).toMatchObject({authorable:true});
 expect(catalogue.describe({ids:['media.youtube']}).items[0]).toMatchObject({capabilityState:'authorable-with-prerequisites',availability:{resources:'validated-external-reference'}});
 expect(catalogue.describe({ids:['inspection.native']}).items[0]).toMatchObject({capabilityState:'readable',authorable:false});
 expect(catalogue.summary.items.find(i=>i.id==='media.youtube')).toMatchObject({state:'authorable-with-prerequisites'});
 expect(catalogue.describe({ids:['composition.markdown-fallback']}).items[0].authorable).toBe(false);
});

it('qualifies Stage 2 text descriptors, bounded recursive details and independent feature snapshots',()=>{
 expect(featureFlags.dcpNativeAuthoringStage2Text).toBe(true);
 const {editor}=fixture();Object.assign(editor.features,{dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage2Text:true,documentInterchange:true,standoffCodeHighlighting:true});
 const catalogue=capabilityCatalogue(editor);
 for(const {id} of catalogue.summary.items){const detail=catalogue.describe({ids:[id]});expect(detail.status,id).toBe('complete');expect(detail.items,id).toHaveLength(1);expect(new TextEncoder().encode(JSON.stringify(detail)).length).toBeLessThanOrEqual(capabilityLimits.bytes);}
 for(const id of ['composition.code','composition.source','configuration.text','formatting.core'])expect(catalogue.describe({ids:[id]}).items[0].authorable,id).toBe(true);
 expect(catalogue.describe({ids:['composition.card-grid']}).items[0].example.rows[0][0][0].textStyle).toBeNull();
 editor.features.documentInterchange=false;expect(capabilityCatalogue(editor).describe({ids:['composition.source']}).items[0].authorable).toBe(false);
 editor.features.standoffCodeHighlighting=false;expect(capabilityCatalogue(editor).describe({ids:['composition.code']}).items[0].authorable).toBe(false);
 editor.features.dcpNativeAuthoringStage2Text=false;
 const disabled=capabilityCatalogue(editor);expect(disabled.describe({ids:['composition.code']}).items[0].authorable).toBe(false);
 expect(disabled.describe({ids:['composition.paragraph']}).items[0].example).not.toHaveProperty('textStyle');
 expect(disabled.summary.items.some(i=>i.id==='formatting.core')).toBe(false);
});

it('keeps Stage 2B layout/task details bounded and separates native task prerequisites',()=>{
 expect(featureFlags.dcpNativeAuthoringStage2Layouts).toBe(true);
 const {editor}=fixture();Object.assign(editor.features,{dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage2Text:true,dcpNativeAuthoringStage2Layouts:true,taskLists:true,documentInterchange:true,standoffCodeHighlighting:true});
 const catalogue=capabilityCatalogue(editor);
 for(const {id} of catalogue.summary.items){const detail=catalogue.describe({ids:[id]});expect(detail.status,id).toBe('complete');expect(new TextEncoder().encode(JSON.stringify(detail)).length,id).toBeLessThanOrEqual(capabilityLimits.bytes);}
 for(const id of ['composition.list','composition.tasks','composition.table','composition.card-grid'])expect(catalogue.describe({ids:[id]}).items[0].authorable,id).toBe(true);
 editor.features.taskLists=false;expect(capabilityCatalogue(editor).describe({ids:['composition.tasks']}).items[0].authorable).toBe(false);
 editor.features.dcpNativeAuthoringStage2Layouts=false;expect(capabilityCatalogue(editor).describe({ids:['composition.tasks']}).items[0].status).toBe('unknown');
});

it('keeps Stage 2C discovery bounded and advertises only enabled native compound routes',()=>{
 expect(featureFlags.dcpNativeAuthoringStage2Compounds).toBe(true);
 const {editor}=fixture();Object.assign(editor.features,{dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage2Text:true,dcpNativeAuthoringStage2Layouts:true,dcpNativeAuthoringStage2Compounds:true,taskLists:true,reversibleBlocks:true,verticalTabs:true,documentInterchange:true,standoffCodeHighlighting:true});
 const catalogue=capabilityCatalogue(editor);
 for(const {id} of catalogue.summary.items){const detail=catalogue.describe({ids:[id]});expect(detail.status,id).toBe('complete');const walk=(v:any)=>{if(!v||typeof v!=='object')return;if(v.$ref){const name=v.$ref.slice('#/$defs/'.length);expect(detail.parameters.$defs[name]||(detail.parameters as any).externalDefinitions?.[name],name).toBeDefined();}Object.values(v).forEach(walk);};walk(detail.parameters.$defs);expect(new TextEncoder().encode(JSON.stringify(detail)).length,id).toBeLessThanOrEqual(capabilityLimits.bytes);}
 for(const id of ['composition.surface','composition.tabs','composition.pages','configuration.margins'])expect(catalogue.describe({ids:[id]}).items[0].authorable,id).toBe(true);
 editor.features.reversibleBlocks=false;expect(capabilityCatalogue(editor).describe({ids:['composition.surface']}).items[0].authorable).toBe(false);
 editor.features.dcpNativeAuthoringStage2Compounds=false;expect(capabilityCatalogue(editor).describe({ids:['composition.pages']}).items[0].status).toBe('unknown');
});

it('qualifies Stage 2D purpose, schema and native prerequisites within unchanged discovery bounds',()=>{
 expect(featureFlags.dcpNativeAuthoringStage2Widgets).toBe(true);
 const {editor}=fixture();Object.assign(editor.features,{dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage2Text:true,dcpNativeAuthoringStage2Layouts:true,dcpNativeAuthoringStage2Compounds:true,dcpNativeAuthoringStage2Widgets:true,timer:true,threeDObjects:true,reversibleBlocks:true,verticalTabs:true,taskLists:true});
 for(const compounds of [true,false]){
  editor.features.dcpNativeAuthoringStage2Compounds=compounds;const catalogue=capabilityCatalogue(editor);
  for(const {id} of catalogue.summary.items){const detail=catalogue.describe({ids:[id]});expect(detail.status,id).toBe('complete');expect(new TextEncoder().encode(JSON.stringify(detail)).length,id).toBeLessThanOrEqual(capabilityLimits.bytes);}
  for(const id of ['composition.sticky-note','widget.timer','widget.object3d','widget.canvas-preview'])expect(catalogue.describe({ids:[id]}).items[0].authorable,id).toBe(true);
 }
 editor.features.timer=false;expect(capabilityCatalogue(editor).describe({ids:['widget.timer']}).items[0].authorable).toBe(false);
 editor.features.threeDObjects=false;expect(capabilityCatalogue(editor).describe({ids:['widget.object3d']}).items[0].authorable).toBe(false);
 editor.features.dcpNativeAuthoringStage2Widgets=false;expect(capabilityCatalogue(editor).describe({ids:['composition.sticky-note']}).items[0].status).toBe('unknown');
});

it('qualifies bounded retained PDF discovery without exposing capture authority',()=>{
 expect(featureFlags.dcpNativeAuthoringStage3RetainedPdf).toBe(true);
 const {editor}=fixture();Object.assign(editor.features,{dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage3RetainedPdf:true,crossResourceLoaders:true,reversibleBlocks:true});
 const catalogue=capabilityCatalogue(editor),detail=catalogue.describe({ids:['media.retained-pdf']});expect(detail.status).toBe('complete');expect(detail.items[0]).toMatchObject({authorable:true,availability:{resources:'retained-capture',resourceReadiness:'input-required'}});
 expect((detail.parameters.$defs.RetainedPdf as any).required).toEqual(['id','kind','source','revision']);for(const word of ['snapshotId','assetId','cavernId','resourceId'])expect(JSON.stringify(detail.parameters)).not.toContain(word);
 for(const item of catalogue.summary.items)expect(new TextEncoder().encode(JSON.stringify(catalogue.describe({ids:[item.id]}))).length).toBeLessThanOrEqual(capabilityLimits.bytes);
 const missing=fixture(true,'resource-information-block').editor;Object.assign(missing.features,editor.features);expect(capabilityCatalogue(missing).describe({ids:['media.retained-pdf']}).items[0].authorable).toBe(false);
 editor.features.crossResourceLoaders=false;expect(capabilityCatalogue(editor).describe({ids:['media.retained-pdf']}).items[0].authorable).toBe(false);editor.features.dcpNativeAuthoringStage3RetainedPdf=false;expect(capabilityCatalogue(editor).summary.items.some(i=>i.id==='media.retained-pdf')).toBe(false);
});
