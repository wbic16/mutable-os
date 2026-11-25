import {CellText} from './cells.mjs';

// Test-session cache for a sequential trace in one disposable repository.
// Canonical operations continue to own complete numeric DTOs. No runtime feature.
const blocks = new Map();
export function bridge(record, start, end, insert, origins) {
  const props = record.payload.standoffProperties;
  if (!Array.isArray(props) || record.compactInline.spans.some(s => s.kind !== 'text') ||
      insert.some(s => s.kind !== 'text')) return null;
  let entry = blocks.get(record.key);
  if (!entry || entry.revision !== record.revision) {
    const text = record.compactInline.spans.map(s => s.text).join('');
    const length = Array.from(text).length;
    if (props.some(p => !p || p.isZeroWidth || !Number.isInteger(p.start) || !Number.isInteger(p.end) ||
        p.start < 0 || p.end < p.start || p.end >= length)) return null;
    entry = {model: new CellText(text, props), revision: record.revision};
    blocks.set(record.key, entry);
    globalThis.cellBridgeBuilds = (globalThis.cellBridgeBuilds ?? 0) + 1;
  }
  entry.model.replace(start, end, insert.map(s => s.text).join(''));
  entry.revision = record.revision + 1;
  globalThis.cellBridgeCalls = (globalThis.cellBridgeCalls ?? 0) + 1;
  return entry.model.properties(origins);
}
