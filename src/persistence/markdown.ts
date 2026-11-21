import {inlineUnits} from "../block-tree/inline-sequence";
/** Bounded Markdown projection/import, qualified in B2. Native state is always authoritative. */
import type { ExistingBlockDto, JsonObject } from "../block-tree/types";
import type { DeepReadonly } from "../block-tree/commit-capture";
import type { ResourceSnapshot } from "../history/stage-c-gates/resource";
import { decodeBlockTree } from "../block-tree/codecs";
import { captureNative, nativeBytes, admitNative } from "./native-resource";
import type { CanonicalRepository } from "../block-tree/repository";

export const PROFILE = "mutable-markdown-subset-v1";
export interface LinkTarget { documentId: string; blockId: string; title: string; path: string }
export interface Diagnostic { blockId?: string; code: string; detail: string }
export const escapeText = (text: string) => text.replace(/[\\`*_[\]{}<>#!|~&+.=-]/g, "\\$&");
const unescapeText = (text: string) => text.replace(/\\([\\`*_[\]{}<>#!|~&+.=-])/g, "$1");
export function resolveWiki(label: string, targets: readonly LinkTarget[]): LinkTarget | undefined {
  const matches = targets.filter(t => t.title === label || t.path === label);
  return matches.length === 1 ? matches[0] : undefined;
}
export function inlineMarkdown(source: string, targets: readonly LinkTarget[]) {
  let text = ""; const properties: JsonObject[] = [];
  for (let i = 0; i < source.length;) {
    if (source[i] === "\\" && i + 1 < source.length) { text += unescapeText(source.slice(i, i + 2)); i += 2; continue; }
    const candidate = /^\*\*([^*\n\[\]`]+)\*\*/.exec(source.slice(i));
    const bold = candidate && source[i - 1] !== "*" && source[i + candidate[0].length] !== "*" ? candidate : undefined;
    const wiki = /^\[\[([^\[\]|\n]+)\]\]/.exec(source.slice(i));
    const target = wiki && resolveWiki(wiki[1], targets);
    if (bold || target && wiki) {
      const body = bold ? bold[1] : wiki![1], start = [...text].length; text += body;
      properties.push({ id: crypto.randomUUID(), type: bold ? "style/bold" : "codex/block-reference", start, end: [...text].length - 1,
        ...(target && !bold ? { value: target.blockId, metadata: { documentId: target.documentId } } : {}) });
      i += (bold ?? wiki)![0].length;
    } else { text += source[i++]; }
  }
  return { text, standoffProperties: properties };
}
const paragraph = (source: string, targets: readonly LinkTarget[], literal = false): ExistingBlockDto => ({ id: crypto.randomUUID(), type: "standoff-editor-block", ...(literal ? { text: source } : inlineMarkdown(source, targets)) });
function tableCells(line: string): string[] | undefined {
  if (!line.startsWith("|") || !line.endsWith("|")) return;
  const cells: string[] = []; let cell = "";
  for (let i = 1; i < line.length - 1; i++) {
    if (line[i] === "\\" && i + 1 < line.length - 1) { cell += line[i] + line[++i]; continue; }
    if (line[i] === "|") { cells.push(unescapeText(cell.trim())); cell = ""; } else cell += line[i];
  }
  cells.push(unescapeText(cell.trim())); return cells;
}
export function importMarkdown(source: string, targets: readonly LinkTarget[] = []) {
  const diagnostics: Diagnostic[] = [], children: ExistingBlockDto[] = [], lines = source.replace(/\r\n?/g, "\n").split("\n");
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { fenced = !fenced; diagnostics.push({ code: "literal-code", detail: "Code fences remain literal in this subset" }); children.push(paragraph(line, targets, true)); continue; }
    if (fenced) { children.push(paragraph(line, targets, true)); continue; }
    if (!line) continue;
    const header = tableCells(line), separator = tableCells(lines[i + 1] ?? "");
    if (header && separator?.length === header.length && separator.every(c => /^:?-{3,}:?$/.test(c))) {
      const rows = [header]; let end = i + 2;
      while (end < lines.length && tableCells(lines[end])) rows.push(tableCells(lines[end++])!);
      if (rows.every(row => row.length === header.length) && separator.every(c => /^-{3,}$/.test(c))) {
        children.push({ id: crypto.randomUUID(), type: "table-block", metadata: { headerRows: 1 }, children: rows.map(row => ({ id: crypto.randomUUID(), type: "table-row-block", children: row.map(text => ({ id: crypto.randomUUID(), type: "table-cell-block", children: [paragraph(text, [], true)] })) })) });
        i = end - 1; continue;
      }
      diagnostics.push({ code: "literal-table", detail: "Irregular/aligned tables remain literal" });
      for (; i < end; i++) children.push(paragraph(lines[i], targets, true)); i--; continue;
    }
    const heading = line.startsWith("# ");
    const block = paragraph(heading ? line.slice(2) : line, targets);
    if (heading) block.blockProperties = [{ id: crypto.randomUUID(), type: "block/font/size", value: "h1" }];
    children.push(block);
  }
  const id = crypto.randomUUID();
  const document: ExistingBlockDto = { id, type: "document-block", metadata: { documentId: id }, children: [{ id: crypto.randomUUID(), type: "page-block", children }] };
  return { document, diagnostics };
}
export function admitMarkdown(repository: CanonicalRepository, bank: string, source: string, targets: readonly LinkTarget[] = []) {
  const result = importMarkdown(source, targets), state = decodeBlockTree(result.document).state;
  const resource = captureNative(state, result.document.id!);
  return { ...admitNative(repository, nativeBytes(resource), bank), resourceId: resource.resourceId, diagnostics: result.diagnostics };
}

export function exportMarkdown(resource: DeepReadonly<ResourceSnapshot>, targets: readonly LinkTarget[] = []) {
  if (Object.values(resource.contents).some(c => c.compactInline?.spans.some(a => a.kind === "alternative"))) throw Error("Markdown export cannot preserve inline alternatives; save as Mutable JSON");
  const diagnostics: Diagnostic[] = [], seen = new Set<string>(); let budget = 10000;
  const warn = (id: unknown, code: string, detail: string) => diagnostics.push({ blockId: typeof id === "string" ? id : undefined, code, detail });
  const plain = (key: string): string => {
    const c = resource.contents[key];
    if(c.compactInline)return c.compactInline.spans.map(a=>a.kind==='text'?a.text:String(a.properties.alt??'[image]')).join('');
    return c.inlineContent.map(pk => { const p = resource.placements[pk]; if (p.target.kind !== "local") return ""; const atom = resource.contents[p.target.contentKey]; return atom.viewType === "text-cell" ? String(atom.payload.text) : String(atom.payload.alt ?? "[image]"); }).join("");
  };
  const inline = (key: string) => {
    const c = resource.contents[key];
    const atoms=c.compactInline ? [...inlineUnits(c.compactInline.spans as any)].map(a=>a.kind==='text'?{viewType:'text-cell',payload:{text:a.text}}:{viewType:'image-cell',payload:a.properties}) : c.inlineContent.map(pk=>{const p=resource.placements[pk];return p.target.kind==='local'?resource.contents[p.target.contentKey]:undefined;});
    const tokens = atoms.map(atom => {
      if(!atom)return '';
      if (atom.viewType === "text-cell") return escapeText(String(atom.payload.text));
      const src = String((atom.payload as Record<string, unknown>).src ?? ""), alt = escapeText(String((atom.payload as Record<string, unknown>).alt ?? "Image"));
      warn(c.payload.id, "image-projection", "Image appearance/metadata is not fully represented; no assets copied");
      return /^(https?:|data:image\/|\.\.?\/)/.test(src) && !/[\s()<>]/.test(src) ? `![${alt}](${src})` : `[Image: ${alt}]`;
    });
    const properties = Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties.filter(p => !p.isDeleted) : [];
    const supported: Array<{ start: number; end: number; open: string; close: string; body?: string }> = [];
    for (const raw of properties) {
      if(raw.isZeroWidth===true){warn(c.payload.id,'annotation-omitted','Zero-width annotation retained in native document');continue;}
      const local = c.payload.linkedAnnotations as any;
      const root = resource.placements[resource.rootPlacementKey];
      const registry = root.target.kind === "local" ? resource.contents[root.target.contentKey].payload.linkedAnnotations as any : local;
      const p = raw.annotationId && !raw.externalDefinition && registry?.[String(raw.annotationId)] ? { ...raw, ...registry[String(raw.annotationId)], start: raw.start, end: raw.end } : raw;
      const start = Number(p.start), end = Number(p.end);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= tokens.length) { warn(c.payload.id, "annotation-range", "Invalid annotation omitted"); continue; }
      if (p.type === "style/bold") supported.push({ start, end, open: "**", close: "**" });
      else if (p.type === "codex/block-reference") {
        const matches = targets.filter(t => t.blockId === p.value && (!p.metadata || !(p.metadata as any).documentId || t.documentId === (p.metadata as any).documentId));
        const t = matches.length === 1 ? matches[0] : undefined;
        if (t && t.path && !/[\[\]|\n\\]/.test(t.path)) {
          supported.push({ start, end, open: "[[", close: "]]", body: t.path });
          if ([...plain(key)].slice(start, end + 1).join("") !== t.path) warn(c.payload.id, "reference-label", "Wiki path projection differs from the native display label");
        } else warn(c.payload.id, "reference-unresolved", "No unique portable Document locator; label retained");
      } else warn(c.payload.id, "annotation-omitted", String(p.type));
    }
    supported.sort((a, b) => a.start - b.start || a.end - b.end);
    if (supported.some((p, i) => i > 0 && p.start <= supported[i - 1].end)) warn(c.payload.id, "annotation-overlap", "Overlapping Markdown annotations exported as plain text");
    else for (const p of supported.reverse()) tokens.splice(p.start, p.end - p.start + 1, p.open + (p.body ?? tokens.slice(p.start, p.end + 1).join("")) + p.close);
    return tokens.join("");
  };
  const visit = (pk: string): string => {
    if (--budget < 0) { warn(undefined, "traversal-limit", "Remaining graph omitted from Markdown"); return "[Projection limit]"; }
    const p = resource.placements[pk];
    if (p.target.kind === "external") {
      const t = p.target.reference; warn(t.targetId, p.kind === "owned" ? "owned-resource-link" : "external-reference", "Separate resource remains a link; its body is not exported recursively");
      const links = targets.filter(l => t.source.scope === "document" && l.documentId === t.source.resourceId && l.blockId === t.targetId);
      return links.length === 1 && !/[\[\]|\n\\]/.test(links[0].path) ? `[[${links[0].path}]]` : `[${p.kind === "owned" ? "Owned resource" : "Reference"}: ${escapeText(t.targetId)}]`;
    }
    const c = resource.contents[p.target.contentKey];
    if (seen.has(c.key)) { warn(c.payload.id, "repeat-reference", "Repeated/cyclic body represented once"); return `[Reference: ${escapeText(String(c.payload.id ?? c.viewType))}]`; }
    seen.add(c.key);
    const children = () => c.children.map(visit).filter(Boolean).join("\n\n");
    let text = "";
    if (c.viewType === "document-block" || c.viewType === "page-block") text = children();
    else if (c.viewType === "standoff-editor-block") {
      const bp = Array.isArray(c.payload.blockProperties) ? c.payload.blockProperties.filter(p => !p.isDeleted) : [];
      const h1 = bp.some(p => p.type === "block/font/size" && p.value === "h1" || p.type === "block/font/size/h1");
      if (bp.some(p => !(p.type === "block/font/size" && p.value === "h1" || p.type === "block/font/size/h1"))) warn(c.payload.id, "block-style", "Block presentation omitted");
      text = (h1 ? "# " : "") + inline(c.key); if (c.children.length) text += "\n\n" + children();
    } else if (c.viewType === "table-block") {
      const local = (pk: string) => { const p = resource.placements[pk]; return p.target.kind === "local" ? resource.contents[p.target.contentKey] : undefined; };
      const rows = c.children.map(pk => local(pk));
      const grid = rows.map(row => row?.viewType === "table-row-block" ? row.children.map(pk => local(pk)).map(cell => cell?.viewType === "table-cell-block" && cell.children.length === 1 ? local(cell.children[0]) : undefined) : []);
      const width = grid[0]?.length;
      const plainPayload = (node: typeof c | undefined) => node && !Object.keys(node.ownedRelations).length && !Object.keys(node.opaqueRelations).length && Object.entries(node.payload).every(([k, v]) => ["id", "type", "text"].includes(k) || v == null || (typeof v === "object" && !Object.keys(v).length));
      const simple = (c.payload.metadata as any)?.headerRows === 1 && width && rows.every(row => plainPayload(row) && !row!.inlineContent.length && row!.children.every(pk => { const cell = local(pk); return plainPayload(cell) && !cell!.inlineContent.length; })) && grid.every(row => row.length === width && row.every(cell => cell?.viewType === "standoff-editor-block" && plainPayload(cell) && !cell.children.length && !plain(cell.key).includes("\n") && cell.inlineContent.every(pk => { const atom = local(pk); return atom?.viewType === "text-cell" && plainPayload(atom); })));
      if (simple) {
        const lines = grid.map(row => `| ${row.map(cell => escapeText(plain(cell!.key))).join(" | ")} |`);
        lines.splice(1, 0, `| ${Array(width).fill("---").join(" | ")} |`); text = lines.join("\n");
      } else { warn(c.payload.id, "table-fallback", "No qualified rectangular plain-text header table; native rows/cells retained below"); text = "[Table]\n\n" + children(); }
    } else if (c.viewType === "image-block") {
      const meta = c.payload.metadata as any, src = String(meta?.url ?? c.payload.filename ?? ""), alt = escapeText(String(meta?.alt ?? "Image"));
      warn(c.payload.id, "image-projection", "Image layout/metadata remains native-only; assets are not copied");
      text = /^(https?:|\.\.?\/)/.test(src) && !/[\s()<>]/.test(src) ? `![${alt}](${src})` : `[Image: ${alt}]`;
      if (c.children.length) text += "\n\n" + children();
    } else {
      warn(c.payload.id, "block-fallback", c.viewType); text = `[${escapeText(c.viewType)}: ${escapeText(String(c.payload.id ?? ""))}]`;
      if (typeof c.payload.text === "string") text += "\n\n" + escapeText(c.payload.text);
      if (c.children.length) text += "\n\n" + children();
    }
    for (const [name, pk] of Object.entries(c.ownedRelations)) { warn(c.payload.id, "relation-layout", name); text += `\n\n[${escapeText(name)}]\n\n${visit(pk)}`; }
    if (Object.keys(c.opaqueRelations).length) warn(c.payload.id, "opaque-relations", "Opaque authored relations remain native-only");
    if (c.payload.metadata && Object.keys(c.payload.metadata as object).some(k => !["documentId", "headerRows"].includes(k))) warn(c.payload.id, "native-metadata", "Metadata is not fully represented by this Markdown profile");
    const known = new Set(["id", "type", "metadata", "standoffProperties", "blockProperties", "linkedAnnotations", "text"]);
    if (Object.keys(c.payload).some(k => !known.has(k))) warn(c.payload.id, "authored-payload", "Additional authored properties remain native-only");
    return text;
  };
  const text = visit(resource.rootPlacementKey).trimEnd() + "\n";
  const unplaced = Object.values(resource.contents).filter(c => c.definitionOwnerKey && !seen.has(c.key) && !["text-cell", "image-cell"].includes(c.viewType));
  if (unplaced.length) warn(undefined, "retained-definitions", `${unplaced.length} unplaced definitions remain in native storage`);
  return { profile: PROFILE, text, diagnostics };
}
