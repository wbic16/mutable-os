// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {registerApplicationViews} from '../../application/features';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {decodeBlockTree} from '../../block-tree/codecs';
import {admitNative, captureNative, nativeText} from '../../persistence/native-resource';
import {contentLength, inlineText} from '../../block-tree/inline-sequence';
import {selectionText} from '../../interchange/serializer';
import {admitPassiveComposition} from '../../rendering/passive-composition';
import {DialecticReferences} from './references';
import {ConversationHistory} from './continuity';
import {DcpSources} from './dcp/sources';
import {DcpInventory} from './dcp/inventory';
import {conversationMetadata, defaultParticipant} from './model';
import {RANGE_ANCHOR} from './anchors';

const clean: (()=>void)[]=[];
afterEach(()=>{while(clean.length)clean.pop()!();vi.restoreAllMocks();});
function fixture(text='Compact 😀 conversation') {
  const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block'}]}, {features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
  clean.push(()=>editor.dispose());
  registerApplicationViews(editor);
  const source=decodeBlockTree({id:'doc',type:'document-block',metadata:{dialectic:conversationMetadata},children:[
    {id:'committed',type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'human',participant:defaultParticipant('doc','human'),ordinal:1,replies:[]}},children:[{id:'text',type:'standoff-editor-block',text}]},
    {id:'draft',type:'standoff-editor-block',text:'Draft'}
  ]}).state;
  const bank=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='bank')!;
  const opened=admitNative(editor.repository,new TextEncoder().encode(nativeText(captureNative(source,'doc'))),bank.key);
  const state=editor.repository.readState(),doc=Object.values(state.contents).find(c=>c.payload.id==='doc')!;
  const placement=Object.values(state.placements).find(p=>p.contentKey===doc.key)!.key,view=editor.createView('compact-dialectic',placement),root=view.node(view.state.rootKey)!;
  const node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
  expect(state.contents[node('text').contentKey].compactInline).toBeDefined();
  expect(node('text').inlineContent).toHaveLength(0); // No editing surface mounted.
  const refs=new DialecticReferences(editor,view,root.key);clean.push(()=>refs.dispose());
  return {editor,state,view,root,node,refs,placement,opened};
}

it('reads unmounted compact conversations through references, inventory, DCP and provider history',async()=>{
  const f=fixture(),text=f.node('text'),record=f.state.contents[text.contentKey];
  expect(f.refs.text(text.contentKey)).toBe('Compact 😀 conversation');
  expect(selectionText(f.state,[{placementKey:text.placementKey,start:8,end:9}])).toBe('😀');
  const snapshot=vi.spyOn(f.editor.repository,'snapshot').mockImplementation(()=>{throw Error('full annotation snapshot');});
  f.editor.commands.boundedStructuralTransaction('Annotate compact source',()=>{
  f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',{range:{id:'range',type:RANGE_ANCHOR,metadata:{dialecticRange:{version:1,excerpt:'😀',source:{resourceId:'doc',blockId:'text'}}}}});
  f.editor.commands.setPayloadField(text.key,'standoffProperties',[{id:'segment',type:RANGE_ANCHOR,annotationId:'range',start:8,end:8}]);
  });
  expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
  expect(f.refs.resolve({kind:'range',resourceId:'doc',anchorId:'range'})).toMatchObject({status:'resolved',text:'😀'});
  const sources=new DcpSources(f.editor,'doc',()=>[f.node('committed')],k=>f.view.node(k),k=>f.view.parentOf(k),t=>f.refs.resolve(t),new AbortController().signal,()=>[],120000,()=>[],{profile:'general'},f.refs);
  clean.push(()=>sources.dispose());
  const inventory=new DcpInventory(sources),page=inventory.list({cursor:null,limit:20,contributionId:null,participantId:null,fromOrdinal:null});
  expect(page.items[0].preview).toBe('Compact 😀 conversation');
  expect(page.coverage.previewCells).toBe(contentLength(record));
  expect((await sources.source(page.items[0].handle)).text).toBe('Compact 😀 conversation');
  const history=new ConversationHistory(f.editor);clean.push(()=>history.dispose());
  vi.spyOn(f.editor,'readAssetContext').mockReturnValue({cavernId:'cavern',session:'session'} as any);
  const result=await history.build('doc','agent',[f.node('committed').contentKey]);
  expect(JSON.parse(result.items[0].content).composition.children[0].text).toBe('Compact 😀 conversation');
  expect(text.inlineContent).toHaveLength(0);
});

it('protects compact base text while allowing annotations and bounded unrelated typing with grouped Undo/Redo',()=>{
  const f=fixture(),repository=f.editor.repository,text=f.node('text'),draft=f.node('draft');
  f.editor.textProtection.protect(f.node('committed').contentKey);
  expect(()=>f.editor.commands.replaceInlineRange(text.key,0,1,'X')).toThrow(/protected/);
  f.editor.commands.setPayloadField(text.key,'standoffProperties',[{id:'bold',type:'style/bold',start:0,end:6}]);
  const snapshot=vi.spyOn(repository,'snapshot').mockImplementation(()=>{throw Error('full snapshot');});
  const indexed=f.editor.textProtection.diagnostics.indexed;
  const protectedRecord=f.state.contents[text.contentKey],descriptor=Object.getOwnPropertyDescriptor(protectedRecord,'payload')!;
  let reads=0;Object.defineProperty(protectedRecord,'payload',{configurable:true,get(){reads++;return descriptor.value;}});
  try {
    const group=repository.beginUndoGroup('Streaming compact draft');
    group.run(()=>f.editor.commands.replaceInlineRange(draft.key,5,5,' one'));
    group.run(()=>f.editor.commands.replaceInlineRange(draft.key,9,9,' two'));
    group.finish();
    const current=()=>inlineText(f.state.contents[draft.contentKey].compactInline!.spans);
    expect(current()).toBe('Draft one two');repository.undo();expect(current()).toBe('Draft');repository.redo();expect(current()).toBe('Draft one two');
    expect(snapshot).not.toHaveBeenCalled();expect(reads).toBe(0);
    expect(f.editor.textProtection.diagnostics.indexed).toBe(indexed);
  } finally {Object.defineProperty(protectedRecord,'payload',descriptor);}
});

it('enforces passive presentation limits for compact text without materializing Cells',()=>{
  const f=fixture('x'.repeat(30001));
  expect(()=>admitPassiveComposition(f.editor,f.placement)).toThrow(/30,000/);
  expect(f.node('text').inlineContent).toHaveLength(0);
});

it('allows compact inline image load status while protecting its authored descriptor',()=>{
  const f=fixture(),draft=f.node('draft');
  const address=f.editor.commands.insertInlineImage(draft.key,0,{assetId:'inline',src:'https://example.org/image.png',alt:'Original',status:'pending'}) as any;
  f.editor.textProtection.protect(draft.contentKey);
  f.editor.commands.updateInlineImage(address,{status:'ready'});
  const record=f.state.contents[draft.contentKey];
  expect(record.compactInline!.spans[0]).toMatchObject({kind:'image',properties:{status:'ready',alt:'Original'}});
  expect(()=>f.editor.commands.updateInlineImage({...address,inlineRevision:record.inlineRevision},{alt:'Changed'})).toThrow(/protected/);
});
