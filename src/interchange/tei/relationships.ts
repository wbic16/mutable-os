import type { JsonObject } from '../../block-tree/types';
import { glossDefinition } from '../../features/gloss/model';
import { relationshipType } from '../../features/gloss/relationships';
import type { TeiReference } from './references';

/** Conservative promotion into the existing Document-owned Gloss graph.
 * One assertion owns one edge. Re-running this pass is idempotent; distinct
 * source assertions are not collapsed merely because endpoints match. */
export function promoteTeiRelationships(definitions: Record<string, JsonObject>) {
  let total = 0, promoted = 0;
  for (const assertion of Object.values(definitions)) {
    if (assertion.type !== 'tei/relationship') continue;
    total++;
    const meta = assertion.metadata as any, fields = meta?.fields ?? {};
    if (meta?.sourceElement !== 'relation' || meta.namespace || meta.unsupportedContext || meta.unsupportedContent) continue;
    // Certainty, time, subtype and arbitrary qualifiers have no active native
    // equivalent. Keeping them in an edge's opaque metadata would overstate it.
    if (Object.keys(fields).some(k => !['name', 'xml:id'].includes(k))) continue;
    let type: string;
    try { type = relationshipType(fields.name); if (type !== fields.name) continue; } catch { continue; }
    const refs: TeiReference[] = meta.references ?? [];
    if (refs.some(r => !['active', 'passive', 'resp', 'source'].includes(r.attribute))) continue;
    const endpoint = (attribute: string) => {
      const matches = refs.filter(r => r.attribute === attribute);
      if (matches.length !== 1 || matches[0].tokens.length !== 1) return;
      const token = matches[0].tokens[0];
      if (token.scope !== 'local' || token.state !== 'resolved' || token.target?.kind !== 'definition') return;
      const d = definitions[token.target.id], tei = (d?.metadata as any)?.tei;
      return glossDefinition(d) && tei?.type === 'tei/entity' && ['person', 'org', 'place'].includes(tei.kind) ? d : undefined;
    };
    const active = endpoint('active'), passive = endpoint('passive');
    if (!active || !passive) continue;
    promoted++;
    const source = (active.metadata as any).gloss, target = (passive.metadata as any).gloss;
    const edgeId = String(assertion.id);
    // Provenance is immutable import-time evidence; the preservation record is
    // retained independently even if a user later edits/removes the active edge.
    source.links[edgeId] ??= { version: 1, type, toGlossId: target.localId,
      metadata: { tei: { assertionId: assertion.id, ...JSON.parse(JSON.stringify(meta)) } } };
  }
  return { promoted, preserved: total - promoted };
}
