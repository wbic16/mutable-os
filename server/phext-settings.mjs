// The settings bundle (consolidation audit Part 2): a COPY of the
// user's live settings, stored inside the Cavern's phext under the
// L7 control stratum as a per-field scroll tree — one scroll per
// field, never one JSON blob:
//
//   /.control/settings/bundle/{schemaVersion,createdUtc,updatedUtc,
//                              sourceAppVersion,label?}
//   /.control/settings/domains/keybindings/formatVersion
//   /.control/settings/domains/keybindings/<actionId>/count
//   /.control/settings/domains/keybindings/<actionId>/trigger-<i>/…
//     keyboard: kind, key, modifiers/count, modifiers/modifier-<j>
//     chord:    kind, steps/count, steps/step-<j>/{kind,key,modifiers/…}
//     mouse:    kind, button, gesture, modifiers/…
//     custom:   kind, name
//   /.control/settings/domains/flint-layout/{library,context,
//                              explorerWidth,inspectorWidth,density}
//   /.control/settings/domains/annotation-bar/policy
//   /.control/settings/domains/editor-interactions/crossBlockSelection
//   /.control/settings/domains/textual-fonts/{source,family,size,lineHeight}
//
// Capture is explicit (a user action in the Cavern menu): the client
// sends the five domains' current values; this module validates ALL
// of them before writing anything, then rewrites the tree in one
// flush. Opening a Cavern NEVER imports or overwrites live settings
// — there is deliberately no import path in this module; the bundle
// is read-only data that rides along (Phase 5 download carries it).
// Unknown domains or malformed fields refuse the whole capture with
// the gap named: no silent partial bundle, per the cutover rule.
//
// Portability screen (audit §2.4): bundle fields are plain scalars
// only — no paths, no machine facts. Anything path-shaped is
// refused at validation.
//
// Tree rewriting note: the VFS has no directory-removal primitive,
// so capture unlinks stale leaf scrolls; an emptied directory shell
// (e.g. for an action whose overrides were removed) may remain. It
// carries no data — read-back is driven by the count leaves, never
// by directory listings — and is inert.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SETTINGS_ROOT = '/.control/settings';
// Schema 1 carried exactly the original four domains; schema 2 adds
// the textual-fonts domain (step 4). The version is recorded so a
// future importer can tell a complete bundle from a pre-fonts one
// instead of guessing (audit §2.6).
export const SETTINGS_SCHEMA_VERSION = '2';
export const BINDINGS_FORMAT_VERSION = 2;

const MODIFIERS = ['Ctrl', 'Meta', 'Alt', 'Shift'];
const CUSTOM_INPUTS = ['inspect-annotation', 'save-document', 'toggle-bindings'];
const ANNOTATION_POLICIES = ['auto', 'expanded', 'compact', 'hidden'];
const FLINT_DENSITIES = ['compact', 'reading'];
const FONT_SOURCES = ['bundled', 'system'];
// Mirror of bundledTextualFonts in src/features/textual/fonts.ts —
// the families the bundled source may name. Keep the two in step.
const BUNDLED_FONT_FAMILIES = ['IBM Plex Mono'];
const DOMAINS = ['keybindings', 'flint-layout', 'annotation-bar', 'editor-interactions', 'textual-fonts'];

const fail = message => { throw Error(`Settings capture refused: ${message}`); };
const failRead = message => { throw Error(`Settings bundle refused: ${message}`); };
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

// --- validation (mirrors src/input/bindings.ts validateTrigger) ---

function validateKeyboardStep(input, where) {
  if (!isRecord(input) || input.kind !== 'keyboard') fail(`${where}: chord steps must be keyboard triggers`);
  return validateTrigger(input, where);
}
function validateTrigger(input, where) {
  if (!isRecord(input)) fail(`${where}: trigger must be an object`);
  if (input.kind === 'custom') {
    if (!CUSTOM_INPUTS.includes(input.name)) fail(`${where}: unknown custom input "${String(input.name)}"`);
    return { kind: 'custom', name: String(input.name) };
  }
  if (input.kind === 'chord') {
    if (!Array.isArray(input.steps) || input.steps.length < 2 || input.steps.length > 4) fail(`${where}: a chord requires two to four keyboard steps`);
    return { kind: 'chord', steps: input.steps.map((step, i) => validateKeyboardStep(step, `${where} step ${i + 1}`)) };
  }
  if (!Array.isArray(input.modifiers) || input.modifiers.some(m => !MODIFIERS.includes(m)) || new Set(input.modifiers).size !== input.modifiers.length) {
    fail(`${where}: invalid modifiers`);
  }
  const mods = [...input.modifiers];
  if (input.kind === 'keyboard') {
    if (typeof input.key !== 'string' || input.key.length === 0 || input.key.length > 40 || ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Unidentified', 'Process'].includes(input.key)) {
      fail(`${where}: invalid keyboard key`);
    }
    return { kind: 'keyboard', key: input.key, modifiers: mods };
  }
  if (input.kind === 'mouse') {
    if (!Number.isInteger(input.button) || input.button < 0 || input.button > 4 || !['click', 'dblclick', 'contextmenu'].includes(input.gesture)) {
      fail(`${where}: invalid mouse trigger`);
    }
    return { kind: 'mouse', button: input.button, gesture: input.gesture, modifiers: mods };
  }
  fail(`${where}: unknown trigger kind "${String(input.kind)}"`);
}

function validateKeybindings(input) {
  if (!isRecord(input)) fail('keybindings: domain must be an object');
  const version = input.version ?? BINDINGS_FORMAT_VERSION;
  if (version !== BINDINGS_FORMAT_VERSION) fail(`keybindings: unsupported bindings format version ${String(input.version)} (expected ${BINDINGS_FORMAT_VERSION})`);
  if (!isRecord(input.overrides)) fail('keybindings: overrides must be an object keyed by action id');
  const overrides = {};
  for (const [actionId, triggers] of Object.entries(input.overrides)) {
    if (!/^[\w.-]+$/.test(actionId)) fail(`keybindings: action id "${actionId}" cannot be stored as a settings path segment`);
    if (!Array.isArray(triggers)) fail(`keybindings "${actionId}": triggers must be an array`);
    overrides[actionId] = triggers.map((trigger, i) => validateTrigger(trigger, `keybindings "${actionId}" trigger ${i + 1}`));
  }
  return { version: BINDINGS_FORMAT_VERSION, overrides };
}

function validateFlintLayout(input) {
  if (!isRecord(input)) fail('flint-layout: domain must be an object');
  const { library, context, explorerWidth, inspectorWidth, density } = input;
  if (typeof library !== 'boolean' || typeof context !== 'boolean') fail('flint-layout: library and context must be booleans');
  if (!Number.isFinite(explorerWidth) || !Number.isFinite(inspectorWidth)) fail('flint-layout: explorerWidth and inspectorWidth must be numbers');
  if (!FLINT_DENSITIES.includes(density)) fail(`flint-layout: density must be one of ${FLINT_DENSITIES.join(', ')}`);
  return { library, context, explorerWidth, inspectorWidth, density };
}

function validateAnnotationBar(input) {
  if (!isRecord(input) || !ANNOTATION_POLICIES.includes(input.policy)) fail(`annotation-bar: policy must be one of ${ANNOTATION_POLICIES.join(', ')}`);
  return { policy: input.policy };
}

function validateEditorInteractions(input) {
  if (!isRecord(input) || typeof input.crossBlockSelection !== 'boolean') fail('editor-interactions: crossBlockSelection must be a boolean');
  return { crossBlockSelection: input.crossBlockSelection };
}

// The font domain's live shape is TextualFontSettings
// (src/features/textual/fonts.ts): its normaliser guarantees an
// integer size in 12..32 and an integer line height inside
// ceil(size*1.1)..floor(size*2.5), a family of at most 100 chars
// with no control characters, and — for the bundled source — one
// of the bundled families. Validation here enforces the same
// invariants but refuses instead of repairing: a payload outside
// them did not come through the client's normaliser. The family
// is a font NAME (a plain scalar); a path-shaped one is refused
// under the portability screen like any other bundle field.
function validateTextualFonts(input, refuse = fail) {
  if (!isRecord(input)) refuse('textual-fonts: domain must be an object');
  const { source, family, size, lineHeight } = input;
  if (!FONT_SOURCES.includes(source)) refuse(`textual-fonts: source must be one of ${FONT_SOURCES.join(', ')}`);
  if (typeof family !== 'string' || family.length === 0 || family.length > 100 || /[\x00-\x1f\x7f/\\]/.test(family)) {
    refuse('textual-fonts: family must be a font name of 1-100 characters, with no control characters or path separators');
  }
  if (source === 'bundled' && !BUNDLED_FONT_FAMILIES.includes(family)) refuse(`textual-fonts: bundled family must be one of ${BUNDLED_FONT_FAMILIES.join(', ')}`);
  if (!Number.isInteger(size) || size < 12 || size > 32) refuse('textual-fonts: size must be an integer between 12 and 32');
  const minLineHeight = Math.ceil(size * 1.1), maxLineHeight = Math.floor(size * 2.5);
  if (!Number.isInteger(lineHeight) || lineHeight < minLineHeight || lineHeight > maxLineHeight) {
    refuse(`textual-fonts: lineHeight must be an integer between ${minLineHeight} and ${maxLineHeight} for size ${size}`);
  }
  return { source, family, size, lineHeight };
}

/**
 * Validate a client capture payload in full. Returns the normalized
 * bundle {keybindings, flintLayout, annotationBar,
 * editorInteractions, textualFonts, label?} or throws naming the
 * first problem — nothing is written when this throws.
 */
export function validateSettingsCapture(input) {
  if (!isRecord(input)) fail('payload must be an object with the five settings domains');
  for (const key of Object.keys(input)) {
    if (![...DOMAINS, 'label'].includes(key)) fail(`unknown settings domain "${key}" — the bundle carries exactly: ${DOMAINS.join(', ')}`);
  }
  for (const domain of DOMAINS) if (!(domain in input)) fail(`missing settings domain "${domain}" — capture sends all five domains`);
  let label;
  if (input.label !== undefined) {
    if (typeof input.label !== 'string' || input.label.length > 120 || /[/\0]/.test(input.label)) fail('label must be a short plain-text name');
    label = input.label;
  }
  return {
    keybindings: validateKeybindings(input.keybindings),
    flintLayout: validateFlintLayout(input['flint-layout']),
    annotationBar: validateAnnotationBar(input['annotation-bar']),
    editorInteractions: validateEditorInteractions(input['editor-interactions']),
    textualFonts: validateTextualFonts(input['textual-fonts']),
    ...(label !== undefined ? { label } : {}),
  };
}

// --- tree writing ---

function appVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
    return String(pkg.version ?? 'unknown');
  } catch { return 'unknown'; }
}

function collectFiles(vfs, dir, out = []) {
  let entries;
  try { entries = vfs.listDir(dir); } catch { return out; }
  for (const entry of entries) {
    const child = `${dir}/${entry.name}`;
    if (entry.type === 'directory') collectFiles(vfs, child, out);
    else out.push(child);
  }
  return out;
}

function writeTrigger(vfs, put, base, trigger) {
  vfs.mkdir(base);
  put(`${base}/kind`, trigger.kind);
  if (trigger.kind === 'keyboard' || trigger.kind === 'mouse') {
    if (trigger.kind === 'keyboard') put(`${base}/key`, trigger.key);
    else { put(`${base}/button`, trigger.button); put(`${base}/gesture`, trigger.gesture); }
    vfs.mkdir(`${base}/modifiers`);
    put(`${base}/modifiers/count`, trigger.modifiers.length);
    trigger.modifiers.forEach((mod, i) => put(`${base}/modifiers/modifier-${i}`, mod));
  } else if (trigger.kind === 'chord') {
    vfs.mkdir(`${base}/steps`);
    put(`${base}/steps/count`, trigger.steps.length);
    trigger.steps.forEach((step, i) => writeTrigger(vfs, put, `${base}/steps/step-${i}`, step));
  } else if (trigger.kind === 'custom') {
    put(`${base}/name`, trigger.name);
  }
}

/**
 * Rewrite the settings tree in `vfs` from a validated bundle, in a
 * single flush. Preserves the first capture's createdUtc. Returns
 * the bundle scroll count written.
 */
export function writeSettingsBundle(vfs, bundle, now = new Date()) {
  const stamp = now.toISOString();
  let createdUtc = stamp;
  try {
    const prior = vfs.readFile(`${SETTINGS_ROOT}/bundle/createdUtc`).toString('utf8');
    if (prior) createdUtc = prior;
  } catch { /* first capture */ }
  // Clear stale leaves first: the rewrite must not leave a removed
  // override or a dropped label standing as if still shipped.
  for (const file of collectFiles(vfs, `${SETTINGS_ROOT}/domains`)) { try { vfs.unlink(file); } catch { /* already gone */ } }
  try { vfs.unlink(`${SETTINGS_ROOT}/bundle/label`); } catch { /* no label before */ }
  let written = 0;
  const put = (p, value) => { vfs.writeFile(p, String(value)); written++; };

  vfs.mkdir(`${SETTINGS_ROOT}/bundle`);
  put(`${SETTINGS_ROOT}/bundle/schemaVersion`, SETTINGS_SCHEMA_VERSION);
  put(`${SETTINGS_ROOT}/bundle/createdUtc`, createdUtc);
  put(`${SETTINGS_ROOT}/bundle/updatedUtc`, stamp);
  put(`${SETTINGS_ROOT}/bundle/sourceAppVersion`, appVersion());
  if (bundle.label !== undefined) put(`${SETTINGS_ROOT}/bundle/label`, bundle.label);

  const domains = `${SETTINGS_ROOT}/domains`;
  const kb = `${domains}/keybindings`;
  vfs.mkdir(kb);
  put(`${kb}/formatVersion`, bundle.keybindings.version);
  for (const [actionId, triggers] of Object.entries(bundle.keybindings.overrides)) {
    const base = `${kb}/${actionId}`;
    vfs.mkdir(base);
    put(`${base}/count`, triggers.length);
    triggers.forEach((trigger, i) => writeTrigger(vfs, put, `${base}/trigger-${i}`, trigger));
  }
  const flint = `${domains}/flint-layout`;
  vfs.mkdir(flint);
  put(`${flint}/library`, bundle.flintLayout.library);
  put(`${flint}/context`, bundle.flintLayout.context);
  put(`${flint}/explorerWidth`, bundle.flintLayout.explorerWidth);
  put(`${flint}/inspectorWidth`, bundle.flintLayout.inspectorWidth);
  put(`${flint}/density`, bundle.flintLayout.density);
  const annotation = `${domains}/annotation-bar`;
  vfs.mkdir(annotation);
  put(`${annotation}/policy`, bundle.annotationBar.policy);
  const interactions = `${domains}/editor-interactions`;
  vfs.mkdir(interactions);
  put(`${interactions}/crossBlockSelection`, bundle.editorInteractions.crossBlockSelection);
  const fonts = `${domains}/textual-fonts`;
  vfs.mkdir(fonts);
  put(`${fonts}/source`, bundle.textualFonts.source);
  put(`${fonts}/family`, bundle.textualFonts.family);
  put(`${fonts}/size`, bundle.textualFonts.size);
  put(`${fonts}/lineHeight`, bundle.textualFonts.lineHeight);

  vfs.flush();
  return { written, createdUtc, updatedUtc: stamp };
}

// --- tree reading (the read route's view; NOT an import) ---

function readText(vfs, p) {
  try { return vfs.readFile(p).toString('utf8'); } catch { return undefined; }
}
function readTrigger(vfs, base) {
  const kind = readText(vfs, `${base}/kind`);
  if (kind === 'keyboard' || kind === 'mouse') {
    const count = Number(readText(vfs, `${base}/modifiers/count`) ?? 0);
    const modifiers = [];
    for (let i = 0; i < count; i++) modifiers.push(readText(vfs, `${base}/modifiers/modifier-${i}`));
    if (kind === 'keyboard') return { kind, key: readText(vfs, `${base}/key`), modifiers };
    return { kind, button: Number(readText(vfs, `${base}/button`)), gesture: readText(vfs, `${base}/gesture`), modifiers };
  }
  if (kind === 'chord') {
    const count = Number(readText(vfs, `${base}/steps/count`) ?? 0);
    const steps = [];
    for (let i = 0; i < count; i++) steps.push(readTrigger(vfs, `${base}/steps/step-${i}`));
    return { kind, steps };
  }
  if (kind === 'custom') return { kind, name: readText(vfs, `${base}/name`) };
  return { kind: kind ?? 'missing' };
}

/** Reassemble the shipped bundle from the tree, or null when this
 *  Cavern carries none. Pure read: never touches live settings. */
export function readSettingsBundle(vfs) {
  const schemaVersion = readText(vfs, `${SETTINGS_ROOT}/bundle/schemaVersion`);
  if (schemaVersion === undefined) return null;
  const domains = `${SETTINGS_ROOT}/domains`;
  const kb = `${domains}/keybindings`;
  const overrides = {};
  let actionDirs = [];
  try { actionDirs = vfs.listDir(kb).filter(e => e.type === 'directory').map(e => e.name); } catch { /* none */ }
  for (const actionId of actionDirs) {
    // A removed action leaves an empty directory shell (the VFS
    // has no rmdir); its count leaf is gone, so it is not an
    // override any more.
    const countText = readText(vfs, `${kb}/${actionId}/count`);
    if (countText === undefined) continue;
    const count = Number(countText);
    const triggers = [];
    for (let i = 0; i < count; i++) triggers.push(readTrigger(vfs, `${kb}/${actionId}/trigger-${i}`));
    overrides[actionId] = triggers;
  }
  const bool = value => value === 'true';
  const domainsOut = {
    keybindings: { version: Number(readText(vfs, `${kb}/formatVersion`) ?? BINDINGS_FORMAT_VERSION), overrides },
    'flint-layout': {
      library: bool(readText(vfs, `${domains}/flint-layout/library`)),
      context: bool(readText(vfs, `${domains}/flint-layout/context`)),
      explorerWidth: Number(readText(vfs, `${domains}/flint-layout/explorerWidth`)),
      inspectorWidth: Number(readText(vfs, `${domains}/flint-layout/inspectorWidth`)),
      density: readText(vfs, `${domains}/flint-layout/density`),
    },
    'annotation-bar': { policy: readText(vfs, `${domains}/annotation-bar/policy`) },
    'editor-interactions': { crossBlockSelection: bool(readText(vfs, `${domains}/editor-interactions/crossBlockSelection`)) },
  };
  // The font domain is validated on read-back: a stored bundle is
  // data that arrived from elsewhere, and a malformed font domain
  // is refused whole rather than handed on as if usable. A bundle
  // written before the domain existed (schema 1) simply has no
  // font subtree; it reads back without one — absence is recorded
  // by the missing key, never filled with a fabricated default.
  const fonts = `${domains}/textual-fonts`;
  if (readText(vfs, `${fonts}/source`) !== undefined) {
    domainsOut['textual-fonts'] = validateTextualFonts({
      source: readText(vfs, `${fonts}/source`),
      family: readText(vfs, `${fonts}/family`),
      size: Number(readText(vfs, `${fonts}/size`)),
      lineHeight: Number(readText(vfs, `${fonts}/lineHeight`)),
    }, failRead);
  }
  return {
    schemaVersion,
    createdUtc: readText(vfs, `${SETTINGS_ROOT}/bundle/createdUtc`),
    updatedUtc: readText(vfs, `${SETTINGS_ROOT}/bundle/updatedUtc`),
    sourceAppVersion: readText(vfs, `${SETTINGS_ROOT}/bundle/sourceAppVersion`),
    label: readText(vfs, `${SETTINGS_ROOT}/bundle/label`),
    domains: domainsOut,
  };
}
