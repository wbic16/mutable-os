// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import express from 'express';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNativeDocumentStoreRouter } from '../../../server/native-document-store.mjs';
import { ReactiveEditor } from '../../reactive-editor/editor';
import { nativeDocumentSession } from '../../persistence/native-session';
import { captureNative, nativeText } from '../../persistence/native-resource';
import { convert, fixture, invoke, QUILL_TYPE, record } from './model';

it('uses the real native coordinator to save in place only on request, including geometry, text and new annotations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'quill-native-save-'));
  const editors: ReactiveEditor[] = [];
  const initial = new ReactiveEditor(fixture()); editors.push(initial);
  const filename = 'quill.ink', location = { folder: '.', filename };
  const before = nativeText(captureNative(initial.repository.readState(), 'quill-document'));
  await writeFile(path.join(root, filename), before);
  const app = express(); app.use('/api/native', createNativeDocumentStoreRouter({ root }));
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const actualFetch = globalThis.fetch, address = server.address() as { port: number };
  const requests = vi.fn((input: any, options: any) => actualFetch(typeof input === 'string' && input.startsWith('/') ? `http://127.0.0.1:${address.port}${input}` : input, options));
  vi.stubGlobal('fetch', requests);
  const make = () => { const editor = new ReactiveEditor({ type: 'workspace-block', children: [{ type: 'workspace-object-bank-block', children: [] }] }); editors.push(editor); return editor; };
  try {
    const editor = make(), service = nativeDocumentSession(editor), id = await service.open(location);
    const view = editor.createView('save-proof'), source = Object.values(view.state.nodes).find(n => n.payload.id === 'quill-source')!;
    expect(service.isDirty(id)).toBe(false); requests.mockClear();
    const snapshot = vi.spyOn(editor.repository, 'snapshot');
    const wrapper = convert(editor, invoke(editor, source.key, 'native-editor', id));
    const config = record(editor, wrapper).payload.quill as any;
    editor.commands.setPayloadField(wrapper, 'quill', { ...config, swell: 1.1 });
    editor.commands.replaceInlineRange(source.placementKey, 0, 0, 'New ');
    const properties = record(editor, source.placementKey).payload.standoffProperties as any[];
    editor.commands.setPayloadField(source.placementKey, 'standoffProperties', [...properties, { id: 'new-annotation', type: 'style/highlight', start: 0, end: 2 }], 'Annotate Quill text');
    expect(service.isDirty(id)).toBe(true);
    expect(snapshot).not.toHaveBeenCalled(); snapshot.mockRestore();
    expect(requests).not.toHaveBeenCalled();
    expect(await readFile(path.join(root, filename), 'utf8')).toBe(before);
    expect(await service.save(id)).toMatchObject({ phase: 'saved', dirty: false });
    expect(service.location(id)).toEqual(location);
    expect((await readdir(root)).filter(n => /\.(ink|json|md)$/.test(n))).toEqual([filename]);
    const expected = nativeText(captureNative(editor.repository.readState(), id));
    const fresh = make(); expect(await nativeDocumentSession(fresh).open(location)).toBe(id);
    expect(nativeText(captureNative(fresh.repository.readState(), id))).toBe(expected);
    const restored = Object.values(fresh.repository.readState().contents);
    expect((restored.find(c => c.viewType === QUILL_TYPE)!.payload.quill as any).swell).toBe(1.1);
    expect((restored.find(c => c.payload.id === 'quill-source')!.payload.standoffProperties as any[]).some(p => p.id === 'new-annotation')).toBe(true);
  } finally {
    editors.forEach(e => e.dispose()); vi.unstubAllGlobals(); vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
