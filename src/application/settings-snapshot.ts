// Settings-bundle capture (client side). Builds the capture payload
// from the five live settings domains, each read through its own
// module's reader — the same persisted state a restart restores:
//
//   keybindings          the BindingRegistry's persisted export
//                        (the registry writes its export through to
//                        storage on every change, so this is the
//                        live value; format version 2)
//   flint-layout         readPersistedFlintLayout()
//   annotation-bar       readAnnotationBarPolicy()
//   editor-interactions  readCrossBlockSelectionPreference()
//   textual-fonts        loadPreferences().font — the Textual
//                        preferences reader normalises the font on
//                        load, so the captured value is the live
//                        TextualFontSettings a restart restores
//
// Capture is an explicit user action ("Update shipped settings" in
// the Cavern menu). Nothing here runs in the background, and there
// is deliberately no import side: opening a Cavern never touches
// live settings (audit §2.3).
import { STORAGE_KEY as BINDINGS_STORAGE_KEY } from '../input/bindings';
import { readPersistedFlintLayout } from '../features/flint/compact-layout';
import { readAnnotationBarPolicy } from '../rendering/annotation-bar-policy';
import { readCrossBlockSelectionPreference } from '../runtime/cross-block-selection';
import { loadPreferences } from '../features/textual/grid';

export function currentSettingsCapture() {
  let keybindings: { version: number; overrides: Record<string, unknown> } = { version: 2, overrides: {} };
  try {
    const raw = localStorage.getItem(BINDINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.overrides && typeof parsed.overrides === 'object') {
        keybindings = { version: typeof parsed.version === 'number' ? parsed.version : 2, overrides: parsed.overrides };
      }
    }
  } catch { /* Unreadable stored bindings: capture the empty override set rather than fail the other four domains; the server validates the whole payload. */ }
  const flint = readPersistedFlintLayout();
  const font = loadPreferences().font;
  return {
    keybindings,
    'flint-layout': {
      library: flint.library, context: flint.context,
      explorerWidth: flint.explorerWidth, inspectorWidth: flint.inspectorWidth,
      density: flint.density,
    },
    'annotation-bar': { policy: readAnnotationBarPolicy() },
    'editor-interactions': { crossBlockSelection: readCrossBlockSelectionPreference() },
    // The font normaliser can leave a system family empty (a stored
    // string that strips to nothing); the domain's own default for
    // an unspecified system family is Courier New — the same name
    // normaliseTextualFont and the settings panel fall back to.
    'textual-fonts': {
      source: font.source,
      family: font.source === 'system' && font.family.trim() === '' ? 'Courier New' : font.family,
      size: font.size,
      lineHeight: font.lineHeight,
    },
  };
}
