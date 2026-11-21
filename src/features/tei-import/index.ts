import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { CodexFeature } from '../../runtime/features';
import { teiModes, teiBlockProperties, teiStandoffProperties, validateTeiDeclarations } from '../../interchange/tei/definitions';

export function createTeiImportFeature(editor: ReactiveEditor): CodexFeature {
  return { id: 'tei/import', activate(scope) {
    validateTeiDeclarations();
    for (const d of teiModes) scope.own(editor.blockModes.register(d, scope.owner));
    for (const d of teiBlockProperties) scope.own(editor.blockPropertyTypes.register(d, scope.owner));
    for (const d of teiStandoffProperties) scope.own(editor.standoffPropertyTypes.register(d, scope.owner));
  } };
}
