import type { BlockModeDefinition } from '../../block-tree/block-mode-registry';
import type { BlockPropertyDefinition } from '../../properties/block-property-definitions';
import type { StandoffPropertyDefinition } from '../../properties/standoff-property-definitions';
export const containerModes: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), {
  teiHeader: 'header', text: 'text', front: 'front', body: 'body', back: 'back', div: 'section',
  lg: 'verse-group', sp: 'dramatic-speech', opener: 'opener', closer: 'closer',
  correspDesc: 'correspondence', correspAction: 'correspAction',
}));
export const textModes: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), {
  head: 'heading', l: 'verse-line', speaker: 'speaker', stage: 'stage-direction',
  dateline: 'dateline', salute: 'salutation', signed: 'signature', postscript: 'postscript',
}));
export const teiModes: readonly BlockModeDefinition[] = Object.freeze([
  ...[...Object.values(containerModes), 'alternatives', 'generic'].map(mode => ({ mode: `tei/${mode}`, label: `TEI ${mode}`, appliesTo: ['container-block'] })),
  ...Object.values(textModes).map(mode => ({ mode: `tei/${mode}`, label: `TEI ${mode}`, appliesTo: ['standoff-editor-block'] })),
]);
const validate = (p: Readonly<Record<string, unknown>>) => {
  if (typeof p.type !== 'string' || !p.type.startsWith('tei/')) throw Error('TEI declaration invariant: expected a tei/ type');
  if (p.metadata !== undefined && (!p.metadata || typeof p.metadata !== 'object' || Array.isArray(p.metadata))) throw Error('TEI metadata must be an object');
};
export const teiBlockProperties: readonly BlockPropertyDefinition[] = Object.freeze([{ type: 'tei/semantic', label: 'TEI container semantics', validate }]);
export const teiStandoffProperties: readonly StandoffPropertyDefinition[] = Object.freeze(
  ['semantic', 'editorial', 'milestone', 'relationship', 'correspondence', 'correspAction'].map(name => ({ type: `tei/${name}`, label: `TEI ${name}`, validate })),
);
export const teiRecordTypes = Object.freeze(['tei/entity', 'tei/reference', 'tei/alternatives', 'tei/alternative', 'tei/conversion']);
export function validateTeiDeclarations() {
  for (const id of [...teiModes.map(d => d.mode), ...teiBlockProperties.map(d => d.type), ...teiStandoffProperties.map(d => d.type), ...teiRecordTypes]) {
    if (!id.startsWith('tei/')) throw Error(`TEI configuration: invalid identifier ${id}`);
  }
}
