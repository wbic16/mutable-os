// Settings bundle (audit Part 2): the L7 per-field scroll tree.
// Capture validates everything before writing; read-back
// reassembles the structured bundle; nothing imports into live
// settings (there is no import path at all).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PhextVFS } from '../dist/src/phext/vfs.js';
import { validateSettingsCapture, writeSettingsBundle, readSettingsBundle, SETTINGS_ROOT } from './phext-settings.mjs';

const payload = () => ({
  keybindings: {
    version: 2,
    overrides: {
      'editor.save': [{ kind: 'keyboard', key: 's', modifiers: ['Ctrl'] }],
      'timer.create': [{ kind: 'chord', steps: [{ kind: 'keyboard', key: ';', modifiers: ['Ctrl'] }, { kind: 'keyboard', key: 't', modifiers: [] }] }],
      'sticky.createFloating': [{ kind: 'mouse', button: 2, gesture: 'contextmenu', modifiers: ['Shift'] }, { kind: 'custom', name: 'save-document' }],
    },
  },
  'flint-layout': { library: true, context: false, explorerWidth: 238, inspectorWidth: 255, density: 'reading' },
  'annotation-bar': { policy: 'compact' },
  'editor-interactions': { crossBlockSelection: true },
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mutable-settings-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const vfs = PhextVFS.create(path.join(root, 'cavern.phext'));
  t.after(() => vfs.close());
  return vfs;
}

test('capture writes a per-field scroll tree and read-back reassembles it', t => {
  const vfs = fixture(t);
  const bundle = validateSettingsCapture(payload());
  const outcome = writeSettingsBundle(vfs, bundle, new Date('2026-11-05T12:00:00.000Z'));
  assert.ok(outcome.written > 20);
  // Per-field scrolls, not a blob: individual leaves hold plain text.
  const text = p => vfs.readFile(p).toString('utf8');
  assert.equal(text(`${SETTINGS_ROOT}/bundle/schemaVersion`), '1');
  assert.equal(text(`${SETTINGS_ROOT}/bundle/createdUtc`), '2026-11-05T12:00:00.000Z');
  assert.equal(text(`${SETTINGS_ROOT}/domains/flint-layout/density`), 'reading');
  assert.equal(text(`${SETTINGS_ROOT}/domains/flint-layout/explorerWidth`), '238');
  assert.equal(text(`${SETTINGS_ROOT}/domains/annotation-bar/policy`), 'compact');
  assert.equal(text(`${SETTINGS_ROOT}/domains/editor-interactions/crossBlockSelection`), 'true');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/editor.save/trigger-0/kind`), 'keyboard');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/editor.save/trigger-0/modifiers/modifier-0`), 'Ctrl');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/timer.create/trigger-0/steps/step-1/key`), 't');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/sticky.createFloating/trigger-0/gesture`), 'contextmenu');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/sticky.createFloating/trigger-1/name`), 'save-document');
  const back = readSettingsBundle(vfs);
  assert.equal(back.schemaVersion, '1');
  assert.deepEqual(back.domains.keybindings, payload().keybindings);
  assert.deepEqual(back.domains['flint-layout'], payload()['flint-layout']);
  assert.deepEqual(back.domains['annotation-bar'], payload()['annotation-bar']);
  assert.deepEqual(back.domains['editor-interactions'], payload()['editor-interactions']);
});

test('a second capture rewrites the tree: removed overrides do not linger, createdUtc is preserved', t => {
  const vfs = fixture(t);
  writeSettingsBundle(vfs, validateSettingsCapture(payload()), new Date('2026-11-05T12:00:00.000Z'));
  const next = payload();
  delete next.keybindings.overrides['timer.create'];
  next['annotation-bar'] = { policy: 'hidden' };
  writeSettingsBundle(vfs, validateSettingsCapture(next), new Date('2026-11-05T13:00:00.000Z'));
  const back = readSettingsBundle(vfs);
  assert.equal(back.createdUtc, '2026-11-05T12:00:00.000Z');
  assert.equal(back.updatedUtc, '2026-11-05T13:00:00.000Z');
  assert.equal(back.domains['annotation-bar'].policy, 'hidden');
  assert.deepEqual(Object.keys(back.domains.keybindings.overrides).sort(), ['editor.save', 'sticky.createFloating']);
});

test('validation refuses unknown domains, missing domains, bad triggers and path-shaped values before anything is written', t => {
  const vfs = fixture(t);
  const unknown = { ...payload(), theme: { mode: 'dark' } };
  assert.throws(() => validateSettingsCapture(unknown), /unknown settings domain "theme"/);
  const missing = payload(); delete missing['annotation-bar'];
  assert.throws(() => validateSettingsCapture(missing), /missing settings domain "annotation-bar"/);
  const badTrigger = payload(); badTrigger.keybindings.overrides['editor.save'] = [{ kind: 'keyboard', key: 's', modifiers: ['Hyper'] }];
  assert.throws(() => validateSettingsCapture(badTrigger), /invalid modifiers/);
  const badAction = payload(); badAction.keybindings.overrides['a/b'] = [];
  assert.throws(() => validateSettingsCapture(badAction), /cannot be stored as a settings path segment/);
  const wrongVersion = payload(); wrongVersion.keybindings.version = 3;
  assert.throws(() => validateSettingsCapture(wrongVersion), /unsupported bindings format version 3/);
  // Nothing was written by any refused capture.
  assert.equal(readSettingsBundle(vfs), null);
});

test('a Cavern without a bundle reads as null, not an error', t => {
  const vfs = fixture(t);
  assert.equal(readSettingsBundle(vfs), null);
});
