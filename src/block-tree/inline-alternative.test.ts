import { expect, it, vi } from 'vitest';
import { decodeBlockTree } from './codecs';
import { CanonicalRepository } from './repository';
import { TreeCommands } from './commands';
import { contentLength, inlineText } from './inline-sequence';
import { captureNative, nativeBytes, decodeNative, nativeText } from '../persistence/native-resource';
import type { ExistingBlockDto } from './types';

const reading = (id: string, text: string): ExistingBlockDto => ({ id, type: 'standoff-editor-block', inlineAtoms: text ? [{ kind: 'text', text }] : [], standoffProperties: [{ id: id + '-point', type: 'tei/milestone', start: 0, end: -1, isZeroWidth: true }] });
function fixture(extra = 0) {
  const dto: ExistingBlockDto = { id: 'doc', type: 'document-block', children: [{ id: 'host', type: 'standoff-editor-block', inlineAtoms: [
    { kind: 'text', text: 'A' }, { kind: 'alternative', properties: { version: 1, id: 'slot', readings: ['inline-reading:a', 'inline-reading:b'], metadata: { extension: { keep: true } } } }, { kind: 'text', text: 'Z' },
  ], relation: { 'inline-reading:a': reading('a', 'é😀'), 'inline-reading:b': reading('b', '') }, standoffProperties: [{ id: 'span', type: 'style/bold', start: 0, end: 2 }] }] };
  dto.children!.push(...Array.from({ length: extra }, (_, i) => reading('unrelated-' + i, 'x'.repeat(100))));
  const repo = new CanonicalRepository(decodeBlockTree(dto).state), commands = new TreeCommands(repo, key => key);
  const content = (id: string) => Object.values(repo.readState().contents).find(c => c.payload.id === id)!;
  const placement = (id: string) => Object.values(repo.readState().placements).find(p => p.contentKey === content(id).key)!.key;
  return { repo, commands, content, placement, dto };
}
it('captures all owned rich and empty readings with one stable host position and no canonical Cells', () => {
  const f = fixture(); expect(contentLength(f.content('host'))).toBe(3); expect(inlineText(f.content('host').compactInline!.spans)).toBe('A\uFFFCZ');
  const bytes = nativeBytes(captureNative(f.repo.readState(), 'doc')), reopened = decodeNative(bytes, undefined, true);
  expect(Object.values(reopened.contents).some(c => c.viewType === 'text-cell')).toBe(false);
  expect(nativeText(reopened)).toBe(new TextDecoder().decode(bytes));
  expect(Object.values(reopened.contents).find(c => c.payload.id === 'b')?.compactInline?.spans).toEqual([]);
  expect(() => decodeNative(bytes, undefined, false)).toThrow(/require compact/);
});
it('rejects unsupported slot versions, missing relations and invalid reading targets atomically', () => {
  for (const mutate of [(d: any) => d.children[0].inlineAtoms[1].properties.version = 2, (d: any) => delete d.children[0].relation['inline-reading:b'], (d: any) => d.children[0].relation['inline-reading:a'].type = 'container-block']) {
    const f = fixture(), d = structuredClone(f.dto); mutate(d); expect(() => new CanonicalRepository(decodeBlockTree(d).state)).toThrow();
  }
});
it('edits one reading with bounded native history and leaves host/siblings unchanged', () => {
  const f = fixture(), host = f.content('host'), sibling = f.content('b'), snapshot = vi.spyOn(f.repo, 'snapshot');
  const before = nativeText(captureNative(f.repo.readState(), 'doc'));
  f.commands.replaceInlineRange(f.placement('a'), 0, 0, 'X'); expect(f.content('host')).toBe(host); expect(f.content('b')).toBe(sibling);
  f.repo.undo(); expect(nativeText(captureNative(f.repo.readState(), 'doc'))).toBe(before); f.repo.redo();
  expect(inlineText(f.content('a').compactInline!.spans)).toBe('Xé😀'); expect(snapshot).not.toHaveBeenCalled();
});
it('deletes a slot and restores its complete owned closure through Undo/Redo', () => {
  const f = fixture(), before = nativeText(captureNative(f.repo.readState(), 'doc'));
  f.commands.replaceInlineRange(f.placement('host'), 1, 2, 'x');
  expect(inlineText(f.content('host').compactInline!.spans)).toBe('AxZ'); expect(f.content('host').ownedRelations).toEqual({});
  f.repo.undo(); expect(nativeText(captureNative(f.repo.readState(), 'doc'))).toBe(before);
  f.repo.redo(); expect(inlineText(f.content('host').compactInline!.spans)).toBe('AxZ');
});
it.each([1, 2])('splits before/after the slot while transferring ownership (boundary=%s)', boundary => {
  const f = fixture(), before = nativeText(captureNative(f.repo.readState(), 'doc'));
  const right = f.commands.splitStandoff(f.placement('host'), boundary), c = f.repo.readState().contents[f.repo.readState().placements[right].contentKey];
  expect(Object.keys(c.ownedRelations)).toHaveLength(boundary === 1 ? 2 : 0);
  expect(Object.keys(f.content('host').ownedRelations)).toHaveLength(boundary === 1 ? 0 : 2);
  expect(() => captureNative(f.repo.readState(), 'doc')).not.toThrow();
  f.repo.undo(); expect(nativeText(captureNative(f.repo.readState(), 'doc'))).toBe(before);
});
it('inserts a general native slot in one transaction, with compact owned readings', () => {
  const f = fixture(), revisions: number[] = [], stop = f.repo.subscribeChanges(() => revisions.push(f.repo.state.revision));
  const id = f.commands.insertInlineAlternative(f.placement('a'), 1, [{ type: 'standoff-editor-block', text: 'first' }, { type: 'standoff-editor-block', text: '' }]);
  expect(revisions).toHaveLength(1); expect(f.content('a').compactInline!.spans.some(a => a.kind === 'alternative' && a.properties.id === id)).toBe(true);
  expect(Object.values(f.repo.readState().contents).some(c => c.viewType === 'text-cell')).toBe(false); f.repo.undo();
  expect(inlineText(f.content('a').compactInline!.spans)).toBe('é😀'); stop();
});

it.each([1, 300])('does not read unrelated payloads or rebuild repository indexes while typing/history (%s Blocks)', extra => {
  const f = fixture(extra), key = f.placement('a'), unrelated = f.content('unrelated-0');
  const reads = vi.spyOn(unrelated, 'payload', 'get'), rebuild = vi.spyOn(f.repo as any, 'rebuildReferences'), snapshot = vi.spyOn(f.repo, 'snapshot');
  f.commands.replaceInlineRange(key, 1, 1, 'abc'); f.repo.undo(); f.repo.redo();
  expect(reads).not.toHaveBeenCalled(); expect(rebuild).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
});
it('copies a slot-bearing Block through the native fragment path with exact Undo', () => {
  const f=fixture(1),before=nativeText(captureNative(f.repo.readState(),'doc'));
  const copy=f.commands.copy(f.placement('host'),{kind:'after',anchorKey:f.placement('host')});
  const record=f.repo.readState().contents[f.repo.readState().placements[copy].contentKey];
  expect(contentLength(record)).toBe(3);expect(Object.keys(record.ownedRelations)).toHaveLength(2);
  expect(()=>captureNative(f.repo.readState(),'doc')).not.toThrow();f.repo.undo();expect(nativeText(captureNative(f.repo.readState(),'doc'))).toBe(before);
});

it('moves a host with its owned readings and copies its complete native closure', async () => {
  const f = fixture(1), before = nativeText(captureNative(f.repo.readState(), 'doc'));
  const { serializeSelection } = await import('../interchange/serializer');
  expect(serializeSelection(f.repo.readState(), [{ placementKey: f.placement('host'), start: 1, end: 2 }]).blocks).toHaveLength(3);
  f.commands.move(f.placement('host'), { kind: 'after', anchorKey: f.placement('unrelated-0') });
  expect(contentLength(f.content('host'))).toBe(3); expect(Object.keys(f.content('host').ownedRelations)).toHaveLength(2);
  f.repo.undo(); expect(nativeText(captureNative(f.repo.readState(), 'doc'))).toBe(before);
});
it('rejects structural children inside an owned inline reading before publication', () => {
  const f = fixture(), before = nativeText(captureNative(f.repo.readState(), 'doc')), changed = vi.fn(); f.repo.subscribeChanges(changed);
  expect(() => f.commands.insert({ type: 'plain-text-block', text: 'unsupported child' }, { kind: 'at', parentKey: f.placement('a'), index: 0 })).toThrow(/inline reading|inline alternative/i);
  expect(changed).not.toHaveBeenCalled(); expect(nativeText(captureNative(f.repo.readState(), 'doc'))).toBe(before);
});
