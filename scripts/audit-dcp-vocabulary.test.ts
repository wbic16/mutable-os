// @vitest-environment jsdom
/** Documentation audit only. Never imported by the application. */
import {it, expect, vi} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import ts from 'typescript';
import {ReactiveEditor} from '../src/reactive-editor/editor';
import {registerApplicationViews} from '../src/application/features';
import {standoffStyleSchemas} from '../src/rendering/standoff-styles';
import {annotationTools} from '../src/rendering/document-style-bar';
import {legend, annotation, classifications} from '../src/features/dialectic/dcp/markup';
import {request, prepare} from '../src/features/dialectic/dcp/exchange';
import {responseSchema} from '../src/features/dialectic/dcp/provider-schema';
import {providerTools, liveLimits} from '../src/features/dialectic/dcp/provider-contract';
import {sourceOperationInstructions} from '../src/features/dialectic/dcp/authoring';
import {capabilityCatalogue} from '../src/features/dialectic/dcp/capabilities';
import {compositionLimits, capabilityLimits} from '../src/features/dialectic/dcp/limits';
import {NAME_TYPES, DESCRIPTION_TYPES} from '../src/features/cardex/validation.mjs';
import {ATTRIBUTES, TAG} from '../src/features/phosphor/model';
import {createCanvasCounterFeature} from '../src/features/canvas-counter';
import {blockFeatureCapabilities} from '../src/application/feature-capabilities';
import {DcpSources} from '../src/features/dialectic/dcp/sources';
import {defaultParticipant} from '../src/features/dialectic/model';

const root='docs/development/DCP_CANONICAL_VOCABULARY';
const read=(path:string)=>readFileSync(path,'utf8');
const ast=(path:string)=>ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
const walk=(node:ts.Node,visit:(node:ts.Node)=>void)=>{visit(node);node.forEachChild(child=>walk(child,visit));};
function literal(node:ts.Node):any {
 if(ts.isAsExpression(node)||ts.isParenthesizedExpression(node))return literal(node.expression);
 if(ts.isStringLiteralLike(node))return node.text;
 if(ts.isNumericLiteral(node))return Number(node.text);
 if(node.kind===ts.SyntaxKind.TrueKeyword)return true;if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
 if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.MinusToken)return -literal(node.operand);
 if(ts.isArrayLiteralExpression(node))return node.elements.map(literal);
 if(ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.map(p=>{if(!ts.isPropertyAssignment(p))throw Error('Nonliteral audit input');return [ts.isIdentifier(p.name)?p.name.text:literal(p.name),literal(p.initializer)];}));
 throw Error('Nonliteral audit input: '+node.getText().slice(0,80));
}
function constant(path:string,name:string){let value:any;walk(ast(path),n=>{if(ts.isVariableDeclaration(n)&&n.name.getText()===name&&n.initializer)value=literal(n.initializer);});expect(value,`${path}#${name}`).toBeDefined();return value;}
const appearanceSource='src/rendering/appearance.ts';
function appearanceCases(){const values:string[]=[];walk(ast(appearanceSource),n=>{if(ts.isCaseClause(n)&&ts.isStringLiteral(n.expression))values.push(n.expression.text);});return values.sort();}
function effectParameters(){
 const result:Record<string,any[]>={};
 for(const source of ['src/rendering/standoff-styles.ts','src/rendering/standoff-editor-view.tsx'])walk(ast(source),n=>{
  if(!ts.isCaseClause(n)||!ts.isStringLiteral(n.expression))return;
  const params:any[]=[];walk(n,child=>{if(ts.isCallExpression(child)&&child.expression.getText()==='parameter'&&child.arguments.length===5){const [,name,fallback,min,max]=child.arguments;params.push({name:literal(name),type:'number (Number coercion)',default:literal(fallback),minimum:literal(min),maximum:literal(max),validation:'renderer clamp, not an authoring admission schema',source});}});
  if(params.length)(result[n.expression.text]??=[]).push(...params);
 });
 for(const type of ['style/glow','style/chromatic-aberration'])(result[type]??=[]).push({name:'intensity',type:'number (Number coercion)',default:.35,minimum:0,maximum:1,validation:'renderer clamp',source:'src/rendering/standoff-styles.ts'});
 return result;
}
const provenance={version:1 as const,actor:'ai' as const,exchangeId:'AUDIT',protocol:'dcp/1.0' as const,sourceResourceId:'AUDIT_DOCUMENT'};

// Reviewed evidence, not an application registry. Runtime keys determine coverage.
const blockSources:Record<string,string>={
 'mutable/svg-text-composition-block':'src/application/quill-operations.ts', 'standoff-editor-block':'src/runtime/markdown-input.ts', 'container-block':'src/runtime/block-menu-actions.ts',
 'indented-list-block':'src/runtime/text-lists.ts', 'checkbox-block':'src/runtime/tasks.ts',
 'horizontal-line-block':'src/runtime/markdown-input.ts', 'standoff-code-block':'src/runtime/standoff-code.ts',
 'sticky-note-block':'src/runtime/sticky-notes.ts', 'phosphor-screen-block':'src/features/phosphor/model.ts',
 'timer-block':'src/features/timer/model.ts','3d-object-block':'src/features/three-d-object/model.ts',
 'canvas-counter-block':'src/features/canvas-counter/index.tsx','mutable/video-block':'src/interchange/resource-url.ts',
 'mutable/pdf-document-block':'src/pdf/block.ts','mutable/iiif-image-block':'src/iiif/block.ts','mutable/iiif-manifest-block':'src/iiif/block.ts',
 'mutable/web-article-block':'src/interchange/web-article-block.ts','mutable/citation-block':'src/interchange/citation-block.ts',
 'mutable/academic-resource-block':'src/academic/block.ts','mutable/web-resource-block':'src/web-resources/block.ts','mutable/structured-resource-block':'src/structured/model.ts',
};
const core='src/rendering/register-core-views.ts';
const registrationSources:Record<string,string>={quill:'src/application/quill.tsx',legacy:core,cardex:'src/application/cardex.tsx',thesis:'src/application/thesis.tsx',dialectic:'src/features/dialectic/index.tsx',phosphor:'src/application/phosphor.tsx',flint:'src/features/flint/index.tsx','desktop-placeholders':'src/application/desktop-applications.tsx',timer:'src/features/timer/index.tsx','three-d-object':'src/features/three-d-object/index.tsx','canvas-counter':'src/features/canvas-counter/index.tsx'};
const structural=new Set('table-row-block table-cell-block grid-row-block grid-cell-block side-block tab-block document-tab-block document-tab-row-block sticky-tab-block fixed-size-page-block left-margin-block right-margin-block page-block'.split(' '));
const compatibility=new Set('book-block plain-text-block html-block html-editor-block pdf-block embed-document-block entities-list-block control-panel-block monitor-block'.split(' '));
const generated=new Set('root-block universe-block context-menu-block error-block unknown-block cyclic-reference document-reference-block mutable/opaque-block workspace-object-bank-block resource-information-block'.split(' '));
const host=new Set('quill-application-block document-block workspace-block window-block document-window-block image-background-block video-background-block youtube-video-background-block canvas-background-block flint-application-block dialectic-application-block cardex-application-block thesis-application-block desktop-application-placeholder-block'.split(' '));
const blockRoutes:Record<string,{schema:string;syntax:string;catalogue:string}>={
 'standoff-editor-block':{schema:'Paragraph',syntax:'composition[].{id,kind:"paragraph",markup,ranges}',catalogue:'composition.paragraph'},
 'container-block':{schema:'Group',syntax:'composition[].{id,kind:"group",children}; also generated list item container',catalogue:'composition.group'},
 'indented-list-block':{schema:'List',syntax:'composition[].{id,kind:"list",style:"bullet"|"ordered",items:[[Node]]}',catalogue:'composition.list'},
 'table-block':{schema:'Table',syntax:'composition[].{id,kind:"table",rows:[[[Node]]]}',catalogue:'composition.table'},
 'table-row-block':{schema:'Table',syntax:'generated by each composition table rows[] entry; no row ID declaration',catalogue:'composition.table'},
 'table-cell-block':{schema:'Table',syntax:'generated by each rows[][] cell; no cell ID declaration',catalogue:'composition.table'},
};
function blockEvidence(type:string){
 const rows=read('docs/development/DCP_NATIVE_AUTHORING_PARITY_INVESTIGATION.md').split('\n').filter(l=>l.startsWith('| `')&&l.split('|')[1].includes('`'+type+'`'));
 expect(rows.length,`Missing reviewed native authoring evidence: ${type}`).toBeGreaterThan(0);
 const cells=rows[0].split('|').slice(1,-1).map(x=>x.trim());
 return {operation:cells[1],constraints:cells.length>=3?cells[2]:cells[1],gap:cells.at(-1)};
}
const nice=(type:string)=>type.replace(/^mutable\//,'').replace(/-block$/,'').replaceAll('-',' ').replaceAll('/',' / ');
const nativeInputs:Record<string,[string,string]>={
 'standoff-editor-block':['Text or empty text; a valid native text destination','text default empty; standoffProperties, blockProperties and owned text relations only through native operations'],
 'container-block':['Child selection for grouping; common parent and contiguity','Fresh content children; metadata.structuralContainer and pocket height where applicable'],
 'code-mirror-block':['Valid content destination','text defaults empty; current textarea renderer'],
 'standoff-code-block':['Valid content destination; builder supplies native text child','language defaults javascript, stored in metadata.markdownCode.language'],
 'canvas-block':['Valid menu insertion target','Factory children empty; current preview only'],
 'horizontal-line-block':['Valid insertion target / Markdown rule trigger','No user parameters; native leaf'],
 'image-block':['URL validated by mediaUrl for Add Image; managed asset/capture for the distinct import route','Native metadata.url or importer src/alt/dimensions/asset binding; no arbitrary acquisition claims'],
 'youtube-video-block':['youtubeId-valid URL or 11-character ID','metadata.url'],
 'iframe-block':['resourceUrl-valid HTTP(S) reference','Resource embed title/height metadata from native builder'],
 'youtube-player-block':['Strict provider reference accepted by resourceBlock/passiveVideo','Native video descriptor emitted by URI parser'],
 'vimeo-player-block':['Strict provider reference accepted by resourceBlock/passiveVideo','Native video descriptor emitted by URI parser'],
 'indented-list-block':['Native item children; valid list destination/selection','metadata.htmlList ordered/start/reversed; task state and item.value via native operations'],
 'checkbox-block':['Valid task destination; native compound content when applicable','checked:boolean default false'],
 'tab-row-block':['Native tab children / selected content for conversion','metadata.orientation horizontal|vertical'],
 'tab-block':['Parent TabRow and owned content','metadata.name/text label; native activation handled separately'],
 'surface-block':['Valid native source/content for Surface preparation','Builder supplies front/back Side children; no arbitrary trusted provenance'],
 'side-block':['Owning Surface operation','metadata.surfaceRole front|back and owned content'],
 'sticky-note-block':['Insertion target or permitted floating-note host','text default empty; colour yellow/material paper/overflowMode scroll/fontStep0; native size defaults'],
 'timer-block':['Permitted insertion target','timerBlockDto(position?); duration default300 seconds; mode idle; remainingMilliseconds300000; size130,min110'],
 '3d-object-block':['Permitted insertion target','objectDto(); version1 coffee-cup scene; native view/settings defaults; width280'],
 'canvas-counter-block':['Canvas/widget host context and canvasWorkspace feature','count default0'],
 'phosphor-screen-block':['Phosphor Document/owner context and model-valid text','ScreenSettings defaults defined in model; owned standoff-editor-block child'],
};
function sourceContracts(){
 const refs:Record<string,string[]>={
  'src/block-tree/types.ts':['BlockTypeRegistration'],
  'src/runtime/visual-effect-registry.ts':['PropertyTypeDefinition','SemanticAuthoringDescriptor'],
  'src/rendering/standoff-styles.ts':['StandoffStyleSchema'],
  'src/features/timer/model.ts':['TimerPayload','TimerMode'],
  'src/features/three-d-object/model.ts':['ObjectState','ViewAngles','Lighting'],
  'src/features/phosphor/model.ts':['ScreenSettings'],
  'src/interchange/source-block.ts':['SourceFormat'],
  'src/feature-api/scoped-entities.ts':['ScopedEntityReference'],
  'src/features/document-formats/model.ts':['DocumentFormatMetadata'],
  'src/pdf/model.ts':['PdfCapture','PdfAnchor'],
  'src/iiif/model.ts':['Capture','Manifest','ImageInfo'],
  'src/iiif/resource-anchor.ts':['ResourceAnchor','ResourceAnnotation'],
  'src/academic/anchors.ts':['AcademicAnchor'],
  'src/academic/model.ts':['AcademicCapture'],
  'src/web-resources/model.ts':['WebCapture'],
 };
 const result:any[]=[];for(const [path,names]of Object.entries(refs))for(const name of names){let declaration='';walk(ast(path),n=>{if((ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n))&&n.name.text===name)declaration=n.getText();});expect(declaration,path+'#'+name).not.toBe('');result.push({ref:path+'#'+name,language:'TypeScript (not JSON Schema; runtime validators remain authoritative)',declaration});}return result;
}

const propertyNotes:Record<string,[string,string,string,string]>={
 'block/rotate':['value:number|string','0 degrees; renderer interpolates without finite-number admission','Existing/legacy payload; no normal style-bar rotation control','src/rendering/appearance.ts'],
 'block/alignment':['value:string','left default; UI left|center|right|justify; renderer casts other strings','Style bar blockStyle','src/rendering/document-style-bar.tsx'],
 'block/font/size':['value:string','normal default; h1–h6,normal,three-quarters,half or raw CSS fallback','Style bar H1–H4 and size picker; Markdown headings H1–H6','src/rendering/document-style-bar.tsx'],
 'block/indent':['value:number|string','Number(value??0) ×20px; UI clamps indentation to >=0','Style bar indent/outdent','src/rendering/document-style-bar.tsx'],
 'block/size':['metadata:{width?,height?,"min-width"?}:number|string','Numbers become px; absent dimensions unset; overflow:auto','Widget resize/native size operations','src/rendering/appearance.ts'],
 'block/position':['metadata:{position?:string,x?:number|string,y?:number|string}','position:absolute default; absent x/y unset','Widget/workspace positioning','src/rendering/appearance.ts'],
 'block/margin':['metadata:{top?,right?,bottom?,left?}:number|string','Absent values unset; numbers become px','Native/imported payload; no generic four-side editor control found','src/rendering/appearance.ts'],
 'codex/entity-reference':['value:Entity ID; metadata:{entityName?,sourceSnapshotId?,...}','No default; retained Entity/capture identity required','Generated by resource factories, not the text Entity picker','src/pdf/block.ts'],
 'mutable/resource-annotation':['value:string; anchor:PdfAnchor|ResourceAnchor; metadata:{origin,createdAt}','PDF/IIIF anchor validated; UI note capped at 4000 chars','PDF page and IIIF spatial annotation controls','src/rendering/pdf-block-view.tsx'],
 'mutable/academic-annotation':['value:nonempty string; anchor:AcademicAnchor','validAcademicAnchor; anchor snapshot must match capture','Academic resource note controls','src/rendering/academic-resource-view.tsx'],
 'mutable/opaque-block-property':['original:{type,data,target?}','Bounded passive import preservation; never revive original type','Generated import preservation; not a direct authoring control','src/interchange/materialize.ts'],
};
const metadataNotes:Array<[string,string,string,string,string,string]>= [
 ['metadata.markdownCode.language','standoff-code-block','string; default javascript; js/javascript,ts/typescript,md/markdown highlighted; others literal','Add Standoff Code / source import','src/runtime/standoff-code.ts','none'],
 ['checked','checkbox-block,standoff-editor-block,container-block','boolean; absent means non-task except checkbox default false','Task commands / checkbox / Markdown input','src/runtime/tasks.ts','none'],
 ['metadata.htmlList','indented-list-block','{ordered:boolean,start:number,reversed:boolean}; DCP fixes start=1,reversed=false','List commands / HTML import','src/runtime/text-lists.ts','list.style only'],
 ['metadata.htmlListItem','container-block','{value?:integer}; checked is a separate payload field','List builders / HTML import','src/interchange/html-import.ts','generated empty object only'],
 ['metadata.htmlTableCell','table-cell-block','{header:boolean,colSpan:number,rowSpan:number}; retained spans are not reapplied on export; table operations reject nonunit spans','HTML import','src/interchange/html-import.ts','none'],
 ['metadata.htmlHeadingLevel','standoff-editor-block','Imported heading level 1–6; appearance also uses block/font/size','HTML import','src/interchange/html-import.ts','none'],
 ['metadata.htmlPreformatted','standoff-editor-block','boolean; whitespace preservation','HTML import','src/interchange/html-import.ts','none'],
 ['metadata.orientation','tab-row-block,document-tab-row-block','horizontal|vertical; default horizontal','Tab orientation command','src/runtime/tab-orientation.ts','none'],
 ['metadata.name / metadata.text / metadata.active','tab-block,document-tab-block,sticky-tab-block','Tab labels and legacy active metadata; live activation separately uses viewChildren','Tab menu / rename / import','src/runtime/tab-commands.ts','none'],
 ['metadata.surfaceRole','side-block','front|back; role owned by Surface builder','Reverse / Surface operations','src/runtime/block-surfaces.ts','none'],
 ['metadata.structuralContainer','container-block','boolean structural-container marker','Group operation','src/features/grouping/index.tsx','none'],
 ['metadata.height','container-block','Pocket height; UI 1–10000 px','Container pocket sizing','src/rendering/container-block-view.tsx','none'],
 ['metadata.listCollapsed','container-block,standoff-editor-block','boolean persisted disclosure state; distinct from checked','List disclosure control','src/runtime/text-lists.ts','none'],
 ['metadata.colour / material / overflowMode / fontStep / size','sticky-note-block','Defaults yellow,paper,scroll,0; fontStep display clamps -3..5; size default280×280,min200×160','Sticky note controls','src/rendering/sticky-note.tsx','none'],
 ['timer','timer-block','Versioned TimerPayload; duration 1–86400 sec; idle/running/paused and timestamps/remaining state','Timer factory and controls','src/features/timer/model.ts','none'],
 ['object3D','3d-object-block','Versioned scene/view settings; registered coffee-cup; angles,lighting,autoRotate,steam/stain; size160–640','3D factory and controls','src/features/three-d-object/model.ts','none'],
 ['count','canvas-counter-block','number default0; increments/decrements via native runtime','Counter controls (canvasWorkspace)','src/features/canvas-counter/index.tsx','none'],
 ['sourceFormat / text','mutable/markdown-source-block,mutable/html-source-block','{version:1,format:markdown|html,profile:mutable-<format>-source-v1}; exact text string','Source factory / editor / link import','src/interchange/source-block.ts','none'],
 ['video','mutable/video-block,youtube-player-block,vimeo-player-block','PassiveVideo discriminated provider/id/URL; strict provider URL validation','Resource URL import','src/interchange/uri.ts','none'],
 ['metadata.url / resource binding','image-block,iframe-block,youtube-video-block','URL/ID according to specific menu/import route; managed assets require verified Cavern/hash/MIME; no unified schema','Media creation/import','src/interchange/resource-url.ts','none'],
 ['pdf / iiif / article / citation / academic / web / structured','resource-backed Blocks','Versioned retained capture/original/presentation payloads; refer to each native binder; not arbitrary trusted JSON','Native acquisition or bind/import paths','src/runtime/document-interchange.ts','none'],
 ['phosphor','phosphor-screen-block','ScreenSettings: columns40|80,rows24,scroll,layout spatial|prose,tab4|8,glyphEncoding; model validation','New Phosphor and screen controls','src/features/phosphor/model.ts','none'],
 ['metadata.documentFormat','document-block','{version:1,format,template,theme}; format page|simple|sticky-note|journal|diary|letter|card|notebook|framed','New Document format','src/features/document-formats/model.ts','none'],
 ['metadata.width / tableColumns','grid-cell-block,table-cell-block,table-block','Grid merge width:auto; table layout metadata is operation-owned, no generic property schema','Grid merge / table operations','src/runtime/tables.ts','none'],
 ['metadata.position / size / state / title / zIndex','window-block,document-window-block','Host-owned geometry/lifecycle; no arbitrary nested-window authoring','Window manager','src/rendering/window-manager.tsx','none'],
 ['viewChildren / active side / caret / selection / hover / renderer buffers','session/occurrence only','Transient UI state; not a persistent Block property and not an authoring parameter','Local view/presentation services','src/reactive-editor/editor.ts','none'],
];

const standoffSources:Record<string,string>={
 'style/character-surface':'src/rendering/static-character-surface.ts','mutable/opaque-property':'src/rendering/visual-effect-renderers.tsx',
 'mutable/gloss':'src/features/gloss/controller.ts','codex/entity-reference':'src/features/entity-references/index.tsx',
 'mutable/entity-reference':'src/features/dialectic/dcp/markup.ts','dialectic/range-anchor':'src/features/dialectic/index.tsx',
 'text/superposition':'src/runtime/text-superposition.ts',
};
const specialised:Record<string,[string,string,string]>={
 'style/character-surface':['metadata.renderer default static-capital; width,height default48,16..128; Initialis version/settings schema in src/features/initialis/preset.json, validateInitialis','Initialis command when enabled; one character surface; renderer unavailable preserves data','interactive'],
 'mutable/gloss':['annotationId resolves mutable/gloss definition; value type:text, metadata.gloss version/localId/links; DCP type nonempty<=128,no colon; text nonempty<=8192','Gloss create/edit commands; owned independent definition, nonempty range','semantic'],
 'codex/entity-reference':['value: existing vault Entity ID; metadata optional; native Entity picker checks scope','Entity picker; Phosphor also supports this type in its own model','semantic'],
 'mutable/entity-reference':['metadata.entityReference: typed document/vault Entity; DCP ref must resolve via semantic.mark','Native scoped Entity service; no separate style-bar button found','semantic'],
 'dialectic/range-anchor':['annotationId: owned native range definition; metadata.dialecticRange {version:1,excerpt,source:{resourceId,blockId}}','Native range operations; host-generated infrastructure','structural'],
 'dialectic/unknown-semantic':['metadata.unknownSemantic:{type,attributes}; metadata.dcp provenance','Generated preservation only; not direct authorable semantic type','semantic'],
 'mutable/opaque-property':['original:{type,data,target?}; bounded preservation; no revival','Import-generated inert property','presentational'],
 'text/superposition':['alternatives:string[] of superposition:<id> owned relations; active:source|relation; visible:boolean','Experimental textSuperposition flag; range may not overlap another alternative reading','interactive'],
 'reference/url':['value:string URL; safeUrl during import/Cardex; renderer itself is style-only','Link import/Cardex description; no general toolbar URL picker found','interactive'],
 'cell/micro-document':['Legacy embedded-document payload; no current authoring schema','Deferred compatibility; no current creation operation found','structural'],
 'animation/clock':['Legacy animation payload; no current authoring schema','Deferred compatibility; no current creation operation found','presentational'],
};

const envelope=(composition:any[],fields:Record<string,unknown>={})=>({protocol:'dcp/1.0',kind:'contribution',exchange:'AUDIT',intent:'reply',replyTargets:[],composition,anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[],...fields});
const paragraph=(id:number,markup='Native text')=>({id:`new:b${id}`,kind:'paragraph',markup,ranges:[]});
const wireExamples={
 composition:envelope([paragraph(1,'<annotation type="style/bold">Evidence</annotation> &amp; commentary.'),{id:'new:b2',kind:'group',children:[paragraph(3)]},{id:'new:b4',kind:'list',style:'ordered',items:[[paragraph(5)]]},{id:'new:b6',kind:'table',rows:[[[paragraph(7)],[paragraph(8)]]]}]),
 overlapping:envelope([{...paragraph(1,'<boundary id="new:pos1"/>Alpha <boundary id="new:pos2"/>beta<boundary id="new:pos3"/> gamma<boundary id="new:pos4"/>'),ranges:[{id:'new:s1',type:'style/bold',from:'new:pos1',to:'new:pos3',ref:null,attributes:[]},{id:'new:s2',type:'dialectic/claim',from:'new:pos2',to:'new:pos4',ref:null,attributes:[]}]}]),
 semantics:envelope([paragraph(1,'<annotation type="dialectic/claim" id="new:s1">Weather matters.</annotation> <annotation type="dialectic/suggestion" id="new:s2">Plan indoors.</annotation> <annotation type="mutable/entity-reference" ref="new:e1">Rain</annotation>')],{
  entities:[{id:'new:e1',name:'Rain',typename:'Concept',description:'Precipitation',aliases:[]},{id:'new:e2',name:'Weather',typename:'Concept',description:'Atmospheric conditions',aliases:[]}],
  arguments:[{id:'new:arg1',anchor:'new:s1'},{id:'new:arg2',anchor:'new:s2'}],glosses:[{id:'new:g1',target:'new:s1',type:'Explanation',text:'Weather affects the choice of venue.'}],
  relations:[{id:'new:rel1',kind:'argument',type:'supports',from:'new:arg1',to:'new:arg2'},{id:'new:rel2',kind:'entity',type:'is part of',from:'new:e1',to:'new:e2'}],
 }),
};
function schemaRef(name:string|null){return name?`src/features/dialectic/dcp/provider-schema.ts#/$defs/${name}`:null;}
const table=(headers:string[],rows:any[][])=>['| '+headers.join(' | ')+' |','| '+headers.map(()=>'---').join(' | ')+' |',...rows.map(row=>'| '+row.map(v=>String(v??'—').replaceAll('|','\\|').replaceAll('\n',' ')).join(' | ')+' |')].join('\n');
const json=(value:unknown)=>JSON.stringify(value,null,2);
const code=(value:unknown)=>'```json\n'+json(value)+'\n```';
function markdownDocument(data:any){
 const {blocks,blockProperties,configuration,standoffProperties,wire}=data;
 const short=(v:unknown)=>{const text=String(v??'—').replaceAll('**','');return text.length>115?text.slice(0,112)+'…':text;};
 const matrix=[...blocks.map((b:any)=>[b.id,b.humanAuthoring,b.dcp.advertised,b.dcp.discoverable,b.dcp.authorable,b.dcp.missingIntegration]),...blockProperties.map((p:any)=>[p.id+' (Block property)',p.humanAuthoring,p.dcp.advertised,p.dcp.discoverable,p.dcp.authorable,p.dcp.missingIntegration]),...configuration.map((p:any)=>[p.id,p.humanAuthoring,p.dcp.advertised,p.dcp.discoverable,p.dcp.authorable,p.dcp.missingIntegration]),...standoffProperties.map((p:any)=>[p.id+' (standoff)',p.humanAuthoring,p.dcp.advertised,p.dcp.discoverable,p.dcp.authorable,p.dcp.missingIntegration])];
 return `# Canonical DCP Block and property vocabulary audit

Documentation-only audit, 9 November 2026. Generated by [audit-dcp-vocabulary.test.ts](../../scripts/audit-dcp-vocabulary.test.ts). The companion [JSON inventory](DCP_CANONICAL_VOCABULARY.json) includes actual registration data, schema references, per-type availability, the complete provider schema, tool schemas, initial instructions and catalogue results. No runtime registration, DCP contract or authoring behaviour is changed.

## Findings and scope

The native authoring vocabulary is broader than the DCP contract in all three categories. There are **${blocks.length} registered Block types** in the audited union (${data.coverage.defaultBlockCount} in the default application assembly plus the optional Canvas counter), **${blockProperties.length} Block property types** found in current reactive appearance/resource/import paths, and **${standoffProperties.length} standoff type identifiers**, including scoped Cardex/Phosphor and the experimental superposition model. Two Block aliases and two standoff aliases are recorded separately, not counted as distinct canonical types.

DCP returns only four composition kinds: paragraph, group, list and table. Those materialise six native Block types, including generated table rows/cells. Its initial inline legend has **${wire.initial.legend.types.length} types**: bold, italics, underline, six Dialectic classifications and the scoped Entity reference. Glosses and range anchors use separate native operations. It has **no general Block-property or configuration authoring field**. List ordering is a narrow implemented exception through list.style; start/reversed and item metadata are generated defaults.

This is a source audit plus deterministic host checks, not a live-model or browser qualification. Registration sets, aliases, renderer descriptors, toolbar types, style defaults/clamps, appearance switch cases, provider schemas and catalogue details are extracted mechanically. Human routes and domain requirements are reviewed evidence linked to native source files. There is no exhaustive central metadata schema: configuration rows cover the current behaviours relevant to authoring, and do not claim that arbitrary payload keys have been enumerated. Legacy src/blocks, src/properties and original-editor registrations are not counted as active reactive support. In particular block/draggable in the old Block-property registry is not a current reactive registration.

Availability is context-dependent. The runtime profile uses application defaults, with nativeKnowledge/sqliteKnowledge/flintProbe disabled only to avoid unrelated background services. Canvas counter registration is inspected separately; its default-off status is retained. Cardex name types are local-field registrations, Phosphor attributes are specialised model vocabulary, and text/superposition remains experimental/default-off. Existing-content restoration/copy is not evidence of a fresh constructor. Missing DCP support is separate from missing managed resources, feature flags, owner context or consent.

## Authoritative sources and architectural recommendation

* **Blocks:** src/block-tree/registry.ts and BlockTypeRegistration in src/block-tree/types.ts; current application assembly in src/application/features.ts and src/rendering/register-core-views.ts. Registrations provide type, view, capabilities, optional parameterless create and slots. Most core factories are in menus, commands and domain services; a renderer registration is not a constructor schema.
* **Block properties:** src/rendering/appearance.ts plus native commands, resource anchors and import materialisation. There is no current central reactive Block-property registration contract. CSS conversion/clamping is not canonical authoring admission. Metadata/payload configuration is not a Block-property type, even when it controls similar behaviour.
* **Standoff properties:** standoffStyleSchemas, VisualEffectRegistry PropertyTypeDefinition, feature-local registrations and specialised models. SemanticAuthoringDescriptor offers an AI policy and a string list of attributes, but no complete typed attribute/target/range/ownership schema. Renderer parameter validation is distinct from annotation authoring validation. AnnotationContributions describes UI actions, not a complete native property contract.

**Extend the proposed shared native authoring contract to coordinate Block creation, Block-property mutation and standoff-property operations.** Keep each descriptor beside its existing native operation/registration and reuse canonical admission; do not create three DCP registries. They need common purpose, eligibility, schema, ownership/resource, preparation and lifecycle conventions, while preserving their different operations: graph creation, bounded Block configuration and range/definition updates.

Before Stage 1, close these design gaps: (1) declare fresh creation versus generated/clone/host-only routes; (2) specify real native configuration and annotation input schemas rather than exposing arbitrary DTO/metadata JSON; (3) separate renderer parameters from accepted authored values; (4) declare text targets, overlap policy, child/owned-relation slots and definition/resource binding; (5) derive catalogue/provider descriptors from those native operations and preserve explicit missing-route records; (6) qualify ownership, immutable submitted text, current source authority, atomic admission and bounded-work behaviour using the existing services. This audit supplies coverage evidence, not implementation approval or proof that those contracts already exist.

## Native Block inventory

All native construction requires host identities, canonical graph/ownership admission and a permitted destination. Resource-backed rows require their native URI/managed-resource/capture validators. Required and optional domain inputs are described from the actual operation; where no parameter schema exists, the JSON explicitly records null rather than inventing one. JSON.nativeSourceContracts mechanically extracts the available TypeScript contracts (including widget, resource anchor/capture and registration types); these are source references, not newly implemented JSON Schemas. Registry slots below are declarations, not a proof of all child constraints. Most registrations declare no slots: domain services and canonical structure still constrain children.

${blocks.map((b:any)=>`### ${b.id}

${b.name} (${b.classification}).

* Registration: [${b.registration.source}](../../${b.registration.source}); owner ${b.registration.owner}; parameterless registry factory: ${b.registration.hasCreate}; aliases: ${b.aliases.join(', ')||'none'}.
* Native operation and inputs: ${b.native.operation}. Evidence: [native operation](../../${b.native.source}).
* Required inputs: ${b.native.requiredParameters}. Optional/configuration: ${b.native.optionalParameters}.
* Children / owned relations / prerequisites: ${b.native.childrenAndOwnership}.
* Block properties: ${b.applicableBlockProperties.length>10?'appearance property family (all 20 types below; exact IDs in JSON)':b.applicableBlockProperties.length?b.applicableBlockProperties.join(', '):'no active consumer confirmed'}. ${b.propertyApplicabilityNote}. Configuration entries apply by native target; no universal property-admission promise is implied.
* DCP: advertised ${b.dcp.advertised}; discoverable ${b.dcp.discoverable}; read ${b.dcp.read}; authorable ${b.dcp.authorable}. Representation: ${b.dcp.representation??'none'}. Gap: ${b.dcp.missingIntegration}.
`).join('\n')}

Inline text-cell and image-cell/inline-image are host-owned text descendants, not BlockRegistry entries. Image Cells need native image admission; DCP cannot create inline objects and exact source selectors reject sources containing them. Native linked definitions (Arguments, Entities, relationships, Gloss and range definitions) are not additional Block types.

## Block property inventory

All entries are persistent payload.blockProperties records. The generic record is type plus optional value/metadata and host identity; this is not a uniform validating schema. Appearance properties apply only where a view consumes blockAppearance; the registry has no per-type applicability predicate. The JSON stores the specific target notes and source references. None is directly DCP-authorable or exported by read_source as a Block-property record.

${table(['Canonical property','Applicable targets','Value/schema, defaults and permitted values','Human route / native preparation'],blockProperties.map((p:any)=>[p.id,p.appliesTo,p.schema.description+'; '+p.defaultsAndValues,p.humanAuthoring+'; '+p.preparation+' ['+p.source+'](../../'+p.source+')']))}

## Configuration and presentation state

The identifiers below beginning with payload: are **audit keys**, not invented native property types or DCP syntax. Slashes between field paths group related configuration; use the referenced native factory/model for actual nesting and validation. Only list.style is a returned DCP input. Generated htmlListItem metadata is not independently configurable.

${table(['Native path / audit key','Applicable targets','Schema/defaults','Human preparation','Persistence / DCP'],configuration.map((p:any)=>[p.id,p.appliesTo,p.schema.description,p.humanAuthoring+' ['+p.source+'](../../'+p.source+')',p.persistence+'; '+p.dcp.representation]))}

## Standoff inventory

Ordinary native ranges use inclusive Cell start/end, within the target text, with overlaps permitted. DCP XML boundaries measure Unicode scalar Cells and use an exclusive end boundary converted to native end−1; empty/reversed spans are rejected. Specialised Cardex/Phosphor models validate their own text/ranges, and superpositions prohibit overlapping alternatives. No renderer registration grants generic access to all TextBlock contexts.

Human style-bar application goes through existing range/cross-text operations; source/import-only styles are labelled accordingly. Cell/region/noise effect numeric values below are native rendering clamps, **not formal authoring schemas**. Toolbar defaults can differ from renderer fallbacks; both are extracted into JSON. The style/chromatic-aberration toolbar stores direction=horizontal, but the cell renderer consumes offset/intensity; do not advertise an implemented direction parameter from that default alone.

${standoffProperties.map((p:any)=>`### ${p.id}

${p.name}: ${p.purpose}. Category: ${p.category}. Scope: ${p.scope}. Registration: [${p.source}](../../${p.source}).

* Human route: ${p.humanAuthoring}.
* Targets / range: ${p.appliesTo}; ${p.rangeConstraints}.
* Attributes: ${p.attributes.description}. ${p.attributes.parameters.length?'Numeric rendering parameters: '+p.attributes.parameters.map((v:any)=>v.name+' default '+v.default+' ['+v.minimum+', '+v.maximum+']').join('; ')+'.':''} ${p.toolbarDefaults?'Toolbar defaults: '+JSON.stringify(p.toolbarDefaults)+'.':''}
* DCP advertised: ${p.dcp.advertised}; discoverable: ${p.dcp.discoverable}; authorable: ${p.dcp.authorable}. Syntax: ${p.dcp.representation??'none'}. Raw markup probe: ${p.dcp.inlineProbe}. Gap: ${p.dcp.missingIntegration}.
`).join('\n')}

Standoff aliases: ${Object.entries(data.aliases.standoff).map(([a,b])=>a+' → '+b).join('; ')}. They resolve native schemas but are not extra DCP legend entries. Both aliases resolve non-AI-authorable styles and are rejected by current DCP markup. Names local to Cardex or Phosphor and text/superposition are unknown to the global DCP registry: an unknown well-formed name can be preserved as dialectic/unknown-semantic. That is **not** authoring the requested native property.

## Actual provider wire contract

**Initially:** responseSchema (strict JSON objects with all declared fields required), protocol/profile/exchange, issued primary/context handles, bounded source manifest, authoring instructions/examples, legend types/four composition kinds/tool names, budgets, and optional capability summary. Controller/live provider assembly adds task/structural context; server/dialectic/providers.ts constructs system instructions and tool requests. JSON contains the actual request template and source-operation instructions; its AUDIT/ISSUED_PRIMARY context values are documentary placeholders, not issued authority.

**Discoverable:** list_text_blocks pages committed native text with participant identity, contribution ordinal and native Block GUID plus current handle; filters contributionId, participantId, fromOrdinal and cursor. read_source returns current revision, text, children and bounded annotation/semantic handles. search_symposium performs bounded text search. describe_capabilities describes only known catalogue IDs, 1–4 per call and <=8192 bytes; it is not a registry enumeration tool. It shares the existing six-call retrieval budget. Full tool parameter objects and catalogue results are in JSON. Repeated catalogue parameter definitions are deduplicated to wire.responseSchema via parametersRef; descriptor bodies are retained.

read_source reports complete native support only for the six DCP composition types, subject to bounds. Other types may expose nativeType/text/child handles with status unavailable and an adapter omission; that is encounter-level discovery, not a creation schema. Standoff reads export type/id/start/end/deleted state and selected provenance/semantic references, not general values/attributes. They do not export Block properties or configuration. Therefore seeing a native identifier in a source is not permission or sufficient schema to author it.

**Returnable:** the exact provider schema is JSON.wire.responseSchema; Paragraph/Group/List/Table are the Node union. Anchors, interpretations, Entities, Arguments, Glosses and directed relations are separate arrays. Suggestions/promotionRecommendations must be empty in host admission. Schema-valid strings and shapes still pass host semantic validation. Profile 4A forbids nonempty semantic identity arrays; 4B admits the implemented semantic operations. OpenAI receives the recursive schema; Anthropic gets the same composition contract unrolled to the existing depth limit. Native GUIDs are never replacement source handles.

**Materialised:** exchange.prepare creates native DTO fragments and linked definitions plus source-property deltas; controller admission commits these together. Paragraph → standoff-editor-block; group/list items → container-block; list → indented-list-block; table → table-block with generated rows/cells. Inline/range declarations create native standoff properties; generated passage IDs also create range-anchor infrastructure. Gloss creates both an independent linked definition and range property. Entity/Argument relations create definitions, not Blocks or decorative text. Native immutable contribution protection, typed aliases, issued source authority and atomic canonical transactions remain authoritative. DCP does not accept arbitrary native Block JSON.

### Exact examples

These examples are checked by the actual host prepare function. AUDIT is the fixture exchange ID: real responses must copy their exchange value. The first example demonstrates all four composition kinds and ordinary escaped XML text:

${code(wireExamples.composition)}

Overlapping annotations use boundaries/ranges, not invented numeric-offset output:

${code(wireExamples.overlapping.composition[0])}

Profile 4B semantic fragment (combine with the complete envelope; all omitted semantic arrays in that envelope are empty):

${code({composition:wireExamples.semantics.composition,entities:wireExamples.semantics.entities,arguments:wireExamples.semantics.arguments,glosses:wireExamples.semantics.glosses,relations:wireExamples.semantics.relations})}

For an existing-source quotation, the test constructs a committed AI-authored TextBlock, issues and reads its actual handle, then calls prepare with this response template. READ.handle and READ.revision below are **substitution labels**, not literal usable authority. The test replaces them with the real read result before validation; the excerpt must exactly match that result. Native source anchoring and reproducing the quote are separate operations:

${code(wire.sourceQuotationTemplate)}

The JSON also contains actual inventory/read/search fixture results, with random scope/revision normalised and explicitly marked non-authoritative. They show participant attribution and native IDs, and demonstrate that source reads omit the authored heading and colour value. Exact discovery parameter shapes:

${code(wire.toolExamples)}

Inline formatting syntax is <annotation type="style/bold">text</annotation> (also italics, underline). Classification types use that same grammar or ranges. Scoped Entity reference uses <annotation type="mutable/entity-reference" ref="new:e1">Rain</annotation>, with a declared or issued admitted Entity. Other attributes are rejected. Range attributes and interpretation attributes currently must be empty arrays despite their generic Attribute schema. Ordinary formatting cannot be applied to existing-source anchors through interpretations; that route is restricted to classifications, scoped Entity references and inert unknown semantics.

Unknown semantics are deliberately inert preservation, not a way to bypass native support. Direct mutable/gloss and dialectic/range-anchor inline declarations are rejected; use glosses and anchors/passage IDs. A prose-only contribution is still structurally valid: this audit changes neither repair nor task expectations.

## Complete parity matrix

“Mentioned unavailable” means advertised as a limitation, not offered for authoring. “Encounter-only” means a source may expose its identifier/children; no construction schema is discoverable. “Partial” means the basic native output exists but full editor configuration does not. Host/generated/compatibility rows have their own prerequisites and are not silently excluded from the parity target. Long cells are abbreviated here; the full explanation appears in each inventory entry and in JSON.

${table(['Native type/property','Human authoring','DCP advertised','DCP discoverable','DCP authorable','Missing integration'],matrix.map(row=>row.map(short)))}

## Reproduction and limits

Run npx vitest run scripts/audit-dcp-vocabulary.test.ts to check both artifacts against the current runtime and source contracts. Regenerate intentionally with UPDATE_DCP_VOCABULARY=1 npx vitest run scripts/audit-dcp-vocabulary.test.ts after reviewing changed evidence. The test never runs in the editor or typing path; it makes no provider calls, saves no Documents and changes no registrations in production. It validates representative composition, overlap, semantic and issued-source examples through the existing host preparation path. This is not full native insertion/Undo/save-reload qualification.

The snapshot catches changes in the active Block/standoff sets, scoped constants, appearance cases, native effect parameters, provider schema, tool schemas and catalogue. It does not prove automatic closure over every future UI command or arbitrary metadata key: that missing native contract is a finding. Stage 1 must add operation-to-entry-point coverage using the native authoring infrastructure, not promote this documentary inventory into another runtime registry.
`;
}

it('keeps the documentary vocabulary aligned with native registrations and the DCP contract',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Offline vocabulary audit'}))));
 const editor=new ReactiveEditor({id:'audit-document',type:'document-block',metadata:{documentId:'audit-document'},children:[{id:'audit-contribution',type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'ai',participant:defaultParticipant('audit-document','ai'),ordinal:1,replies:[]}},children:[{id:'audit-text',type:'standoff-editor-block',text:'The worn cup preserves traces of ordinary life.',blockProperties:[{type:'block/font/size',value:'h2'}],standoffProperties:[{id:'audit-colour',type:'text/colour',start:0,end:11,value:'#ff0000'}]}]}]},{features:{dcpNativeAuthoringStage1:false,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
 try {
  registerApplicationViews(editor);
  const defaultBlockCount=(editor.registry as any).registrations.size;
  if(!editor.registry.resolve('canvas-counter-block'))editor.featureHost.activate(createCanvasCounterFeature(scope=>blockFeatureCapabilities(editor,scope)));
  const registrations=[...(editor.registry as any).registrations.values()].sort((a:any,b:any)=>a.type.localeCompare(b.type)) as any[];
  const catalogue=capabilityCatalogue(editor);
  const details=catalogue.summary.items.map(item=>catalogue.describe({ids:[item.id]}));
  const described=details.flatMap(d=>d.items);
  const initial=request('AUDIT','ISSUED_PRIMARY',[],[],editor.visualEffects,true,catalogue);
  const snapshot={blocks:registrations.map(r=>({type:r.type,owner:editor.registry.owner(r.type),capabilities:r.capabilities,aliases:r.aliases??[],create:!!r.create,slots:r.slots??[]})),standoff:editor.visualEffects.definitions(),humanAnnotations:editor.annotationUI.list().map(r=>({type:r.type,label:r.label})),features:editor.features,featureOwners:editor.featureHost.list(),legend:legend(editor.visualEffects),appearance:appearanceCases()};
  const blockProperties=[...appearanceCases(),...Object.keys(propertyNotes).filter(k=>!k.startsWith('block/'))].sort().map(id=>{
   const fixed=id.startsWith('block/alignment/')?'Fixed '+id.split('/').at(-1)+' alignment':id.startsWith('block/font/size/')?'Fixed font size '+id.split('/').at(-1):id.startsWith('block/theme/')?'Fixed '+id.split('/').at(-1)+' theme':'Fixed top margin '+id.split('/').at(-1);
   const note=propertyNotes[id]??['No value required; type selects fixed appearance',fixed,id.startsWith('block/theme/')?'Window theme menu':'Compatibility/import representation; current style bar emits parameterised property',appearanceSource];
   return {id,name:nice(id),source:note[3],appliesTo:id==='codex/entity-reference'?'Resource/citation Blocks emitted by native capture factories':id==='mutable/resource-annotation'?'mutable/pdf-document-block,mutable/iiif-image-block,mutable/iiif-manifest-block':id==='mutable/academic-annotation'?'mutable/academic-resource-block':id==='mutable/opaque-block-property'?'Preserved imported Blocks':'Views consuming blockAppearance (text/layout/window/widget); no registered per-Block target schema',schema:{ref:note[3],description:note[0],jsonSchema:null},defaultsAndValues:note[1],humanAuthoring:note[2],preparation:id.startsWith('block/')?'Native style/payload operation + canonical admission; appearance casts/defaults only':'Native resource anchor/identity validator + canonical admission; opaque imports remain inert',persistence:'persistent',dcp:{advertised:id.startsWith('block/font/size')?'heading limitation only':'no',discoverable:'no property/schema export',authorable:'no',representation:null,missingIntegration:'Shared native property operation and parameter schema; no DCP Block-property field'}};
  });
  const configuration=metadataNotes.map(([path,appliesTo,description,humanAuthoring,source,syntax])=>({id:'payload:'+path,nativePath:path,appliesTo,schema:{ref:source,jsonSchema:null,description},source,humanAuthoring,persistence:path.startsWith('viewChildren')?'transient/session':'persistent',dcp:{advertised:syntax==='list.style only'?'yes, list style':'no',discoverable:syntax==='list.style only'?'List schema':'no configuration/schema export',authorable:syntax==='list.style only'?'partial':syntax.startsWith('generated')?'generated only':'no',representation:syntax,missingIntegration:syntax==='list.style only'?'List start/reversed/item/task configuration':path.startsWith('viewChildren')?'Host presentation; not a persistent-authoring gap':'Shared typed native configuration operation; no arbitrary metadata channel'}}));
  const blocks=registrations.map(r=>{
   const evidence=blockEvidence(r.type),route=blockRoutes[r.type],category=generated.has(r.type)?'generated':host.has(r.type)?'host/presentation':compatibility.has(r.type)?'compatibility/existing-content':structural.has(r.type)?'structural':'human-authorable';
   let source=blockSources[r.type]??'src/runtime/block-menu-actions.ts';
   if(r.type.startsWith('table-'))source='src/runtime/tables.ts';
   if(['surface-block','side-block'].includes(r.type))source='src/runtime/block-surfaces.ts';
   if(['tab-block','tab-row-block'].includes(r.type))source='src/runtime/tab-commands.ts';
   if(r.type.includes('-source-block'))source='src/interchange/source-block.ts';
   if(['youtube-player-block','vimeo-player-block','iframe-block'].includes(r.type))source='src/interchange/resource-url.ts';
   if(category==='host/presentation')source='src/application/features.ts';
   if(category==='compatibility/existing-content'||category==='generated')source=core;
   const registrationSource=registrationSources[r.owner??editor.registry.owner(r.type)!]??registrationSources[editor.registry.owner(r.type)!];
   const human=category==='human-authorable'?'yes, native creation/import route':category==='structural'?'yes through owning native operation':category==='host/presentation'?'host launch/configuration, context-dependent':category==='compatibility/existing-content'?'existing editing/copy/import; fresh route not established':'host/import generated; no unrestricted constructor';
   const appearanceView=['ContainerBlockView','FormattedDocumentView','GenericContainerView','PageView','StandoffEditorView','ImageView','WindowView'].includes(r.view.name.replace('[solid-refresh]',''));
   const relevant=blockProperties.filter(p=>p.id.startsWith('block/')&&appearanceView
    ||r.type==='timer-block'&&['block/size','block/position'].includes(p.id)
    ||r.type==='3d-object-block'&&p.id==='block/size'
    ||['mutable/pdf-document-block','mutable/iiif-image-block','mutable/iiif-manifest-block'].includes(r.type)&&p.id==='mutable/resource-annotation'
    ||r.type==='mutable/academic-resource-block'&&p.id==='mutable/academic-annotation'
    ||['mutable/pdf-document-block','mutable/iiif-image-block','mutable/iiif-manifest-block','mutable/web-article-block','mutable/citation-block','mutable/academic-resource-block','mutable/web-resource-block'].includes(r.type)&&p.id==='codex/entity-reference'
   ).map(p=>p.id);
   const mentions=described.filter((d:any)=>d.nativeTypes?.includes(r.type)).map((d:any)=>({id:d.id,status:d.status,authorable:d.authorable}));
   const inputs=nativeInputs[r.type]??(r.type.includes('-source-block')?['Format selected by Block type; valid destination','text default empty; sourcePayload supplies versioned sourceFormat; linked provenance requires native binding']:undefined);
   const advertised=route?'yes via '+route.catalogue:mentions.length?'mentioned unavailable via '+mentions.map(m=>m.id).join(', '):'no';
   return {id:r.type,name:nice(r.type),purpose:evidence.operation,classification:category,humanAuthoring:human,aliases:r.aliases??[],registration:{source:registrationSource,owner:editor.registry.owner(r.type),view:r.view.name.replace('[solid-refresh]',''),capabilities:r.capabilities,hasCreate:!!r.create,slots:r.slots??[],defaultEnabled:r.type==='canvas-counter-block'?editor.features.canvasWorkspace:true},native:{source,operation:evidence.operation,parameterSchemaRef:null,parameterSchemaStatus:'No complete registration parameter schema; operation/model source is authoritative',requiredParameters:inputs?.[0]??(category==='generated'?'Owning native operation/import context; not user-supplied raw records':category==='host/presentation'?'Authorized host/resource context; operation-specific inputs below':evidence.constraints),optionalParameters:inputs?.[1]??'No complete native parameter descriptor; operation-specific configuration/defaults in the route and configuration inventory',childrenAndOwnership:evidence.constraints,resourcePrerequisites:r.capabilities.includes('media')||r.type.startsWith('mutable/')?'Use operation-specific external URL, managed resource or retained capture when required; lack of acquisition is distinct from lack of DCP binding':'Valid destination/owner and enabled native operation; see constraints'},applicableBlockProperties:relevant,propertyApplicabilityNote:appearanceView?'Consumes blockAppearance; actual property UI/admission remains operation-specific':'Only listed specialised consumers confirmed; inert imported properties may still be preserved',dcp:{advertised,catalogueMentions:mentions,discoverable:route?'capability schema + bounded source read':mentions.length?'unavailable descriptor + encounter-only nativeType/children':'encounter-only nativeType/children if source is within committed Document',read:route?'text/children and limited standoff projection, subject to bounds':'unavailable adapter; nativeType/children may still be returned',authorable:route?'partial; basic native structure':'no',representation:route?.syntax??null,schemaRef:schemaRef(route?.schema??null),missingIntegration:route?'Full editor configuration, child/owned-relation and resource operations':evidence.gap}};
  });
  const parameters=effectParameters(),defaults=constant('src/rendering/document-style-bar.tsx','effectDefaults');
  const aliases=constant('src/rendering/standoff-styles.ts','aliases');
  const typeSet=new Set([...Object.keys(standoffStyleSchemas),...editor.visualEffects.definitions().map(d=>d.type),...NAME_TYPES,...ATTRIBUTES,TAG,'text/superposition']);
  const standoffProperties=[...typeSet].sort().map(id=>{
   const style=standoffStyleSchemas[id],definition=editor.visualEffects.type(id),special=specialised[id],isName=NAME_TYPES.includes(id),isPhosphor=(ATTRIBUTES as readonly string[]).includes(id)||id===TAG;
   const source=isName?'src/features/cardex/local-editor.tsx':isPhosphor?'src/features/phosphor/model.ts':standoffSources[id]??(id.startsWith('dialectic/')?'src/features/dialectic/dcp/markup.ts':'src/rendering/standoff-styles.ts');
   const tool=annotationTools.find(t=>t[0]===id),isInline=initial.legend.types.some(t=>t.type===id),specialRoute=['mutable/gloss','dialectic/range-anchor'].includes(id);
   let inlineProbe='';try{const mark=annotation(id,{},editor.visualEffects,provenance);inlineProbe=mark.type===id?'accepted native type':'inert preservation as '+mark.type;}catch(error){inlineProbe=(error as Error).message;}
   const syntax=isInline?id==='mutable/entity-reference'?'<annotation type="mutable/entity-reference" ref="new:e1">text</annotation> (4B, admitted Entity); or Span.ref':`<annotation type="${id}">text</annotation>; or Span {id,type,from,to,ref:null,attributes:[]}`:id==='mutable/gloss'?'glosses:[{id:"new:g1",target:PASSAGE_ALIAS_OR_HANDLE,type:"Explanation",text:"Meaning"}] (4B)':id==='dialectic/range-anchor'?'anchors:[{id:"new:r1",source:READ.handle,revision:READ.revision,selector:{exact,prefix,suffix}}]; or generated <annotation ... id="new:s1">':null;
   const human=tool?'Style bar: '+tool[1]+(style?.deferred?' (stored, visual rendering pending)':''):id.startsWith('text/')&&id!=='text/superposition'?'Style-bar Colour / Fill':special?.[1]??(isName?'Cardex Name editor Mark selection':isPhosphor?'Phosphor specialised attribute/tag controls':classifications.includes(id)?'DCP-generated; no dedicated human classification control found':id==='codex/search/highlight'?'Search-generated temporary highlighting':'Native/imported reference data; no dedicated current toolbar creation route found');
   const attrs=special?.[0]??(isName?'Only id,type,start,end,isDeleted; no value or arbitrary attributes; validateRanges maximum200':isPhosphor?id===TAG?'value:string tag; Phosphor model validator':'No additional attribute values; Phosphor model validator':id.startsWith('text/')?'value:string CSS colour; native/import validator differs by route':id.startsWith('codex/')?'value/reference identity according to native producer; renderer does not validate semantic target':isInline?'No extra authoring attributes; metadata.dcp generated by host':parameters[id]?'Numeric top-level annotation fields below; no general authored-property schema':'No additional value required by current style renderer; arbitrary data preservation is not a typed authoring contract');
   return {id,name:tool?.[1]??nice(id),purpose:special?.[1]??tool?.[1]??definition?.semantic?.purpose??nice(id),source,scope:isName?'Cardex Name local editor only':isPhosphor?'Phosphor model only':id==='text/superposition'?'Experimental textSuperposition flag':'Reactive application / active feature',category:special?.[2]??(isName||id.startsWith('dialectic/')||id.startsWith('codex/')?'semantic':id.startsWith('style/')||id.startsWith('text/')?'formatting':'presentational'),humanAuthoring:human,appliesTo:isName?'Cardex local standoff-editor-block Name text':isPhosphor?'Phosphor-owned standoff-editor-block text':'standoff-editor-block (including text owned by native structures); specialised context may restrict mutations',rangeConstraints:id==='text/superposition'?'Inclusive in-bounds nonempty range, no overlap with another superposition; owned alternatives':isName?'Unicode scalar inclusive ranges; in bounds; unique IDs; overlapping styles allowed; single-line Name':id==='style/character-surface'?'Initialis: one uppercase A–Z Cell; no existing/adjacent character surface; excludes following combining/format characters and cross/multiselection; renderer-specific readiness':'Inclusive nonempty in-bounds native Cell range; overlap permitted; DCP boundaries are exclusive-end before conversion',attributes:{description:attrs,parameters:parameters[id]??[],schemaRef:source,formalJsonSchema:null},toolbarDefaults:defaults[id]??null,registration:definition??style??null,dcp:{advertised:isInline?'yes, initial legend':specialRoute?'yes, dedicated operation':id==='dialectic/unknown-semantic'?'inert preservation policy':'no',discoverable:isInline?'initial legend + paragraph/classification catalogue':specialRoute?'dedicated capability schema':'encounter-only type/range; no full attributes/schema',authorable:isInline||specialRoute?'yes, route/profile restricted':id==='dialectic/unknown-semantic'?'generated inert preservation only':'no',inlineProbe,representation:syntax,schemaRef:schemaRef(id==='mutable/gloss'?'Gloss':id==='dialectic/range-anchor'?'Anchor':isInline?'Span':null),missingIntegration:isInline?'No general native attribute configuration; existing-source interpretations restricted':specialRoute?'No generic mutation/replacement; preserve dedicated definition authority':isName||isPhosphor?'Specialised context and native validation adapter; unknown-name preservation is not support':'Shared native annotation descriptor/preparation; renderer alone grants no DCP permission'}};
  });
  expect(blocks.find(b=>b.id==='standoff-editor-block')!.applicableBlockProperties).toContain('block/font/size');
  expect(blocks.find(b=>b.id==='grid-row-block')!.dcp.advertised).toContain('composition.card-grid');
  // Actual issued source authority, with a committed AI-authored passage.
  const projection=editor.createView();
  const nodes=()=>Object.values(projection.state.nodes),find=(id:string)=>nodes().find(n=>n.payload.id===id);
  const sources=new DcpSources(editor,'audit-document',()=>[find('audit-contribution')!],key=>projection.node(key),key=>nodes().find(n=>n.children.includes(key)),target=>{const node=find(target.blockId!);return node?{status:'resolved',node} as any:{status:'missing'} as any;},new AbortController().signal);
  let quotationTemplate:any,discoveryResults:any;
  try {
   for(const example of Object.values(wireExamples)){
    const prepared=await prepare(JSON.stringify(example),'AUDIT','audit-document',editor.visualEffects,sources,true,'ai');
    expect(prepared.children.length).toBeGreaterThan(0);
    if(example===wireExamples.composition)expect(prepared.children.map(n=>n.type)).toEqual(['standoff-editor-block','container-block','indented-list-block','table-block']);
    if(example===wireExamples.overlapping)expect(prepared.children[0].standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'style/bold',start:0,end:9}),expect.objectContaining({type:'dialectic/claim',start:6,end:15})]));
    if(example===wireExamples.semantics)expect(Object.values(prepared.definitions).map((d:any)=>d.type)).toEqual(expect.arrayContaining(['mutable/entity','mutable/entity-relation','mutable/gloss','dialectic/argument','dialectic/argument-relation']));
   }
   const inventory=await sources.tool({id:'audit-inventory',tool:'list_text_blocks',arguments:{cursor:null,limit:20,contributionId:null,participantId:'audit-document:ai',fromOrdinal:1}});
   expect(inventory.items).toEqual([expect.objectContaining({blockId:'audit-text',contribution:expect.objectContaining({author:'ai',ordinal:1,participant:expect.objectContaining({id:'audit-document:ai'})})})]);
   const handle=inventory.items[0].handle;
   const source=await sources.tool({id:'audit-read',tool:'read_source',arguments:{handle}});
   expect(source).toMatchObject({status:'complete',sourceAuthor:'ai',text:'The worn cup preserves traces of ordinary life.'});
   expect(source.annotations[0]).toMatchObject({type:'text/colour',start:0,end:11});
   expect(source.annotations[0]).not.toHaveProperty('value');expect(source).not.toHaveProperty('blockProperties');
   const search=await sources.tool({id:'audit-search',tool:'search_symposium',arguments:{query:'worn cup',limit:5}});
   expect(search.items).toHaveLength(1);
   discoveryResults=JSON.parse(JSON.stringify({list_text_blocks:inventory,read_source:source,search_symposium:search},(_key,value)=>typeof value==='string'?value===source.revision?'FIXTURE_REVISION':value.startsWith('src:')?'src:FIXTURE:'+value.split(':').at(-1):value:value));
   const quoted=envelope([paragraph(1,'<annotation type="style/bold">The worn cup</annotation> makes everyday use part of the object’s historical evidence.')],{replyTargets:['new:r1'],anchors:[{id:'new:r1',source:source.handle,revision:source.revision,selector:{exact:'The worn cup',prefix:'',suffix:''}}],interpretations:[{id:'new:m1',target:'new:r1',type:'dialectic/claim',ref:null,attributes:[]}]});
   const prepared=await prepare(JSON.stringify(quoted),'AUDIT','audit-document',editor.visualEffects,sources,true,'ai');
   expect(prepared.annotations.get(find('audit-text')!.key)).toEqual(expect.arrayContaining([expect.objectContaining({type:'dialectic/range-anchor',start:0,end:11}),expect.objectContaining({type:'dialectic/claim',start:0,end:11})]));
   quotationTemplate={...quoted,anchors:[{...(quoted.anchors as any[])[0],source:'READ.handle',revision:'READ.revision'}]};
  } finally {sources.dispose();}
  const data={version:1,scope:'Current reactive application vocabulary; documentation, not an authoring registry',coverage:{defaultBlockCount,optionalBlockTypes:['canvas-counter-block'],defaultFeatures:snapshot.features,mechanical:['BlockRegistry active registrations and aliases','VisualEffectRegistry definitions','standoffStyleSchemas','Cardex NAME_TYPES/DESCRIPTION_TYPES','Phosphor ATTRIBUTES/TAG','appearance switch cases','style-bar defaults and renderer parameter clamps','DCP schema, instructions, legend, tools and capability results'],reviewed:['Native UI routes and factory prerequisites','Resource property types','Relevant configuration paths and context restrictions'],limits:'No central complete metadata/property authoring schema exists; reviewed descriptions are not executable admission rules'},nativeSourceContracts:sourceContracts(),nativeAppearanceFontSizes:constant(appearanceSource,'fontSizes'),initialisPreset:JSON.parse(read('src/features/initialis/preset.json')),aliases:{blocks:Object.fromEntries(blocks.flatMap(b=>b.aliases.map((a:string)=>[a,b.id]))),standoff:aliases},blocks,blockProperties,configuration,standoffProperties,scoped:{cardexDescriptionTypes:DESCRIPTION_TYPES,cardexNameTypes:NAME_TYPES,phosphorAttributes:ATTRIBUTES},wire:{responseSchema,initial,sourceOperationInstructions,tools:providerTools(true),catalogueDetails:details.map(({parameters,...detail})=>({...detail,parametersRef:'#/wire/responseSchema'})),limits:{composition:compositionLimits,capability:capabilityLimits,live:liveLimits},examples:wireExamples,sourceQuotationTemplate:quotationTemplate,discoveryResults,discoveryResultsNote:"Actual fixture tool results; random handle scope and revision normalised. These are not issued authority for any live exchange.",toolExamples:[{name:'list_text_blocks',arguments:{cursor:null,limit:20,contributionId:null,participantId:null,fromOrdinal:1}},{name:'read_source',arguments:{handle:'READ.handle'}},{name:'search_symposium',arguments:{query:'worn cup',limit:5}},{name:'describe_capabilities',arguments:{ids:['composition.paragraph','semantic.gloss']}}]},recommendation:'Coordinate creation, Block configuration/property operations, and standoff range/definition operations through native descriptors and shared preparation; do not create a DCP-owned registry. Stage 1 needs typed input/target/resource/range/ownership contracts and entry-point coverage before claiming parity.'};
  // Every documentary source reference must resolve; unsupported schemas stay null.
  for(const path of new Set([...blocks.flatMap(b=>[b.registration.source,b.native.source]),...blockProperties.map(p=>p.source),...configuration.map(p=>p.source),...standoffProperties.map(p=>p.source)]))expect(read(path).length,path).toBeGreaterThan(0);
  // Accepted pre-Stage-1 audit is a historical baseline. Keep its inventory and
  // old wire contract checked; new projection qualification lives beside DCP.
  // Do not rewrite historical availability claims as if they predated Stage 1.
  const baseline=JSON.parse(read(root+'.json'));
  const addedBlocks=['mutable/svg-text-composition-block','quill-application-block'];
  expect(data.blocks.map(item=>item.id)).toEqual([...baseline.blocks.map((item:any)=>item.id),...addedBlocks].sort((a,b)=>a.localeCompare(b)));
  for(const type of addedBlocks)expect(data.blocks.find(item=>item.id===type)).toMatchObject({registration:{owner:'quill',source:'src/application/quill.tsx'},dcp:{authorable:'no'}});
  for(const key of ['blockProperties','configuration','standoffProperties'] as const)expect(data[key].map(item=>item.id)).toEqual(baseline[key].map((item:any)=>item.id));
  expect(data.aliases).toEqual(baseline.aliases);
  expect(data.wire.responseSchema).toEqual(baseline.wire.responseSchema);
  expect(data.wire.initial).toEqual(baseline.wire.initial);
  expect(data.wire.tools).toEqual(baseline.wire.tools);
  expect(data.wire.catalogueDetails).toEqual(baseline.wire.catalogueDetails);
  // Stage A makes qualified native inspection independent of creation-stage
  // flags. Retain the historical wire evidence and separately assert its new
  // bounded, explicitly non-lossless reading projection.
  const {inspection,...sourceWithoutInspection}=data.wire.discoveryResults.read_source;
  expect(inspection).toMatchObject({version:1,lossless:false,root:{nativeId:'audit-text',nativeType:'standoff-editor-block'}});
  expect({...data.wire.discoveryResults,read_source:sourceWithoutInspection}).toEqual(baseline.wire.discoveryResults);
  expect(data.nativeAppearanceFontSizes).toEqual(baseline.nativeAppearanceFontSizes);
  expect(data.initialisPreset).toEqual(baseline.initialisPreset);
  for(const p of data.standoffProperties){const previous=baseline.standoffProperties.find((v:any)=>v.id===p.id);expect(p.attributes.parameters).toEqual(previous.attributes.parameters);expect(p.toolbarDefaults).toEqual(previous.toolbarDefaults);expect(p.dcp).toEqual(previous.dcp);}
  expect(read(root+'.md')).toContain('## Complete parity matrix');

 } finally {editor.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();}
});
