import type { JsonObject } from './types';

/** Includes malformed historical values: never silently erase retained authored data. */
export const hasBlockMode = (payload: JsonObject): boolean => payload.mode !== undefined;

/** A continuation is not a duplicate of an identified source object. Until
 * intrinsic-data inheritance is qualified, refuse rich payloads rather than
 * guessing which source IDs, anchors or references should be copied. */
export function modeContinuationError(payload: JsonObject): string | undefined {
  if (!hasBlockMode(payload)) return;
  for (const key of Object.keys(payload)) {
    if (['id', 'type', 'mode', 'text', 'standoffProperties', 'blockProperties'].includes(key) || payload[key] === undefined) continue;
    if (key === 'metadata' && payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key]) && !Object.keys(payload[key] as object).length) continue;
    return 'This Block Mode has intrinsic data that needs an explicit continuation policy; nothing was changed.';
  }
  const properties = payload.blockProperties;
  if (properties !== undefined && (!Array.isArray(properties) || properties.some(p => !p || p.type !== 'block/alignment' ||
    Object.keys(p).some(key => !['id', 'type', 'value', 'isDeleted'].includes(key))))) {
    return 'These Block Properties need an explicit mode continuation policy; nothing was changed.';
  }
}

export function modeJoinError(left: JsonObject, right: JsonObject): string | undefined {
  if (!hasBlockMode(left) && !hasBlockMode(right)) return;
  if (left.mode !== right.mode) return 'Blocks with different modes cannot be joined without an explicit conversion policy; nothing was changed.';
  // Even equal modes do not prove that consuming the right identity/references
  // is safe. Keep this small, conservative boundary until merge policy is qualified.
  return 'Joining mode-bearing Blocks needs an explicit metadata and reference policy; nothing was changed.';
}
