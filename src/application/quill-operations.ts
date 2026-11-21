import {captureBlocks,cloneBlocks} from '../block-tree/clipboard';
import {clipProperties} from '../interchange/ranges';
import { contentLength,inlineSlice,clipCompactProperties } from '../block-tree/inline-sequence';
import type { ReactiveEditor } from '../reactive-editor/editor';
import { QUILL_TYPE, SOURCE_REFERENCE, defaultComposition, sourceRole, validQuill } from '../features/quill/model';

export interface QuillInvocation {
  documentId: string; documentPlacement: string; sourcePlacement: string; sourceId: string;
  sourceContent: string; sourceRevision: number; parent: string | undefined;
  occurrence: string; viewId: string; selection?: {anchor:number;head:number};
  existingComposition?: string;
}
export function quillRecord(editor: ReactiveEditor, placement: string) {
  const s = editor.repository.readState(), p = s.placements[placement];
  if (!p || p.externalReference || !s.contents[p.contentKey]) throw Error('Quill source is unavailable.');
  return s.contents[p.contentKey];
}
/** Validate just this owned closure, never unrelated Document payloads. */
export function quillSources(editor: ReactiveEditor, placement: string): string[] {
  const c = quillRecord(editor, placement);
  if (c.viewType !== QUILL_TYPE || !validQuill(c.payload.quill)) throw Error('Unsupported Quill composition version or geometry.');
  const props = c.payload.blockProperties as unknown;
  if (!Array.isArray(props)) throw Error('Composition source references are missing.');
  const references = props.filter(p => sourceRole(p));
  if (references.length !== c.payload.quill.sources.length) throw Error('Composition source references are ambiguous.');
  const sources = c.payload.quill.sources.map(({role}) => {
    const matches = references.filter(p => sourceRole(p) === role);
    const children = c.children.filter(k => quillRecord(editor,k).payload.id === matches[0]?.value);
    if (matches.length !== 1 || children.length !== 1) throw Error('Composition source is missing or ambiguous.');
    const p = editor.repository.state.placements[children[0]], source = quillRecord(editor, p.key);
    if (p.kind !== 'owned' || p.resolvedReference || source.viewType !== 'standoff-editor-block' || editor.repository.contentReferenceCount(source.key) !== 1) throw Error('Composition text must be independently owned.');
    return p.key;
  });
  if (new Set(sources).size !== sources.length) throw Error('Each source role must own a separate TextBlock.');
  return sources;
}
export function invokeQuill(editor: ReactiveEditor, key: string, allowRange=false): QuillInvocation {
  if (!editor.features.quill) throw Error('Quill is disabled.');
  const node = editor.node(key);
  if (!node) throw Error('Select a native TextBlock or composition.');
  const ancestors = editor.blockQueries.ancestorPath(key);
  const document = ancestors.filter(n => n.viewType === 'document-block').at(-1);
  if (!document) throw Error('Quill requires an ordinary native Document.');
  const wrapper = [...ancestors].reverse().find(n => n.viewType === QUILL_TYPE);
  const sources = wrapper ? quillSources(editor,wrapper.placementKey) : undefined;
  const sourcePlacement = sources?.includes(node.placementKey) ? node.placementKey : sources?.[0] ?? node.placementKey;
  const source = quillRecord(editor,sourcePlacement), edge = editor.repository.state.placements[sourcePlacement];
  if (source.viewType !== 'standoff-editor-block') throw Error('Select a native TextBlock.');
  if (edge.kind !== 'owned' || edge.resolvedReference || editor.repository.contentReferenceCount(source.key) !== 1) throw Error('Shared text requires an explicit reference policy.');
  const cross = editor.crossText.range();
  if (!wrapper && cross && (cross.anchor.occurrenceKey !== key || cross.head.occurrenceKey !== key)) throw Error('Select a range within one native TextBlock. Cross-paragraph conversion is not supported.');
  const selection = editor.mounts.get(key)?.captureInlineSelection?.() ?? editor.mounts.inlineSelection(key);
  if (!allowRange && !wrapper && selection && selection.anchor !== selection.head && (Math.min(selection.anchor,selection.head) !== 0 || Math.max(selection.anchor,selection.head) !== contentLength(source))) throw Error('Quill converts a whole TextBlock. Collapse the selection or select the entire paragraph.');
  return {documentId:String((document.payload.metadata as any)?.documentId ?? document.payload.id),documentPlacement:document.placementKey,
    sourcePlacement,sourceId:String(source.payload.id),sourceContent:source.key,sourceRevision:source.revision,parent:editor.repository.locationOf(sourcePlacement)?.ownerContentKey,
    occurrence:key,viewId:node.viewId,selection,existingComposition:wrapper?.placementKey};
}
export function convertQuill(editor: ReactiveEditor, invocation: QuillInvocation): string {
  if (!editor.features.quill) throw Error('Quill is disabled.');
  if (invocation.existingComposition) { quillSources(editor,invocation.existingComposition); return invocation.existingComposition; }
  const source = quillRecord(editor,invocation.sourcePlacement), edge = editor.repository.state.placements[invocation.sourcePlacement];
  if (source.key !== invocation.sourceContent || source.payload.id !== invocation.sourceId || source.revision !== invocation.sourceRevision || editor.repository.locationOf(invocation.sourcePlacement)?.ownerContentKey !== invocation.parent) throw Error('Source changed. Return and invoke Quill again.');
  if (edge.kind !== 'owned' || edge.resolvedReference || editor.repository.contentReferenceCount(source.key) !== 1) throw Error('Source ownership changed.');
  // Check the current ownership chain, not the whole Document/repository.
  const documentContent = quillRecord(editor, invocation.documentPlacement);
  if (String((documentContent.payload.metadata as any)?.documentId ?? documentContent.payload.id) !== invocation.documentId) throw Error('Source Document identity changed.');
  let current: string | undefined = invocation.sourcePlacement;
  while (current && current !== invocation.documentPlacement) {
    const owner: string | undefined = editor.repository.locationOf(current)?.ownerContentKey;
    if (owner === documentContent.key) { current = invocation.documentPlacement; break; }
    const placements: string[] = owner ? [...editor.repository.ownedPlacementKeys(owner)] : [];
    current = placements.length === 1 ? placements[0] : undefined;
  }
  if (!current) throw Error('Source moved to another Document.');
  let wrapper = '';
  editor.commands.structuralTransaction('Convert paragraph to Quill', () => {
    wrapper = editor.commands.insert({type:QUILL_TYPE,quill:defaultComposition(),blockProperties:[{id:crypto.randomUUID(),type:SOURCE_REFERENCE,value:invocation.sourceId,metadata:{quillRole:'body'}}],children:[]}, {kind:'before',anchorKey:invocation.sourcePlacement});
    editor.commands.move(invocation.sourcePlacement,{kind:'at',parentKey:wrapper,index:0});
  });
  return wrapper;
}

/** Remove presentation only. Text identities, definitions and declared reading
 * order survive; the native structural transaction restores geometry on Undo. */
export function convertQuillToText(editor: ReactiveEditor, key: string): string[] {
  if (!editor.features.quill) throw Error('Quill is disabled.');
  const node=editor.node(key);
  if (!node) throw Error('Composition is no longer available.');
  const wrapper=editor.blockQueries.ancestorPath(key).find(n=>n.viewType===QUILL_TYPE);
  if (!wrapper) throw Error('Select a Quill composition.');
  const record=quillRecord(editor,wrapper.placementKey),sources=quillSources(editor,wrapper.placementKey);
  if(editor.repository.contentReferenceCount(record.key)!==1 || record.children.length!==sources.length || Object.keys(record.ownedRelations).length || Object.keys(record.opaqueRelations).length)
    throw Error('This composition has shared ownership or additional structure. Detach or resolve it before converting.');
  editor.commands.structuralTransaction('Convert Quill to Standoff Text',()=>{
    sources.forEach((source,index)=>editor.commands.move(source,{kind:'at',parentKey:wrapper.placementKey,index}));
    editor.commands.unwrap(wrapper.placementKey);
  });
  return sources;
}

export function addQuillSource(editor:ReactiveEditor,wrapperKey:string,requestedRole='caption'):string {
 const n=editor.node(wrapperKey),placement=n?.placementKey??wrapperKey,c=quillRecord(editor,placement);quillSources(editor,placement);
 if(editor.repository.contentReferenceCount(c.key)!==1)throw Error('Detach shared composition before adding a source.');
 const config=structuredClone(c.payload.quill) as ReturnType<typeof defaultComposition>;
 let role=requestedRole.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'source';if(!/^[a-zA-Z]/.test(role))role='source-'+role;const base=role;let suffix=1;while(config.sources.some(s=>s.role===role))role=base+'-'+suffix++;
 const id=crypto.randomUUID(),pathId=role+'-line',y=Math.max(...config.paths.map(p=>p.y+(p.height??p.amplitude??0)))+70;
 config.sources.push({role});config.paths.push({id:pathId,kind:'line',x:30,y,width:Math.max(1,config.viewport.width-60)});config.flows.push({id:role,sourceRole:role,pathIds:[pathId],typography:{size:role==='title'?48:20}});config.viewport.height=Math.max(config.viewport.height,y+70);
 if(!validQuill(config))throw Error('This composition has reached its supported source or artboard limits.');
 let source='';editor.commands.structuralTransaction('Add Quill text source',()=>{source=editor.commands.insert({id,type:'standoff-editor-block',text:role==='title'?'Title':'New text source',standoffProperties:[]},{kind:'at',parentKey:placement,index:c.children.length});editor.commands.setPayloadField(placement,'quill',config);editor.commands.setPayloadField(placement,'blockProperties',[...(c.payload.blockProperties as any[]),{id:crypto.randomUUID(),type:SOURCE_REFERENCE,value:id,metadata:{quillRole:role}}]);});return source;
}
/** Extraction and independent composition share native split/copy contracts. */
export function composeQuillRange(editor:ReactiveEditor,key:string,independent=false):string {
 const request=invokeQuill(editor,key,true);if(request.existingComposition)throw Error('Select text outside an existing composition.');
 const selection=request.selection,start=Math.min(selection?.anchor??0,selection?.head??0),end=Math.max(selection?.anchor??0,selection?.head??0),source=quillRecord(editor,request.sourcePlacement),length=contentLength(source);
 if(!selection||start===end||start<0||end>length)throw Error('Select a non-empty range in one native paragraph.');
 if(source.children.length||Object.keys(source.ownedRelations).length||Object.keys(source.opaqueRelations).length)throw Error('Partial composition requires a paragraph without attached structure.');
 const copied=independent?cloneBlocks(captureBlocks(editor.repository.readState(),[request.sourcePlacement])):undefined;
 if(copied){const c=copied.state.contents[copied.state.placements[copied.roots[0]].contentKey];
  c.payload.standoffProperties=(c.compactInline?clipCompactProperties:clipProperties)(c.payload.standoffProperties,start,end,length);
  if(c.compactInline)c.compactInline.spans=inlineSlice(c.compactInline.spans,start,end);
  else {const removed=[...c.inlineContent.slice(0,start),...c.inlineContent.slice(end)];c.inlineContent=c.inlineContent.slice(start,end);for(const pk of removed){delete copied.state.contents[copied.state.placements[pk].contentKey];delete copied.state.placements[pk];}}
 }

 let wrapper='';editor.commands.structuralTransaction(independent?'Compose independently from selection':'Convert selection to Quill',()=>{
  let selected=request.sourcePlacement;
  if(copied)selected=editor.commands.insertFragment(copied,{kind:'after',anchorKey:selected})[0];
  else {if(end<length)editor.commands.splitStandoff(selected,end);if(start>0)selected=editor.commands.splitStandoff(selected,start);}
  const id=editor.commands.blockIdOf(selected);if(!id)throw Error('Selected text has no native identity.');
  wrapper=editor.commands.insert({type:QUILL_TYPE,quill:defaultComposition(),blockProperties:[{id:crypto.randomUUID(),type:SOURCE_REFERENCE,value:id,metadata:{quillRole:'body'}}],children:[]},{kind:'before',anchorKey:selected});editor.commands.move(selected,{kind:'at',parentKey:wrapper,index:0});
 });return wrapper;
}
