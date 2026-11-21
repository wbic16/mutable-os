import { describe, expect, it } from 'vitest';
import { decodeBlockTree } from '../block-tree/codecs';
import { freeze } from '../block-tree/commit-capture';
import { resourceToRepository } from '../history/durable-core';
import { decodeGateDocument } from '../history/stage-c-gates/portable';
import { validateResource, type ResourceSnapshot } from '../history/stage-c-gates/resource';
import { captureNative, decodeNative, nativeEnvelope, nativeText, parseNativeEnvelope } from './native-resource';
import { encodeGateDocument } from '../history/stage-c-gates/portable';

it('refreshes existing native excerpt caches with inclusive Cell ranges without changing source or History', () => {
  const state = decodeBlockTree({ id: 'doc', type: 'document-block', children: [{
    id: 'p', type: 'standoff-editor-block', text: '😀-dino\r', standoffProperties: [
      { id: 'entity', type: 'codex/entity-reference', value: 'entity-id', start: 2, end: 5, text: 'din' },
      { id: 'single', type: 'style/bold', start: 2, end: 2, text: '' },
      { id: 'emoji', type: 'style/bold', start: 0, end: 0, text: '' },
      { id: 'missing', type: 'style/bold', start: 2, end: 5 },
      { id: 'deleted', type: 'style/bold', start: 2, end: 5, text: 'historical', isDeleted: true },
      { id: 'point', type: 'style/bold', start: 2, end: 1, text: 'stale', isZeroWidth: true },
    ],
  }] }).state;
  const source = captureNative(state, 'doc'), original = JSON.stringify(source);
  const wire = nativeEnvelope(source), properties = wire.document.blocks.find(b => b.id === 'p')!.properties.standoffProperties;
  expect(properties.map((p: any) => p.text)).toEqual(['dino', 'd', '😀', undefined, 'historical', '']);
  expect(properties[0]).toMatchObject({ start: 2, end: 5, value: 'entity-id' });
  expect(JSON.stringify(source)).toBe(original);
  expect(encodeGateDocument(source).blocks.find(b => b.id === 'p')!.properties.standoffProperties[0].text).toBe('din');
  const serialized = nativeText(source);
  expect(nativeText(decodeNative(new TextEncoder().encode(serialized)))).toBe(serialized);
});

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const fixture = () => nativeEnvelope(captureNative(decodeBlockTree({
  id: 'document', type: 'document-block', metadata: { documentId: 'resource' },
  linkedAnnotations: { shared: { type: 'style/bold' } },
  children: [{ id: 'paragraph', type: 'standoff-editor-block', text: 'A😀é漢\n',
    standoffProperties: [{ id: 'annotation', annotationId: 'shared', start: 1, end: 3 }] }],
}).state, 'resource'));

/** Independent pre-optimization oracle: establish ownership by capturing a
 * complete repository. Keep this expensive path in tests, off the Open path. */
function captureDecoder(input: Uint8Array) {
  const value = parseNativeEnvelope(input);
  const resource = structuredClone(decodeGateDocument(value.document, value.valueEncoding ? 'native' : 'legacy')) as ResourceSnapshot;
  const target = resource.placements[resource.rootPlacementKey].target;
  if (target.kind !== 'local') throw Error('external root');
  for (const id of value.definitionOwnerBlockIds) {
    const content = Object.values(resource.contents).find(c => c.payload.id === id);
    if (!content) throw Error('unknown retention');
    content.definitionOwnerKey = target.contentKey;
  }
  validateResource(resource);
  const recaptured = captureNative(resourceToRepository(resource), value.resourceId);
  if (Object.keys(recaptured.contents).length !== Object.keys(resource.contents).length) throw Error('orphan');
  return freeze(resource);
}

type Wire = ReturnType<typeof fixture>;
const root = (v: Wire) => v.document.blocks.find(b => b.id === 'document')!;
const paragraph = (v: Wire) => v.document.blocks.find(b => b.id === 'paragraph')!;
const localEdge = (placementId: string, blockId: string, kind: 'owned' | 'reference' = 'owned') =>
  ({ placementId, kind, target: { kind: 'local' as const, blockId } });
const foreignEdge = (placementId: string) => ({ placementId, kind: 'owned' as const,
  target: { kind: 'external' as const, reference: { kind: 'block' as const, targetId: 'foreign-root',
    source: { scope: 'document' as const, resourceId: 'foreign' }, version: { kind: 'unpinned' as const } } } });
const cases: Array<[string, boolean, (v: Wire) => void]> = [
  ['normal text and local linked annotation', true, () => {}],
  ['reference cycle', true, v => { paragraph(v).children = [localEdge('back', 'paragraph', 'reference')]; }],
  ['owned cycle', false, v => { paragraph(v).children = [localEdge('back', 'document')]; }],
  ['reference-only unretained definition', false, v => { root(v).children![0].kind = 'reference'; }],
  ['reference-only retained definition', true, v => { root(v).children![0].kind = 'reference'; v.definitionOwnerBlockIds = ['paragraph']; }],
  ['retained unplaced paragraph with owned Cells', true, v => { root(v).children = []; v.definitionOwnerBlockIds = ['paragraph']; }],
  ['unknown retention', false, v => { v.definitionOwnerBlockIds = ['missing']; }],
  ['duplicate retention', false, v => { v.definitionOwnerBlockIds = ['paragraph', 'paragraph']; }],
  ['multiple canonical owners', false, v => { root(v).children!.push(localEdge('duplicate-owner', 'paragraph')); }],
  ['unresolved local linked annotation', false, v => { delete root(v).properties.linkedAnnotations; }],
  ['explicit foreign linked annotation', true, v => {
    delete root(v).properties.linkedAnnotations;
    (paragraph(v).properties.standoffProperties as any[])[0].externalDefinition = {
      format: 'codex-external-definition-gate', version: 1, target: { kind: 'definition', targetId: 'shared',
        source: { scope: 'document', resourceId: 'foreign' }, version: { kind: 'unpinned' } },
    };
  }],
  ['owned foreign resource', true, v => { v.document.version = 2; root(v).children!.push(foreignEdge('foreign')); }],
  ['duplicate foreign ownership', false, v => { v.document.version = 2; root(v).children!.push(foreignEdge('foreign'), foreignEdge('duplicate')); }],
];

describe('native Open ownership validation', () => {
  it.each(cases)('matches capture-based admission: %s', (_name, valid, change) => {
    const wire = fixture(); change(wire); const input = bytes(wire), before = input.slice();
    if (valid) expect(nativeText(decodeNative(input))).toBe(nativeText(captureDecoder(input)));
    else { expect(() => decodeNative(input)).toThrow(); expect(() => captureDecoder(input)).toThrow(); }
    expect(input).toEqual(before);
  });

  it('keeps decoded and retained state immutable and isolates editable copies', () => {
    const wire = fixture(); root(wire).children = []; wire.definitionOwnerBlockIds = ['paragraph'];
    const resource = decodeNative(bytes(wire)), before = nativeText(resource);
    const paragraph = Object.values(resource.contents).find(c => c.payload.id === 'paragraph')!;
    expect(() => { (paragraph.payload as any).id = 'changed'; }).toThrow();
    expect(() => { (paragraph.inlineContent as string[]).pop(); }).toThrow();
    const editable = resourceToRepository(resource);
    editable.contents[paragraph.key].inlineContent.pop();
    (editable.contents[paragraph.key].payload.standoffProperties as any[])[0].start = 0;
    expect(nativeText(resource)).toBe(before);
    expect(nativeText(decodeNative(bytes(wire)))).toBe(before);
  });
});

it('bounds resource-identity scans independently of linked annotation count during capture',()=>{
 const measure=(count:number)=>{
  const state=decodeBlockTree({id:'workspace',type:'workspace-block',children:[
   {id:'doc',type:'document-block',linkedAnnotations:{shared:{type:'style/bold'}},children:[{id:'p',type:'standoff-editor-block',text:'Annotated text',standoffProperties:Array.from({length:count},(_,i)=>({id:'a'+i,annotationId:'shared',start:0,end:8}))}]},
   {id:'other',type:'document-block',children:Array.from({length:20},(_,i)=>({id:'other-'+i,type:'standoff-editor-block',text:'Unrelated text '.repeat(10)}))},
  ]}).state;
  let scans=0;
  state.contents=new Proxy(state.contents,{ownKeys:target=>{scans++;return Reflect.ownKeys(target);}});
  const captured=captureNative(state,'doc'),wire=nativeText(captured);
  expect(nativeText(decodeNative(new TextEncoder().encode(wire)))).toBe(wire);
  expect(Object.values(captured.contents).find(c=>c.payload.id==='p')!.payload.standoffProperties).toHaveLength(count);
  return scans;
 };
 expect(measure(100)).toBe(measure(1));
});

it('rechecks identity ambiguity on a subsequent capture without retaining lookup authority',()=>{
 const state=decodeBlockTree({id:'workspace',type:'workspace-block',children:[
  {id:'doc',type:'document-block',linkedAnnotations:{shared:{type:'style/bold'}},children:[{id:'p',type:'standoff-editor-block',text:'Text',standoffProperties:[{id:'a',annotationId:'shared',start:0,end:3}]}]},
  {id:'other',type:'document-block',children:[]},
 ]}).state;
 expect(()=>captureNative(state,'doc')).not.toThrow();
 const other=Object.values(state.contents).find(c=>c.payload.id==='other')!;
 other.payload.metadata={documentId:'doc'};
 expect(()=>captureNative(state,'doc')).toThrow('ambiguous canonical Document identity');
});
