import type { AnnotationCapabilities, SearchRange, SearchScope } from "../../feature-api";
export interface DocumentEntityRow {
  id: string;
  fallbackName?: string;
  documentMentions: number;
  ranges: SearchRange[];
}

export interface DocumentEntityInventory {
  scope: SearchScope;
  rows: DocumentEntityRow[];
}

function metadataName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const metadata = value as Record<string, unknown>;
  for (const candidate of [metadata.entityName, metadata.name, metadata.Name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
}

/** Model-only inventory. Counts canonical logical mentions while retaining every occurrence range for previews. */
export function collectDocumentEntities(editor: AnnotationCapabilities, originKey: string): DocumentEntityInventory {
  const { scope, texts, blockReferences = [] } = editor.documentAnnotations(originKey);
  const grouped = new Map<string, { name?: string; mentions: Set<string>; ranges: SearchRange[]; rangeKeys: Set<string> }>();

  for(const block of blockReferences)for(const [index,p] of block.properties.entries()){
    if(p.isDeleted||p.type!=='codex/entity-reference'||typeof p.value!=='string'||!p.value)continue;
    let row=grouped.get(p.value);if(!row)grouped.set(p.value,row={name:metadataName(p.metadata),mentions:new Set(),ranges:[],rangeKeys:new Set()});
    row.mentions.add(`block:${block.contentKey}:${p.id??index}`);
  }
  for (const node of texts) {
    const properties = node.properties;
    if (!Array.isArray(properties)) continue;
    properties.forEach((property, index) => {
      if (!property || typeof property !== "object" || Array.isArray(property)) return;
      const local = property as Record<string, unknown>;
      const resolved = local;
      if (resolved.isDeleted || resolved.type !== "codex/entity-reference" || typeof resolved.value !== "string" || !resolved.value.trim()) return;
      const id = resolved.value;
      let row = grouped.get(id);
      if (!row) grouped.set(id, row = { name: metadataName(resolved.metadata), mentions: new Set(), ranges: [], rangeKeys: new Set() });
      row.name ??= metadataName(resolved.metadata);
      const annotationId = typeof resolved.annotationId === "string" && resolved.annotationId ? resolved.annotationId : undefined;
      const propertyId = typeof local.id === "string" && local.id ? local.id : `index:${index}`;
      row.mentions.add(annotationId ? `linked:${annotationId}` : `${node.contentKey}:${propertyId}`);

      const start = Number(local.start), end = Number(local.end);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= node.cellCount) return;
      const rangeKey = `${node.key}:${propertyId}:${start}:${end}`;
      if (row.rangeKeys.has(rangeKey)) return;
      row.rangeKeys.add(rangeKey);
      row.ranges.push({
        nodeKey: node.key,
        contentKey: node.contentKey,
        placementKey: node.placementKey,
        version: node.version,
        start,
        end: end + 1,
        coordinate: node.coordinate ?? "cell",
      });
    });
  }

  return {
    scope,
    rows: [...grouped].map(([id, row]) => ({ id, fallbackName: row.name, documentMentions: row.mentions.size, ranges: row.ranges })),
  };
}
