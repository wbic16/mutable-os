import { type InlineAtom } from '../../block-tree/inline-sequence';
import { promoteTeiRelationships } from './relationships';
import type { ExistingBlockDto, JsonObject } from '../../block-tree/types';
import { containerModes, textModes, validateTeiDeclarations } from './definitions';
import { Diagnostics, incompleteMessage, isTei, nodeText, TeiBudget, teiLimits, type TeiConversionOptions, type TeiLimits, type TeiNode } from './model';
import { decodeTei, parseTei } from './parse';
import { isReferenceAttribute, References, type TeiReference } from './references';
import { validateTeiDocument } from './validate';

type Block = ExistingBlockDto & { id: string; children?: Block[]; text?: string; standoffProperties?: JsonObject[] };
type Mark = { id: string; type: string; metadata?: JsonObject; linked: boolean };
interface Context {
  marks: Mark[]; unsupportedRelationContext?: boolean; preserve?: boolean; language?: string; base?: string; header?: boolean; textual?: boolean;
  headerRole?: 'title' | 'author'; titleStmt?: boolean; action?: JsonObject; correspondence?: JsonObject;
  actionRole?: string; dateRole?: string; section: number; textMode?: string;
}
const inlineRoles: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), { hi: 'highlight', emph: 'emphasis', foreign: 'foreign', name: 'name', persName: 'person-name', placeName: 'place-name', orgName: 'organisation-name', date: 'date', title: 'work-title', author: 'author', ref: 'reference' }));
const editorial: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), { add: 'addition', del: 'deletion', unclear: 'unclear', supplied: 'supplied', orig: 'original', reg: 'regularised', sic: 'sic', corr: 'correction', abbr: 'abbreviation', expan: 'expansion', lem: 'lemma', rdg: 'reading' }));
const richEditorial: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), { ...editorial, subst: 'substitution', surplus: 'surplus', gap: 'gap', damage: 'damage', restore: 'restoration', handShift: 'hand-shift' }));
const pointRoles: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), { pb: 'page-break', lb: 'line-break', cb: 'column-break', milestone: 'milestone', anchor: 'anchor', space: 'space' }));
const mentionKinds: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), { 'tei/person-name': 'person', 'tei/place-name': 'place', 'tei/organisation-name': 'org', 'tei/name': '*' }));
const relationContainers = ['TEI', 'teiHeader', 'fileDesc', 'profileDesc', 'particDesc', 'text', 'front', 'body', 'back', 'div', 'p', 'listRelation', 'listPerson', 'listOrg', 'listPlace', 'person', 'org', 'place'];
const structural = new Set(['TEI', 'p', ...Object.keys(containerModes), ...Object.keys(textModes), 'choice', 'app', 'fileDesc', 'titleStmt', 'publicationStmt', 'sourceDesc', 'profileDesc', 'particDesc', 'listPerson', 'person', 'listOrg', 'org', 'listPlace', 'place', 'revisionDesc', 'encodingDesc']);
const refs = new Set(['ref', 'target', 'corresp', 'who', 'ana', 'wit', 'facs', 'sameAs', 'next', 'prev', 'resp', 'source']);
const knownAttributes = new Set(['xml:id', 'xml:lang', 'xml:space', 'xml:base', 'type', 'subtype', 'n', 'rend', 'rendition', 'when', 'from', 'to', 'notBefore', 'notAfter', 'calendar', 'reason', 'cert', 'place', 'break', 'unit', 'quantity', ...refs]);

/** Ordinary deterministic software. All mutable state is private to this import. */
export function convertTei(source: string | Uint8Array, options: Partial<TeiLimits> = {}, filename = 'TEI document', timings?: Record<string, number>, conversion: TeiConversionOptions = {}) {
  return compileTei(source, options, filename, false, timings, conversion);
}
function compileTei(source: string | Uint8Array, options: Partial<TeiLimits>, filename: string, fragmentOperation: boolean, timings?: Record<string, number>, conversion: TeiConversionOptions = {}) {
  const rich = conversion.semanticSublimation !== false;
  const operational = rich && conversion.operationalSemantics !== false;
  const inlineAlternatives = rich && conversion.inlineAlternatives !== false;
  const editorialRoles = rich ? richEditorial : editorial;
  const roleId = (role: string) => rich ? `tei/${role}` : role;
  const alternative = (n: TeiNode) => isTei(n) && (['choice', 'app'].includes(n.name) || rich && n.name === 'rdgGrp');
  const eligibility = new WeakMap<TeiNode, boolean>(), preserveWhitespace = new WeakMap<TeiNode, boolean>();
  function eligible(n: TeiNode): boolean {
    if (!inlineAlternatives || !isTei(n) || !['choice', 'app'].includes(n.name)) return false;
    const cached = eligibility.get(n); if (cached !== undefined) return cached;
    const roles = n.name === 'choice' ? ['orig', 'reg', 'sic', 'corr', 'abbr', 'expan'] : ['lem', 'rdg'];
    const inline = (node: TeiNode): boolean => !node.recovery && isTei(node) &&
      (alternative(node) ? eligible(node) : !structural.has(node.name) && node.parts.every(p => typeof p === 'string' || inline(p)));
    const branches = n.parts.filter(p => typeof p !== 'string');
    const result = !n.attrs.from && !n.attrs.to && branches.length > 0 && n.parts.every(p => typeof p === 'string' ? !p.trim() && !preserveWhitespace.get(n) :
      isTei(p) && roles.includes(p.name) && !p.attrs.from && !p.attrs.to && inline(p));
    eligibility.set(n, result); return result;
  }
  const structuralNode = (n: TeiNode) => isTei(n) && (structural.has(n.name) || alternative(n)) && !eligible(n);
  let last = timings ? performance.now() : 0;
  const stage = (name: string) => { if (timings) { const now = performance.now(); timings[name] = now - last; last = now; } };
  validateTeiDeclarations();
  const limits = teiLimits(options), diagnostics = new Diagnostics(limits.diagnosticExamples);
  if (source instanceof Uint8Array && source.byteLength > limits.bytes) throw Error(`TEI input exceeds the configured ${limits.bytes}-byte limit. Nothing was imported.`);
  const decoded = typeof source === 'string' ? source : decodeTei(source, diagnostics);
  stage('xmlDecode');
  const parsed = parseTei(decoded, limits, diagnostics);
  stage('xmlParse');
  const rememberSpace = (node: TeiNode, inherited = false) => {
    const preserve = node.attrs['xml:space'] ? node.attrs['xml:space'] === 'preserve' : inherited;
    preserveWhitespace.set(node, preserve);
    for (const part of node.parts) if (typeof part !== 'string') rememberSpace(part, preserve);
  };
  rememberSpace(parsed.root);
  const references = new References(limits.references, diagnostics, rich), definitions: Record<string, JsonObject> = {};
  const headers: Block[] = [], content: Block[] = [], allText: Block[] = [];
  const lengths = new WeakMap<Block, number>(), spans = new WeakMap<Block, Map<string, JsonObject>>();
  const header = { titleBlockIds: [] as string[], authorBlockIds: [] as string[], correspondenceAnnotationIds: [] as string[] };
  let cells = 0, blocks = 0, properties = 0, truncated = parsed.truncated, exhausted = false, title = '', sourceId: string | undefined, sourceMetadata: JsonObject | undefined, milestoneOrder = 0;
  const id = () => crypto.randomUUID();
  const documentId = id();
  const propertyBudget = () => { if (++properties > limits.annotations) throw new TeiBudget('annotation budget'); };
  function block(type: string, extra: Partial<Block> = {}): Block {
    if (++blocks > limits.blocks) throw new TeiBudget('Block budget');
    return { id: id(), type, ...extra };
  }
  function context(n: TeiNode, parent: Context): Context {
    let base = parent.base;
    if (n.attrs['xml:base']) { try { base = parent.base ? new URL(n.attrs['xml:base'], parent.base).href : n.attrs['xml:base']; } catch { base = n.attrs['xml:base']; } }
    const unsupportedRelationContext = parent.unsupportedRelationContext || n.name !== 'relation' &&
      (!isTei(n) || !relationContainers.includes(n.name) || Object.keys(n.attrs).some(k => !['xmlns', 'xml:id', 'xml:lang', 'xml:base'].includes(k) && !k.startsWith('xmlns:')));
    return { ...parent, unsupportedRelationContext, preserve: n.attrs['xml:space'] ? n.attrs['xml:space'] === 'preserve' : parent.preserve,
      language: n.attrs['xml:lang'] ?? parent.language, base };
  }
  function metadata(n: TeiNode, ctx: Context, role: string): JsonObject {
    const fields: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(n.attrs)) {
      if (key === 'xmlns' || key.startsWith('xmlns:') || isReferenceAttribute(n, key, rich)) continue;
      fields[key] = value;
      if (!knownAttributes.has(key) && !(rich && ['extent', 'precision', 'scope', 'atLeast', 'atMost', 'confidence', 'agent', 'evidence', 'degree', 'status', 'medium', 'script', 'name', 'key'].includes(key))) diagnostics.add('unexpected-attribute', 'Unexpected attributes were retained as inert semantic fields.', `${n.name}/@${key}`);
    }
    const targets = references.collect(n, ctx.base);
    return { role: roleId(role), ...(rich ? { sourceElement: n.name } : {}), ...(Object.keys(fields).length ? { fields } : {}), ...(n.attrs['xml:id'] ? { sourceId: n.attrs['xml:id'] } : {}),
      ...(ctx.language ? { language: ctx.language } : {}), ...(targets.length ? { references: targets } : {}), ...(!isTei(n) ? { namespace: n.uri } : {}) };
  }
  function mark(type: string, meta: JsonObject, n?: TeiNode): Mark {
    propertyBudget(); const key = id(); definitions[key] = { id: key, type, metadata: meta };
    if (n) references.identify(n.attrs['xml:id'], { kind: 'definition', id: key, ...(type === 'tei/milestone' && meta.precision === 'block-context' ? { precision: 'block-context' as const } : {}) });
    return { id: key, type, metadata: meta, linked: true };
  }
  function segment(b: Block, m: Mark, start: number, end: number) {
    if (end < start) return;
    let map = spans.get(b); if (!map) spans.set(b, map = new Map());
    let p = map.get(m.id);
    if (p) { p.end = end; p.start = Math.min(Number(p.start), start); return; }
    propertyBudget(); p = { id: id(), type: m.type, start, end, ...(m.linked ? { annotationId: m.id } : {}), ...(operational && m.type === 'mutable/gloss' ? { metadata: { tei: { role: 'tei/definition' } } } : {}), ...(!m.linked && m.metadata ? { metadata: m.metadata } : {}) };
    map.set(m.id, p); (b.standoffProperties ??= []).push(p);
  }
  function point(b: Block, m: Mark) {
    propertyBudget(); const start = lengths.get(b)!;
    (b.standoffProperties ??= []).push({ id: id(), type: m.type, annotationId: m.id, start, end: start, isZeroWidth: true, ...(operational && m.type === 'mutable/gloss' ? { metadata: { tei: { role: 'tei/definition' } } } : {}) });
  }
  function identifyBlock(n: TeiNode, b: Block, ctx: Context, force = false) {
    references.identify(n.attrs['xml:id'], { kind: 'block', id: b.id });
    if (n.attrs['xml:id']) b.metadata = { ...(b.metadata as JsonObject ?? {}), sourceId: n.attrs['xml:id'] };
    if (exhausted) return; // Keep already recovered text when its budget was exhausted.
    const attrs = Object.keys(n.attrs).filter(k => k !== 'xmlns' && !k.startsWith('xmlns:'));
    if (!attrs.length && b.mode !== 'tei/generic' && !force) return;
    propertyBudget(); const meta = metadata(n, ctx, n.name);
    b.blockProperties = [{ id: id(), type: 'tei/semantic', metadata: meta }];
  }
  function semantic(n: TeiNode, ctx: Context): Mark[] {
    const role = isTei(n) ? editorialRoles[n.name] ?? inlineRoles[n.name] ?? n.name : n.name;
    const meta = metadata(n, ctx, role);
    if (n.name === 'date' && isTei(n)) meta.role = roleId(n.attrs.type ? `${n.attrs.type}-date` : ctx.actionRole === 'sent' ? 'sending-date' : ctx.actionRole === 'received' ? 'receiving-date' : ctx.textMode === 'tei/dateline' ? 'dateline-date' : ctx.dateRole ?? 'date');
    if (n.name === 'title' && ctx.titleStmt) meta.role = roleId('document-title');
    const type = isTei(n) && editorialRoles[n.name] ? 'tei/editorial' : rich && isTei(n) && n.name === 'relation' ? 'tei/relationship' : 'tei/semantic';
    if (rich && type === 'tei/editorial') {
      const parent = [...ctx.marks].reverse().find(m => m.type === 'tei/editorial');
      if (parent) meta.parentEditorialId = parent.id;
    }
    if (operational && type === 'tei/relationship') {
      if (ctx.unsupportedRelationContext) meta.unsupportedContext = true;
      if (n.parts.some(p => typeof p !== 'string' || p.trim())) meta.unsupportedContent = true;
    }
    const m = mark(type, meta, n), result = [m];
    if (ctx.action && isTei(n)) {
      const field = ['persName', 'orgName', 'name'].includes(n.name) ? 'participantAnnotationIds' : n.name === 'placeName' ? 'placeAnnotationIds' : n.name === 'date' ? 'dateAnnotationIds' : undefined;
      if (field) (ctx.action[field] as string[]).push(m.id);
    }
    if (isTei(n) && (n.name === 'hi' || n.name === 'emph')) {
      const rendition = n.name === 'emph' ? ['italic'] : (n.attrs.rend ?? '').split(/\s+/);
      for (const token of rendition) {
        const type = ({ italic: 'style/italics', italics: 'style/italics', bold: 'style/bold', underline: 'style/underline', superscript: 'style/superscript', subscript: 'style/subscript' } as Record<string, string>)[token];
        if (typeof type === 'string') result.push({ id: id(), type, linked: false });
        else if (token) diagnostics.add('rendition', 'Unsupported rendition was retained as a semantic field.', token);
      }
    }
    return result;
  }
  function hasBlocks(n: TeiNode): boolean { return n.parts.some(p => typeof p !== 'string' && (structuralNode(p) || hasBlocks(p))); }
  function flow(parts: Array<string | TeiNode>, ctx: Context, ensure = false): Block[] {
    const result: Block[] = []; let current: Block | undefined; let contextual: Mark[] = [];
    const textBlock = (active = ctx) => {
      if (!current) {
        current = block('standoff-editor-block', { text: '', ...(ctx.textMode ? { mode: ctx.textMode } : {}) });
        result.push(current); allText.push(current); lengths.set(current, 0);
        if (active.headerRole) header[active.headerRole === 'title' ? 'titleBlockIds' : 'authorBlockIds'].push(current.id);
      }
      return current;
    };
    const append = (value: string, active: Context) => {
      if (!value) return;
      const b = textBlock(active), start = lengths.get(b)!; let count = 0, cut = value.length;
      for (const ch of value) { if (cells + count >= limits.cells) { cut = 0; break; } count++; }
      if (!cut) { let offset = 0, kept = 0; for (const ch of value) { if (kept++ === count) break; offset += ch.length; } value = value.slice(0, offset); }
      if (b.inlineAtoms) { const atoms = b.inlineAtoms as InlineAtom[], last = atoms.at(-1); if (last?.kind === 'text') last.text += value; else atoms.push({ kind: 'text', text: value }); } else b.text += value; lengths.set(b, start + count); cells += count;
      for (const m of active.marks) segment(b, m, start, start + count - 1);
      for (const m of contextual) segment(b, m, 0, start + count - 1);
      if (!cut) throw new TeiBudget('text Cell budget');
    };
    const visit = (part: string | TeiNode, active: Context) => {
      if (typeof part === 'string') {
        if (!active.preserve && !active.textual && !part.trim() && (active.header || parts.some(p => typeof p !== 'string' && structuralNode(p)))) return;
        append(part, active); return;
      }
      let next = context(part, active);
      if (part.recovery) { current = undefined; contextual = []; append(nodeText(part), { ...next, marks: [] }); current = undefined; return; }
      if (rich && isTei(part) && pointRoles[part.name]) {
        const newline = part.name === 'lb' && part.attrs.break !== 'no';
        const m = mark('tei/milestone', { ...metadata(part, next, pointRoles[part.name]), precision: newline ? 'character' : 'point', order: milestoneOrder++ }, part);
        if (newline) append('\n', { ...next, marks: [...next.marks, m] });
        else point(textBlock(next), m);
        if (part.name === 'space') diagnostics.add('space-layout', 'Significant source space retains its exact position and dimensions; no measured visual space was invented.');
        if (part.parts.length) {
          diagnostics.add('milestone-content', 'Content inside a positional marker was retained after its boundary; layout is not inferred.', part.name);
          for (const child of part.parts) visit(child, next);
        }
        return;
      }
      if (isTei(part) && ['pb', 'lb', 'anchor'].includes(part.name)) {
        const exact = part.name === 'lb' && part.attrs.break !== 'no';
        const m = mark('tei/milestone', { ...metadata(part, next, part.name === 'lb' ? 'line-break' : part.name === 'pb' ? 'page-break' : 'anchor'), precision: exact ? 'character' : 'block-context', order: milestoneOrder++ }, part);
        if (exact) append('\n', { ...next, marks: [...next.marks, m] });
        else { contextual.push(m); if (current) segment(current, m, 0, lengths.get(current)! - 1); diagnostics.add('milestone-context', 'Positional markers retain Block context, not an exact live point.'); }
        return;
      }
      if (active.textual && eligible(part)) {
        const b = textBlock(next), at = lengths.get(b)!, names: string[] = [], owned: Record<string, Block> = {};
        const group = mark('tei/editorial', { ...metadata(part, next, part.name), selectionPolicy: 'tei/source-order' }, part);
        for (const branch of part.parts) {
          if (typeof branch === 'string') continue;
          const reading = flow([branch], { ...next, marks: [], textual: true, header: false, headerRole: undefined, textMode: undefined }, true)[0];
          if (!reading || exhausted) return;
          reading.inlineAtoms ??= reading.text ? [{ kind: 'text', text: reading.text }] : []; delete reading.text;
          const name = `inline-reading:${id()}`; names.push(name); owned[name] = reading;
          reading.metadata = { ...(reading.metadata as JsonObject ?? {}), name: branch.name, tei: { role: roleId(editorialRoles[branch.name] ?? branch.name), ordinal: names.length - 1 } };
        }
        if (++cells > limits.cells) throw new TeiBudget('text Cell budget');
        const atoms = (b.inlineAtoms ??= b.text ? [{ kind: 'text', text: b.text }] : []) as InlineAtom[]; delete b.text;
        b.relation = { ...b.relation, ...owned };
        atoms.push({ kind: 'alternative', properties: { version: 1, id: id(), readings: names, metadata: { tei: { ...group.metadata, annotationId: group.id } } } });
        lengths.set(b, at + 1);
        for (const m of [...next.marks, group]) segment(b, m, at, at);
        for (const m of contextual) segment(b, m, 0, at);
        return;
      }
      const isBlock = structuralNode(part) || alternative(part);
      if (isBlock || hasBlocks(part)) {
        finishMarkers(); current = undefined; contextual = [];
        // emit applies the element's context once. Passing `next` here would
        // resolve a relative xml:base a second time at structural boundaries.
        const emitted = emit(part, { ...active, textMode: undefined, textual: false }); result.push(...emitted); return;
      }
      if (!isTei(part) || !(inlineRoles[part.name] || editorialRoles[part.name] || rich && part.name === 'relation')) diagnostics.add('generic-element', 'Unsupported elements kept readable content and recognised descendants in native structures.', part.name);
      const own = semantic(part, next); next = { ...next, textual: true, marks: [...next.marks, ...own] };
      if (part.name === 'title' && active.titleStmt) { next.headerRole = 'title'; if (!title) title = nodeText(part).trim().slice(0, 200); }
      if (part.name === 'author' && active.header) next.headerRole = 'author';
      // Separate header fields without adding whitespace to actual mixed prose.
      if (next.header && (part.name === 'title' && active.titleStmt || part.name === 'author' || !!active.action)) { current = undefined; }
      const before = cells;
      for (const p of part.parts) visit(p, next);
      if (rich && cells === before) for (const m of own.filter(m => m.linked)) point(textBlock(next), m);
      if (next.header && (part.name === 'title' && active.titleStmt || part.name === 'author' || !!active.action)) current = undefined;
    };
    const finishMarkers = () => {
      if (contextual.length && (!current || !lengths.get(current))) {
        append('[Imported positional marker]', { ...ctx, marks: [] });
      }
    };
    try { for (const p of parts) { if (exhausted) break; visit(p, ctx); } if (!exhausted) {
      finishMarkers(); if (ensure && !result.length) textBlock();
      if (rich && ensure && current && !lengths.get(current)) for (const m of ctx.marks.filter(m => m.linked)) {
        if (!current.standoffProperties?.some(p => p.annotationId === m.id)) point(current, m);
      }
    } }
    catch (error) { if (!(error instanceof TeiBudget)) throw error; exhausted = true; truncated = true; diagnostics.add('truncated', `INCOMPLETE IMPORT: ${error.message} reached. Remaining source was omitted.`); }
    return result;
  }
  function emit(n: TeiNode, parent: Context): Block[] {
    const ctx = context(n, parent);
    if (n.recovery) return flow([n], ctx);
    if (isTei(n) && n.name === 'TEI') { sourceId ??= n.attrs['xml:id']; sourceMetadata ??= metadata(n, ctx, 'document'); if (!fragmentOperation) references.identify(n.attrs['xml:id'], { kind: 'block', id: documentId }); return flow(n.parts, ctx); }
    if (alternative(n)) {
      const group = block('container-block', { mode: 'tei/alternatives', children: [], ...(rich ? { metadata: { tei: { type: 'tei/alternatives', kind: roleId(n.name), selectionPolicy: 'tei/source-order' } } } : {}) }); identifyBlock(n, group, ctx, rich);
      const row = block('tab-row-block', { children: [] }); group.children!.push(row);
      const counts = new Map<string, number>();
      for (const part of n.parts) {
        if (exhausted) break;
        if (typeof part === 'string' && !part.trim() && !(rich && ctx.preserve)) continue;
        const label = typeof part === 'string' ? 'reading' : part.name, count = (counts.get(label) ?? 0) + 1; counts.set(label, count);
        if (rich && (typeof part === 'string' || !isTei(part) || !(editorialRoles[part.name] || ['choice', 'app', 'rdgGrp', 'note', 'witDetail'].includes(part.name)))) diagnostics.add('alternative-content', 'Unexpected alternative content was retained in source order as an editable tab.', label);
        row.children!.push(block('tab-block', { metadata: { name: label + (count > 1 ? ` ${count}` : ''), active: row.children!.length === 0,
          ...(rich ? { tei: { type: 'tei/alternative', role: roleId(typeof part === 'string' ? 'recovered-content' : isTei(part) ? editorialRoles[part.name] ?? part.name : 'foreign-content'), ordinal: row.children!.length } } : {}) }, children: flow([part], ctx, true) }));
      }
      if (!row.children!.length) row.children!.push(block('tab-block', { metadata: { name: 'Empty reading', active: true }, children: flow([], ctx, true) }));
      diagnostics.add('grouped-alternatives', 'Alternative readings are editable native tabs; inline placement is displayed as grouped content.'); return [group];
    }
    if (isTei(n) && (n.name === 'p' || textModes[n.name])) {
      const mode = textModes[n.name];
      const output = flow(n.parts, { ...ctx, textual: true, ...(mode ? { textMode: `tei/${mode}` } : {}) }, true);
      if (!output.length) return [];
      const compound = n.parts.some(p => typeof p !== 'string' && (structuralNode(p) || hasBlocks(p)));
      const b = !compound && output.length === 1 && output[0].type === 'standoff-editor-block' ? output[0] : block('container-block', { mode: 'tei/generic', children: output });
      identifyBlock(n, b, ctx);
      if (!exhausted && n.attrs.rend) for (const token of n.attrs.rend.split(/\s+/)) {
        if (['left', 'right', 'center', 'justify'].includes(token)) {
          propertyBudget(); b.blockProperties = [...(b.blockProperties as JsonObject[] ?? []), { id: id(), type: 'block/alignment', value: token }];
        } else if (token) diagnostics.add('block-rendition', 'Unsupported Block rendition was retained as semantic metadata.', token);
      }
      if (n.name === 'head') {
        const heading = output.find(b => b.type === 'standoff-editor-block');
        if (heading && !exhausted) { propertyBudget(); heading.blockProperties = [...(heading.blockProperties as JsonObject[] ?? []), { id: id(), type: 'block/font/size', value: `h${Math.min(6, Math.max(1, ctx.section))}` }]; }
      }
      return [b];
    }
    if (isTei(n) && (inlineRoles[n.name] || editorialRoles[n.name] || rich && n.name === 'relation')) return flow(n.parts, { ...ctx, textual: true, marks: [...ctx.marks, ...semantic(n, ctx)] }, true);
    const mode = isTei(n) ? containerModes[n.name] : undefined;
    const b = block('container-block', { mode: `tei/${mode ?? 'generic'}`, children: [] });
    let next = { ...ctx, textMode: undefined, section: ctx.section + (n.name === 'div' ? 1 : 0), titleStmt: n.name === 'titleStmt' || ctx.titleStmt, header: n.name === 'teiHeader' || ctx.header,
      dateRole: isTei(n) && n.name === 'publicationStmt' ? 'publication-date' : ctx.dateRole };
    if (isTei(n) && ['correspDesc', 'correspAction'].includes(n.name)) {
      const action = n.name === 'correspAction', meta: JsonObject = { ...metadata(n, ctx, n.attrs.type ?? (action ? 'unspecified-action' : 'correspondence')), ...(action ? { participantAnnotationIds: [], placeAnnotationIds: [], dateAnnotationIds: [] } : { actions: [] }) };
      const m = mark(action ? 'tei/correspAction' : 'tei/correspondence', meta, n);
      next.marks = [...ctx.marks, m];
      if (action) { (ctx.correspondence?.actions as string[] | undefined)?.push(m.id); next.action = meta; next.actionRole = n.attrs.type; }
      else { next.correspondence = meta; header.correspondenceAnnotationIds.push(m.id); }
    } else if (isTei(n) && ['person', 'org', 'place'].includes(n.name)) {
      const labelNode = n.parts.find(p => typeof p !== 'string' && ['persName', 'orgName', 'placeName'].includes(p.name));
      const label = (typeof labelNode === 'object' ? nodeText(labelNode) : n.attrs['xml:id'] ?? nodeText(n)).trim().slice(0, 200);
      const m = mark('mutable/gloss', { gloss: { version: 1, localId: id(), links: {} }, tei: { ...metadata(n, ctx, n.name), type: 'tei/entity', kind: n.name } }, n);
      definitions[m.id].value = `entity: ${label}`; next.marks = [...ctx.marks, m];
    } else identifyBlock(n, b, ctx);
    if (!mode && !structural.has(n.name)) diagnostics.add('generic-element', 'Unsupported elements kept readable content and recognised descendants in native structures.', n.name);
    b.children = flow(n.parts, next, operational && isTei(n) && ['person', 'org', 'place'].includes(n.name));
    if (isTei(n) && n.name === 'correspAction' && !b.children.length) b.children = flow([`[Imported ${n.attrs.type ?? 'unspecified'} action — participant not recorded]`], next, true);
    if (n.name === 'teiHeader' && isTei(n)) { headers.push(b); return []; }
    return [b];
  }
  const initial: Context = { marks: [], section: 0 };
  if (parsed.root.parts.some(p => typeof p !== 'string' && !p.uri)) diagnostics.add('unnamespaced-tei', 'Unnamespaced elements were interpreted using TEI names.');
  try { content.push(...flow(parsed.root.parts, initial)); }
  catch (error) { if (!(error instanceof TeiBudget)) throw error; truncated = true; diagnostics.add('truncated', `INCOMPLETE IMPORT: ${error.message}.`); }
  stage('semanticTraversalAndDtoConstruction');
  const reachable = new Set<string>([documentId]);
  const visitReachable = (b: Block) => { reachable.add(b.id); b.children?.forEach(visitReachable); Object.values(b.relation ?? {}).forEach(r => visitReachable(r as Block)); };
  [...content, ...headers].forEach(visitReachable);
  references.resolve(target => target.kind === 'definition' ? !!definitions[target.id] : reachable.has(target.id));
  // Local Entity mentions are additional genuine linked segments, never fake
  // canonical Entity references. All forward targets now have their final state.
  for (const b of allText) for (const p of [...b.standoffProperties ?? []]) {
    const def = definitions[String(p.annotationId)];
    const meta = def?.metadata as { role?: string; references?: TeiReference[] } | undefined;
    // An attribution, witness, relation participant or sameAs assertion is not
    // itself an Entity mention. Only explicit compatible naming references link.
    const mentionKind = meta?.role ? mentionKinds[meta.role] : undefined;
    const targets = meta?.references?.flatMap(r => !rich || mentionKind && r.attribute === 'ref' ? r.tokens.flatMap(t => {
      const target = t.target && definitions[t.target.id];
      const kind = ((target?.metadata as JsonObject | undefined)?.tei as JsonObject | undefined)?.kind;
      return t.state === 'resolved' && t.target && target?.type === 'mutable/gloss' && (!rich || mentionKind === '*' || mentionKind === kind) ? [t.target.id] : [];
    }) : []) ?? [];
    for (const target of new Set(targets)) {
      if (properties >= limits.annotations) { diagnostics.add('entity-link-limit', 'Local Entity links exceeded the annotation budget; semantic mentions and reference states remain.'); break; }
      propertyBudget(); b.standoffProperties!.push({ id: id(), type: 'mutable/gloss', annotationId: target, start: p.start, end: p.end, ...(operational ? { metadata: { tei: { role: 'tei/mention', sourceAnnotationId: p.annotationId } } } : {}), ...(p.isZeroWidth ? { isZeroWidth: true } : {}) });
    }
  }
  if (operational) {
    const { preserved } = promoteTeiRelationships(definitions);
    for (let i = 0; i < preserved; i++) diagnostics.add('relationship-preserved', 'Relationship assertions outside the supported unqualified local binary subset remain inspectable TEI records, without active edges.');
  }
  stage('referenceResolution');
  // Fixed, small assembly/notice reserve is outside source-content budgets.
  const fixed = (type: string, extra: Partial<Block> = {}): Block => ({ id: id(), type, ...extra });
  if (!content.length) content.push(fixed('standoff-editor-block', { text: '' }));
  const roots = headers.length ? [fixed('tab-row-block', { children: [fixed('tab-block', { metadata: { name: 'Text', active: true }, children: content }), fixed('tab-block', { metadata: { name: 'Metadata', active: false }, children: headers })] })] : content;
  if (truncated) roots.unshift(fixed('standoff-editor-block', { text: incompleteMessage, blockProperties: [{ id: id(), type: 'block/font/size', value: 'h2' }] }));
  const document: Block = fixed('document-block', { id: documentId, metadata: { documentId, title: title || filename.replace(/\.(tei|xml)$/i, ''),
    ...(rich ? { interchange: { provenance: { version: 1, filename: filename.split(/[\\/]/).at(-1)!, format: 'tei', converter: inlineAlternatives ? 'tei/native-inline-alternatives-v4' : operational ? 'tei/operational-semantics-v3' : 'tei/semantic-sublimation-v2' } } } : {}),
    tei: { version: 1, ...(rich ? { conversion: { type: 'tei/conversion', milestone: inlineAlternatives ? 4 : operational ? 3 : 2, alternativeSelection: 'tei/source-order', pointConvention: 'tei/equal-endpoints', references: 'tei/import-time-observation' } } : {}), ...(sourceId ? { sourceId } : {}), ...(sourceMetadata ? { source: sourceMetadata } : {}), header, truncated } }, linkedAnnotations: definitions, children: [fixed('page-block', { children: roots })] });
  stage('assembly');
  validateTeiDocument(document);
  stage('teiValidation');
  return { document, diagnostics: diagnostics.list(), truncated, stats: { cells, blocks, properties }, fragment: { roots, definitions } };
}

/** Explicit headless content operation; adoption of definitions is caller-owned. */
export function convertTeiFragment(source: string | Uint8Array, options: Partial<TeiLimits> = {}, conversion: TeiConversionOptions = {}) {
  const { fragment, diagnostics, truncated } = compileTei(source, options, 'TEI fragment', true, undefined, conversion);
  return { ...fragment, diagnostics, truncated };
}
