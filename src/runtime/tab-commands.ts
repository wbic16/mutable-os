import {prepareTabs,tabPanel,tabLabel,authoredTabOrientation} from '../block-tree/compound-authoring';
import { holdStructuralMedia, type StructuralMediaOccurrence } from './structural-media';
import { unwrap } from 'solid-js/store';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { BlockNode, ExistingBlockDto } from '../block-tree/types';
import type { TextRangeSnapshot } from './text-ranges';
import type { CompletionCandidate } from '../features/autocomplete/model';
import { isTabRow, tabOrientation, type TabOrientation } from '../block-tree/tab-orientation';
import { tabDocumentTarget } from '../rendering/document-tab-context';

export const tabCommands = [
  { id: 'tabs.create.vertical', syntax: 'tabs create vertical', label: 'Create vertical Tabs' },
  { id: 'tabs.create.horizontal', syntax: 'tabs create horizontal', label: 'Create horizontal Tabs' },
  { id: 'tabs.orientation.vertical', syntax: 'tabs orientation vertical', label: 'Vertical Tabs' },
  { id: 'tabs.orientation.horizontal', syntax: 'tabs orientation horizontal', label: 'Horizontal Tabs' },
  { id: 'tab.add', syntax: 'tab add', label: 'Add Tab' },
  { id: 'tab.rename', syntax: 'tab rename', label: 'Rename Tab' },
  { id: 'tab.move.before', syntax: 'tab move before', label: 'Move Tab before' },
  { id: 'tab.move.after', syntax: 'tab move after', label: 'Move Tab after' },
  { id: 'tab.delete', syntax: 'tab delete', label: 'Delete Tab' },
] as const;
type TabCommand = typeof tabCommands[number]['id'];
export interface TabCommandArgs { in?: TabOrientation; name?: string; targets?: string[]; invocation?: TextRangeSnapshot }
const queryText = (query: string) => query.length > 256 ? '\0' : query.trim().replace(/^\//, '');
export function isTabCommandQuery(query: string) { return /^tabs?(?:\s|$)/i.test(queryText(query)); }
/** A trailing selector is explicit: malformed/incomplete selectors never fall
 * back to the nearest row or become part of a renamed Tab's title. */
function tabQuery(query:string) {
  const text=queryText(query),match=/\s+--in(?:\s+(\S+))?$/iu.exec(text);
  const body=match?text.slice(0,match.index):text;
  const scope=match?.[1]?.toLowerCase();
  const valid=scope==='vertical'||scope==='horizontal';
  return {body,selector:!!match,scope:valid?scope as TabOrientation:undefined,
    invalid: /(?:^|\s)--in(?:\s|$)/iu.test(body) || !!match&&!valid};
}
export function parseTabCommand(query: string): { id: TabCommand; args?: TabCommandArgs } | undefined {
  const {body,scope,selector,invalid}=tabQuery(query);if(invalid)return;
  const rename = /^tab\s+rename(?:\s+(.+))?$/iu.exec(body);
  if (rename) return { id: 'tab.rename', args: { name: rename[1]?.trim(),...(scope?{in:scope}:{}) } };
  const spec = tabCommands.find(c => c.syntax === body.toLowerCase().replace(/\s+/g, ' '));
  if(!spec || selector&&spec.id.startsWith('tabs.create.'))return;
  return {id:spec.id,...(scope?{args:{in:scope}}:{})};
}
const parent = (e: ReactiveEditor, n: BlockNode) => e.projections.get(n.viewId)?.parentOf(n.key);
/** Nearest occurrence, stopping at the Document boundary (never its Flint host). */
export function tabLocation(e: ReactiveEditor, key: string, resolveTab = true, orientation?: TabOrientation) {
  let node = e.node(key), tab: BlockNode | undefined;
  while (node && node.viewType !== 'document-block') {
    if (isTabRow(node.viewType) && (!orientation || tabOrientation(node.payload.metadata) === orientation)) {
      if (resolveTab && !tab) tab = e.node(e.viewChildren[node.key] ?? '') ?? node.children.map(k => e.node(k)!).find(n => (n.payload.metadata as any)?.active) ?? e.node(node.children[0]);
      return { row: node, tab, hosted: resolveTab && (parent(e, node)?.viewType === 'flint-application-block' || node.children.some(k => !!tabDocumentTarget(e.node(k)?.payload.metadata))) };
    }
    if (['tab-block', 'document-tab-block'].includes(node.viewType)) tab = node;
    node = parent(e, node);
  }
}
const metadata = (node: BlockNode) => unwrap((node.payload.metadata ?? {}) as Record<string, unknown>);
function creationTargets(e: ReactiveEditor, key: string, args?: TabCommandArgs) {
  const keys = args?.targets ?? [key], nodes = keys.map(k => e.node(k));
  if (!nodes.length || nodes.some(n => !n || !e.blockSelection.eligible(n.key))) return;
  const owner = parent(e, nodes[0]!);
  if (!owner || nodes.some(n => n!.viewId !== nodes[0]!.viewId || parent(e, n!)?.key !== owner.key || !owner.children.includes(n!.key))) return;
  const unique = new Set(keys); if (unique.size !== keys.length) return;
  const ordered = nodes as BlockNode[];
  ordered.sort((a,b) => owner.children.indexOf(a.key) - owner.children.indexOf(b.key));
  const start = owner.children.indexOf(ordered[0].key);
  if (ordered.some((n,i) => owner.children[start+i] !== n.key)) return;
  return ordered;
}
export function tabCommandAvailable(e: ReactiveEditor, id: string, key: string, args?: TabCommandArgs): boolean {
  if (!e.features.verticalTabs || !e.node(key) || e.crossText.range() || e.mounts.get(key)?.composing || (e.selections.sets[key]?.items.length ?? 0) > 1) return false;
  if(args?.in !== undefined && args.in !== 'vertical' && args.in !== 'horizontal')return false;
  if (id.startsWith('tabs.create.')) return !args?.in && !!creationTargets(e, key, args);
  const at = tabLocation(e, key, !id.startsWith('tabs.orientation.'), args?.in); if (!at) return false;
  if (id.startsWith('tabs.orientation.')) return true;
  if (at.hosted) return false; // Document session open/close belongs to Flint's existing controls.
  if (id === 'tab.add') return true;
  if (!at.tab || !at.row.children.includes(at.tab.key)) return false;
  if (id === 'tab.rename') return !!args?.name?.trim() && args.name.length <= 256 && !/[\r\n]/.test(args.name);
  if (id === 'tab.delete') return true;
  const index = at.row.children.indexOf(at.tab.key);
  return id === 'tab.move.before' ? index > 0 : id === 'tab.move.after' && index < at.row.children.length - 1;
}
export function tabCommandCandidates(e: ReactiveEditor, key: string, query: string): CompletionCandidate[] {
  if (!e.features.verticalTabs) return [];
  const parts=tabQuery(query),parsed = parseTabCommand(query), q = parts.body.toLowerCase().replace(/\s+/g, ' ');
  const base = parseTabCommand(parts.body);
  return tabCommands.filter(c => parsed ? c.id === parsed.id : parts.selector && base ? c.id === base.id : c.syntax.startsWith(q)).map(c => {
    const args = parsed?.args, available = !parts.invalid && !(parts.selector&&!parsed) && e.commandRegistry.canExecute(c.id, { targetKey: key, args });
    return { id: c.id, name: `/${c.syntax}${c.id === 'tab.rename' ? ' '+(args?.name ?? base?.args?.name ?? '<name>') : ''}${parts.selector?' --in '+(parts.scope??'<horizontal|vertical>'):''}`, exact: !!parsed,
      reason: parts.invalid ? 'Complete --in horizontal or --in vertical' : available ? c.label+' · '+(args?.in?'nearest '+args.in+' TabRow':'nearest TabRow') : c.id === 'tab.rename' && !args?.name ? 'Enter a Tab name' : 'Unavailable at this Tab or Document boundary', disabled: !available };
  });
}
const block = (type: string, children: ExistingBlockDto[] = [], metadata?: Record<string, unknown>): ExistingBlockDto => ({ id: crypto.randomUUID(), type, children, ...(metadata ? { metadata } : {}) });
const paragraph = (): ExistingBlockDto => ({ id: crypto.randomUUID(), type: 'standoff-editor-block', text: '' });
interface Bookmark { view: string; placement: string; inline?: { anchor: number; head: number } }
/** One local canonical transaction, including literal removal; session-only focus history. */
export class TabOperations {
  private alive = true;
  private stop?: () => void;
  private stopBefore?: () => void;
  private recording?: { id?: string; media:StructuralMediaOccurrence[] };
  private history = new Map<string, { before?: Bookmark; after?: Bookmark; media:StructuralMediaOccurrence[] }>();
  constructor(private readonly editor: ReactiveEditor) {}
  private bookmark(node: BlockNode): Bookmark {
    const range = this.editor.mounts.get(node.key)?.captureInlineSelection?.();
    return { view: node.viewId, placement: node.placementKey, ...(range ? { inline: { anchor: range.anchor, head: range.head } } : {}) };
  }
  private restore(bookmark?: Bookmark) {
    if (!bookmark) return;
    const e = this.editor, revision = e.repository.state.revision;
    queueMicrotask(() => {
      if (!this.alive || e.repository.state.revision !== revision) return;
      const n = e.nodeForPlacementInView(bookmark.placement, bookmark.view); if (!n) return;
      e.surfaces.reveal(n.key); e.focus.request(n.key, { reason: 'tab-command' });
      const mount = e.mounts.get(n.key);
      if (bookmark.inline && mount) {
        mount.restoreInlineSelection?.(bookmark.inline);
        const actual = mount.captureInlineSelection?.();
        if (mount.inlineBoundary && (actual?.anchor !== bookmark.inline.anchor || actual.head !== bookmark.inline.head)) {
          const a = mount.inlineBoundary(bookmark.inline.anchor), b = mount.inlineBoundary(bookmark.inline.head);
          mount.root.ownerDocument.getSelection()?.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
        }
        e.selections.setPrimary(n.key,n.contentKey,n.viewId,bookmark.inline.anchor,bookmark.inline.head);
        e.setCaret(n.key,bookmark.inline.anchor === bookmark.inline.head ? bookmark.inline.head : undefined);
      }
    });
  }
  run(id: TabCommand, key: string, args?: TabCommandArgs) {
    const e = this.editor;
    if (!this.alive || !tabCommandAvailable(e,id,key,args)) throw Error('Tab command is unavailable at this target');
    const source = e.node(key)!, at = tabLocation(e,key,!id.startsWith('tabs.orientation.'),args?.in), targets = id.startsWith('tabs.create.') ? creationTargets(e,key,args)! : undefined;
    if (args?.invocation) {
      if (args.invocation.nodeKey !== key || source.viewType !== 'standoff-editor-block') throw Error('Command invocation belongs to another Block');
      e.textRanges.validate([args.invocation], 'cell');
    }
    // Inspect only affected Block subtrees and their indexed occurrences, never
    // character cells or unrelated Documents. Structural ambiguity retains the
    // established admission/projection fallback; live media additionally needs
    // the browser's state-preserving move primitive.
    const media:StructuralMediaOccurrence[] = [], seen = new Set<string>();
    const moving = !!targets || id.startsWith('tab.move.');
    const inspect = (node:BlockNode) => {
      if(seen.has(node.placementKey))return;seen.add(node.placementKey);
      for(const projection of e.projections.values()) {
        if(moving && projection.occurrenceCount(node.placementKey)>1)throw Error('A moved Block has multiple occurrences in one view');
        const occurrence=projection.nodeForPlacement(node.placementKey), mount=occurrence&&e.mounts.get(occurrence.key);
        if(mount?.composing)throw Error('Finish text composition before changing Tabs');
        if(moving && mount) {
          if(!e.features.reversibleBlocks)throw Error('Retained Block views are required for live Tab movement');
          if(mount.root.querySelector('iframe,video,audio')) {
            if(projection.occurrenceCount(node.placementKey)>1 || typeof (mount.root.ownerDocument.body as any).moveBefore!=='function')throw Error('This browser or shared occurrence cannot preserve live media during movement');
            media.push({view:occurrence!.viewId,placement:occurrence!.placementKey,content:occurrence!.contentKey});
          }
        }
      }
      [...node.children,...Object.values(node.ownedRelations)].forEach(k=>inspect(e.node(k)!));
    };
    if(targets)targets.forEach(inspect);
    if(id.startsWith('tab.move.')||id==='tab.delete')inspect(at!.tab!);
    const manageFocus = !!args?.invocation || !!targets || id === 'tab.add' || id === 'tab.delete' || id.startsWith('tab.move.');
    if(manageFocus)this.stopBefore ??= e.repository.subscribeBeforeChanges((_label,cause)=>{
      const affected=cause?.kind==='undo'||cause?.kind==='redo'?this.history.get(cause.sourceCommitId)?.media:this.recording?.media;
      if(affected?.length)holdStructuralMedia(e,affected,'tabMediaParking');
    });
    if(manageFocus)this.stop ??= e.repository.subscribeChanges(change => {
      if (!change.commit) return;
      const cause = change.commit.cause;
      if (cause?.kind === 'undo' || cause?.kind === 'redo') this.restore(this.history.get(cause.sourceCommitId)?.[cause.kind === 'undo' ? 'before' : 'after']);
      else if (this.recording) this.recording.id = change.commit.id;
    });
    const focused = manageFocus && e.node(e.focus.state.focusedKey ?? '');
    const before = manageFocus ? this.bookmark(args?.invocation ? source : focused && focused.viewId === source.viewId ? focused : source) : undefined;
    let after: Bookmark | undefined = before && { ...before, ...(before.inline ? { inline: { ...before.inline } } : {}) };
    if (args?.invocation && after?.inline) after.inline = { anchor: args.invocation.start, head: args.invocation.start };
    let focusPlacement: string | undefined;
    const recording: {id?:string;media:StructuralMediaOccurrence[]} = this.recording = {media};
    try {
      e.commands.structuralTransaction(tabCommands.find(c=>c.id===id)!.label, () => {
        if (args?.invocation) e.commands.replaceInlineRange(key,args.invocation.start,args.invocation.end,'');
        if (targets) {
          const row = e.commands.insert(prepareTabs([{label:'Tab 1',content:[]}],id.endsWith('vertical')?'vertical':'horizontal'),{kind:'before',anchorKey:targets[0].key});
          const tab = e.commands.childrenOf(row)[0];
          targets.forEach((node,index)=>e.commands.move(node.key,{kind:'at',parentKey:tab,index}));
        } else if (id.startsWith('tabs.orientation.')) {
          const orientation = authoredTabOrientation(id.endsWith('vertical') ? 'vertical' : 'horizontal');
          if (metadata(at!.row).orientation !== orientation) e.commands.setPayloadField(at!.row.key,'metadata',{...metadata(at!.row),orientation});
        } else if (id === 'tab.rename') e.commands.setPayloadField(at!.tab!.key,'metadata',{...metadata(at!.tab!),name:tabLabel(args!.name)});
        else if (id === 'tab.add') {
          const row = at!.row;
          row.children.forEach(k=>{const n=e.node(k)!;if(metadata(n).active)e.commands.setPayloadField(k,'metadata',{...metadata(n),active:false});});
          const tab = e.commands.insert(tabPanel(`Tab ${row.children.length+1}`,[paragraph()],row.viewType === 'document-tab-row-block'),{kind:'at',parentKey:row.key,index:row.children.length});
          focusPlacement = e.commands.childrenOf(tab)[0];
          if (row.viewType === 'document-tab-row-block') focusPlacement=e.commands.childrenOf(focusPlacement)[0];
        } else if (id.startsWith('tab.move.')) {
          const index = at!.row.children.indexOf(at!.tab!.key), sibling = at!.row.children[index+(id.endsWith('before')?-1:1)];
          e.commands.move(at!.tab!.key,{kind:id.endsWith('before')?'before':'after',anchorKey:sibling});
        } else {
          const row = at!.row, tab = at!.tab!, siblings = row.children.filter(k=>k!==tab.key);
          if (siblings.length) {
            e.commands.remove(tab.key); const next=e.node(siblings[0])!;
            siblings.forEach(k=>{const n=e.node(k)!;e.commands.setPayloadField(k,'metadata',{...metadata(n),active:k===next.key});});
            focusPlacement = next.placementKey;
          } else {
            focusPlacement=e.commands.insert(paragraph(),{kind:'before',anchorKey:row.key});e.commands.remove(row.key);
          }
        }
      },{commandId:id,subjects:[{contentKey:source.contentKey,placementKey:source.placementKey}]});
    } finally { this.recording=undefined; }
    if (focusPlacement) {
      let n=e.nodeForPlacementInView(focusPlacement,source.viewId);
      while(n && n.viewType!=='standoff-editor-block' && n.children[0])n=e.node(n.children[0]);
      after=n?{view:n.viewId,placement:n.placementKey,inline:n.viewType==='standoff-editor-block'?{anchor:0,head:0}:undefined}:undefined;
    }
    if(recording.id && manageFocus)this.history.set(recording.id,{before,after,media});
    e.blockSelection.clear();
    if(args?.invocation || targets || focusPlacement || id.startsWith('tab.move.'))this.restore(after);
  }
  dispose(){this.alive=false;this.stop?.();this.stopBefore?.();this.history.clear();}
}
export function registerTabCommands(e: ReactiveEditor) {
  for(const spec of tabCommands)e.commandRegistry.register<TabCommandArgs|undefined>({id:spec.id,label:spec.label,
    canExecute:({targetKey,args})=>tabCommandAvailable(e,spec.id,targetKey,args),
    execute:({targetKey,args})=>e.tabs.run(spec.id,targetKey,args),
  },'tabs');
}
