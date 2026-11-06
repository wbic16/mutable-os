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
  'textual-fonts': { source: 'system', family: 'Courier New', size: 19, lineHeight: 25 },
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
  assert.equal(text(`${SETTINGS_ROOT}/bundle/schemaVersion`), '2');
  assert.equal(text(`${SETTINGS_ROOT}/bundle/createdUtc`), '2026-11-05T12:00:00.000Z');
  assert.equal(text(`${SETTINGS_ROOT}/domains/flint-layout/density`), 'reading');
  assert.equal(text(`${SETTINGS_ROOT}/domains/flint-layout/explorerWidth`), '238');
  assert.equal(text(`${SETTINGS_ROOT}/domains/annotation-bar/policy`), 'compact');
  assert.equal(text(`${SETTINGS_ROOT}/domains/editor-interactions/crossBlockSelection`), 'true');
  assert.equal(text(`${SETTINGS_ROOT}/domains/textual-fonts/source`), 'system');
  assert.equal(text(`${SETTINGS_ROOT}/domains/textual-fonts/family`), 'Courier New');
  assert.equal(text(`${SETTINGS_ROOT}/domains/textual-fonts/size`), '19');
  assert.equal(text(`${SETTINGS_ROOT}/domains/textual-fonts/lineHeight`), '25');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/editor.save/trigger-0/kind`), 'keyboard');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/editor.save/trigger-0/modifiers/modifier-0`), 'Ctrl');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/timer.create/trigger-0/steps/step-1/key`), 't');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/sticky.createFloating/trigger-0/gesture`), 'contextmenu');
  assert.equal(text(`${SETTINGS_ROOT}/domains/keybindings/sticky.createFloating/trigger-1/name`), 'save-document');
  const back = readSettingsBundle(vfs);
  assert.equal(back.schemaVersion, '2');
  assert.deepEqual(back.domains.keybindings, payload().keybindings);
  assert.deepEqual(back.domains['flint-layout'], payload()['flint-layout']);
  assert.deepEqual(back.domains['annotation-bar'], payload()['annotation-bar']);
  assert.deepEqual(back.domains['editor-interactions'], payload()['editor-interactions']);
  assert.deepEqual(back.domains['textual-fonts'], payload()['textual-fonts']);
});

test('a second capture rewrites the tree: removed overrides do not linger, createdUtc is preserved', t => {
  const vfs = fixture(t);
  writeSettingsBundle(vfs, validateSettingsCapture(payload()), new Date('2026-11-05T12:00:00.000Z'));
  const next = payload();
  delete next.keybindings.overrides['timer.create'];
  next['annotation-bar'] = { policy: 'hidden' };
  next['textual-fonts'] = { source: 'bundled', family: 'IBM Plex Mono', size: 16, lineHeight: 20 };
  writeSettingsBundle(vfs, validateSettingsCapture(next), new Date('2026-11-05T13:00:00.000Z'));
  const back = readSettingsBundle(vfs);
  assert.equal(back.createdUtc, '2026-11-05T12:00:00.000Z');
  assert.equal(back.updatedUtc, '2026-11-05T13:00:00.000Z');
  assert.equal(back.domains['annotation-bar'].policy, 'hidden');
  assert.deepEqual(back.domains['textual-fonts'], next['textual-fonts']);
  assert.deepEqual(Object.keys(back.domains.keybindings.overrides).sort(), ['editor.save', 'sticky.createFloating']);
});

test('validation refuses unknown domains, missing domains, bad triggers and path-shaped values before anything is written', t => {
  const vfs = fixture(t);
  const unknown = { ...payload(), theme: { mode: 'dark' } };
  assert.throws(() => validateSettingsCapture(unknown), /unknown settings domain "theme"/);
  const missing = payload(); delete missing['annotation-bar'];
  assert.throws(() => validateSettingsCapture(missing), /missing settings domain "annotation-bar"/);
  const missingFonts = payload(); delete missingFonts['textual-fonts'];
  assert.throws(() => validateSettingsCapture(missingFonts), /missing settings domain "textual-fonts"/);
  const badTrigger = payload(); badTrigger.keybindings.overrides['editor.save'] = [{ kind: 'keyboard', key: 's', modifiers: ['Hyper'] }];
  assert.throws(() => validateSettingsCapture(badTrigger), /invalid modifiers/);
  const badAction = payload(); badAction.keybindings.overrides['a/b'] = [];
  assert.throws(() => validateSettingsCapture(badAction), /cannot be stored as a settings path segment/);
  const wrongVersion = payload(); wrongVersion.keybindings.version = 3;
  assert.throws(() => validateSettingsCapture(wrongVersion), /unsupported bindings format version 3/);
  const fontWith = patch => { const p = payload(); Object.assign(p['textual-fonts'], patch); return p; };
  assert.throws(() => validateSettingsCapture(fontWith({ source: 'webfont' })), /textual-fonts: source must be one of/);
  assert.throws(() => validateSettingsCapture(fontWith({ source: 'bundled', family: 'Comic Sans MS' })), /textual-fonts: bundled family must be one of/);
  assert.throws(() => validateSettingsCapture(fontWith({ family: '../fonts/evil' })), /textual-fonts: family must be a font name/);
  assert.throws(() => validateSettingsCapture(fontWith({ family: 'Courier\nNew' })), /textual-fonts: family must be a font name/);
  assert.throws(() => validateSettingsCapture(fontWith({ size: 40 })), /textual-fonts: size must be an integer between 12 and 32/);
  assert.throws(() => validateSettingsCapture(fontWith({ size: 16.5 })), /textual-fonts: size must be an integer between 12 and 32/);
  assert.throws(() => validateSettingsCapture(fontWith({ size: 16, lineHeight: 60 })), /textual-fonts: lineHeight must be an integer between 18 and 40 for size 16/);
  assert.throws(() => validateSettingsCapture(fontWith({ size: 16, lineHeight: 12 })), /textual-fonts: lineHeight must be an integer between 18 and 40 for size 16/);
  // Nothing was written by any refused capture.
  assert.equal(readSettingsBundle(vfs), null);
});

test('read-back refuses a bundle whose stored font domain is malformed, and a pre-fonts bundle reads back without one', t => {
  const vfs = fixture(t);
  writeSettingsBundle(vfs, validateSettingsCapture(payload()), new Date('2026-11-05T12:00:00.000Z'));
  // A foreign or hand-edited bundle: the stored size leaf is
  // outside the domain's own bounds. Read-back refuses the bundle
  // rather than handing the malformed domain on as if usable.
  vfs.writeFile(`${SETTINGS_ROOT}/domains/textual-fonts/size`, '99');
  vfs.flush();
  assert.throws(() => readSettingsBundle(vfs), /Settings bundle refused: textual-fonts: size must be an integer between 12 and 32/);
  // A schema-1-era bundle has no font subtree at all: it reads
  // back with the key absent (never a fabricated default) and the
  // other domains intact.
  for (const leaf of ['source', 'family', 'size', 'lineHeight']) vfs.unlink(`${SETTINGS_ROOT}/domains/textual-fonts/${leaf}`);
  vfs.flush();
  const back = readSettingsBundle(vfs);
  assert.equal('textual-fonts' in back.domains, false);
  assert.deepEqual(back.domains['flint-layout'], payload()['flint-layout']);
  assert.deepEqual(back.domains.keybindings, payload().keybindings);
});

test('a Cavern without a bundle reads as null, not an error', t => {
  const vfs = fixture(t);
  assert.equal(readSettingsBundle(vfs), null);
});
