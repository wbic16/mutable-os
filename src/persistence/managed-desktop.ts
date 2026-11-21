import { validateLayout, type LayoutNode } from "../runtime/window-layout.js";
/** Shared client/server D0 wire contract. No editor, DOM, runtime identities or I/O. */
export interface RestoreView {
    restoreKey: string;
    anchorBlockId: string;
    appId: string;
    descriptorVersion: number;
    persistence: 'anchor';
    resources: Array<Record<string, unknown>>;
    [key: string]: unknown;
}
export interface RestoreWindow {
    restoreKey: string;
    view: string;
    layer: 'normal' | 'pinned';
    state: 'normal' | 'minimized' | 'maximized' | 'closed';
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface NamedArrangement {
    id: string; name: string; revision: number;
    windows: RestoreWindow[]; layout: ManagedDesktop["layout"];
    lastActive?: string;
    [key: string]: unknown;
}
export interface ManagedDesktop {
    version: 2 | 3 | 4;
    kind: 'managed-windows';
    layouts?: NamedArrangement[];
    activeLayout?: string;
    lastActive?: string;
    views: RestoreView[];
    windows: RestoreWindow[];
    layout: {
        kind: 'floating' | 'split-tree';
        version?: 1;
        tree?: LayoutNode;
        floating?: string[];
        normalOrder: string[];
        pinnedOrder: string[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export class ManagedWorkspaceError extends Error {
    constructor(message: string) { super(message); this.name = 'ManagedWorkspaceError'; }
}
const fail = (message: string): never => { throw new ManagedWorkspaceError(message); };
export const object = (v: any): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : fail('Expected a workspace object.');
const identity = (v: any) => typeof v === 'string' && v.trim() && v.length <= 512 ? v : fail('Invalid durable identity.');
const list = (v: any): any[] => Array.isArray(v) ? v : fail('Expected a workspace list.');
const finite = (v: any, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail('Invalid floating bounds.');
const runtimeFields = new Set(['runtimeWindowId', 'nodeKey', 'projection', 'modalStack', 'focusLease', 'pendingOperations', 'pendingOperation', 'draft', 'unsavedDraft', 'pendingReceipt', 'surfaceId', 'anchorLease']);
/** Reject cycles/non-JSON input before recursion/cloning; unknown JSON fields survive. */
export function assertJson(value: unknown, rejectRuntime = false) {
    const ancestors = new Set<object>();
    let count = 0;
    const walk = (v: any, depth: number) => {
        if (++count > 1000000 || depth > 256)
            fail('Workspace exceeds validation limits.');
        if (v === null || typeof v === 'string' || typeof v === 'boolean')
            return;
        if (typeof v === 'number') {
            if (!Number.isFinite(v))
                fail('Non-finite workspace value.');
            return;
        }
        if (typeof v !== 'object')
            fail('Workspace must contain JSON values only.');
        if (ancestors.has(v))
            fail('Cyclic workspace data.');
        ancestors.add(v);
        for (const [key, item] of Object.entries(v)) {
            if (rejectRuntime && runtimeFields.has(key))
                fail(`Runtime-only field ${key} cannot be persisted.`);
            walk(item, depth + 1);
        }
        ancestors.delete(v);
    };
    walk(value, 0);
}
export function validateManagedDesktop(value: unknown): ManagedDesktop {
    assertJson(value, true);
    const d = object(value);
    if (![2,3,4].includes(d.version) || d.kind !== 'managed-windows')
        fail('Unsupported managed Desktop version.');
    for (const field of [...(d.version < 4 ? ['layouts', 'activeLayout'] : []), 'tree', 'tabs', 'docks'])
        if (field in d)
            fail('This Desktop layout requires a later milestone.');
    const views = new Map<string, any>(), anchors = new Set<string>(), windows = new Map<string, any>();
    for (const raw of list(d.views)) {
        const v = object(raw), key = identity(v.restoreKey), anchor = identity(v.anchorBlockId);
        if (!/^view-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) || views.has(key) || anchors.has(anchor) || key === anchor)
            fail('Duplicate or invalid view restore identity/anchor.');
        identity(v.appId);
        if (!Number.isInteger(v.descriptorVersion) || v.descriptorVersion < 1)
            fail('Invalid app descriptor version.');
        if (v.persistence !== 'anchor' || 'initialState' in v)
            fail('D0 persists anchor descriptors, not application session state.');
        for (const raw of list(v.resources)) {
            const r = object(raw);
            if (r.kind === 'document') {
                if (r.scope !== 'workspace')
                    fail('Document reference needs workspace scope.');
                identity(r.documentId);
            }
            else if (r.kind === 'proposition') {
                if(d.version < 4 || r.cavernId !== undefined) identity(r.cavernId);
                else if(r.scope!=='vault')fail('Proposition reference needs explicit vault scope.');
                identity(r.vaultGuid);
                identity(r.entityGuid);
            }
            else if (d.version < 4)
                fail('Unsupported resource reference.');
            else identity(r.kind);
        }
        views.set(key, v);
        anchors.add(anchor);
    }
    const usedViews = new Set<string>();
    for (const raw of list(d.windows)) {
        const w = object(raw), key = identity(w.restoreKey);
        if (!/^window-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) || windows.has(key) || views.has(key) || anchors.has(key))
            fail('Duplicate or invalid window restore identity.');
        if (!views.has(w.view) || usedViews.has(w.view))
            fail('Missing or multiply-owned view descriptor.');
        usedViews.add(w.view);
        if (!['normal', 'pinned'].includes(w.layer) || !['normal', 'minimized', 'maximized', 'closed'].includes(w.state))
            fail('Invalid window layer/state.');
        const b = object(w.bounds);
        finite(b.x, -1e9, 1e9);
        finite(b.y, -1e9, 1e9);
        finite(b.width, 1, 1e6);
        finite(b.height, 1, 1e6);
        windows.set(key, w);
    }
    if (usedViews.size !== views.size)
        fail('Orphan view descriptor.');
    const layout = object(d.layout);
    if (d.version === 2 && (layout.kind !== 'floating' || 'tree' in layout || 'tabs' in layout)) fail('Only the D0 floating layout is supported.');
    if (d.version >= 3) {
        if (layout.kind !== 'split-tree' || layout.version !== 1) fail('Unsupported shell layout version.');
        let tiled = new Set<string>();
        try { tiled = validateLayout(layout.tree, new Set(windows.keys())); }
        catch (error) { fail(error instanceof Error ? error.message : 'Invalid shell layout.'); }
        const placed = new Set(tiled);
        for (const key of tiled) if (windows.get(key).layer !== 'normal' || windows.get(key).state === 'closed') fail('Pinned or closed windows cannot occupy a tile slot.');
        for (const key of list(layout.floating)) { if (!windows.has(key) || placed.has(key)) fail('Invalid floating/tiled membership.'); placed.add(key); }
        if (placed.size !== windows.size) fail('Every window needs one floating or tiled membership.');
    }
    const ordered = new Set<string>();
    for (const layer of ['normal', 'pinned'])
        for (const key of list(layout[layer + 'Order'])) {
            if (!windows.has(key) || windows.get(key).layer !== layer || ordered.has(key))
                fail('Invalid, duplicate or mis-layered floating membership.');
            ordered.add(key);
        }
    if (ordered.size !== windows.size)
        fail('Every window must have exactly one floating membership.');
    if (d.lastActive !== undefined) identity(d.lastActive); // A stale focus hint falls back to the last eligible window.
    if (d.version === 4) {
        const names = new Set<string>(), ids = new Set<string>();
        for (const raw of list(d.layouts)) {
            const a = object(raw), id = identity(a.id), name = identity(a.name);
            if (!id.startsWith('arrangement-') || ids.has(id) || names.has(name.trim().toLocaleLowerCase()) || !Number.isSafeInteger(a.revision) || a.revision < 1) fail('Invalid or duplicate named arrangement.');
            ids.add(id); names.add(name.trim().toLocaleLowerCase());
            const members = list(a.windows);
            for (const w of members) if (!windows.has(w.restoreKey) || windows.get(w.restoreKey).view !== w.view) fail('Arrangement refers to an unknown window/view.');
            // Reuse the complete geometry/tree/order validator for each snapshot.
            validateManagedDesktop({version: 3, kind: 'managed-windows', views: d.views.filter((v:any)=>members.some(w=>w.view===v.restoreKey)).map((v:any)=>({...v,resources:[]})), windows: members, layout:a.layout, ...(a.lastActive ? {lastActive:a.lastActive} : {})});
        }
        if (d.activeLayout !== undefined && !ids.has(d.activeLayout)) fail('Unknown selected arrangement.');
    }
    return structuredClone(d) as ManagedDesktop;
}
/** Traverse owned shell anchors only. Document contents remain a separate identity domain. */
export function shellWindows(root: any): any[] {
    const result: any[] = [];
    const walk = (b: any) => {
        object(b);
        if (['document-block', 'main-list-block', 'membrane-block', 'document-reference-block'].includes(b.type))
            return;
        if (['window-block', 'document-window-block'].includes(b.type)) {
            result.push(b);
            return;
        }
        if (b.children !== undefined && b.children !== null)
            list(b.children).forEach(walk);
        for (const [name, child] of Object.entries(b.relation ?? {}))
            if (name === 'leftMargin' || name === 'rightMargin' || name.startsWith('superposition:'))
                walk(child);
    };
    walk(root);
    return result;
}
export function desktopOf(root: any): ManagedDesktop | undefined {
    const desktop = root?.metadata?.workspacePresentation?.presentations?.desktop;
    return desktop?.kind === 'managed-windows' || desktop?.version === 2 ? validateManagedDesktop(desktop) : undefined;
}
export function validateManagedContainer(value: unknown): Record<string, any> {
    assertJson(value);
    const container = object(value);
    if (!['speedy-workspace', 'speedy-local-workspace'].includes(container.kind) || container.schemaVersion !== 2)
        fail('Unsupported managed Workspace container/version.');
    identity(container.workspaceId);
    const root = object(container.root);
    if (root.type !== 'workspace-block')
        fail('Invalid Workspace root.');
    const presentation = object(root.metadata?.workspacePresentation);
    if (presentation.version !== 1)
        fail('Unsupported Workspace presentation envelope.');
    const d = validateManagedDesktop(presentation.presentations?.desktop);
    const anchors = new Map<string, any>();
    for (const b of shellWindows(root)) {
        identity(b.id);
        if (anchors.has(b.id))
            fail('Ambiguous shell Block identity.');
        anchors.set(b.id, b);
    }
    if (anchors.size !== d.views.length)
        fail('Desktop descriptors do not cover the shell anchors.');
    const documents = new Set<string>();
    const blockIds = new Map<string, number>();
    const resourceIds = new Set<string>();
    const inspect = (b: any) => {
        object(b);
        if (typeof b.id === "string") blockIds.set(b.id, (blockIds.get(b.id) ?? 0) + 1);
        if (typeof b.metadata?.documentId === "string") resourceIds.add(b.metadata.documentId);
        if (b.type === 'document-reference-block' && container.kind === 'speedy-local-workspace')
            fail('Local managed Workspaces must be self-contained.');
        if (['document-block', 'main-list-block', 'membrane-block'].includes(b.type)) {
            const id = b.metadata?.documentId ?? b.id;
            if (id !== undefined)
                documents.add(identity(id));
        }
        if (b.children)
            list(b.children).forEach(inspect);
        for (const [name, child] of Object.entries(b.relation ?? {}))
            if (['leftMargin', 'rightMargin'].includes(name) || name.startsWith('superposition:'))
                inspect(child);
    };
    inspect(root);
    if (container.kind === 'speedy-workspace') for (const id of Object.keys(object(container.documents))) resourceIds.add(id);
    for (const key of [...d.views.map(v => v.restoreKey), ...d.windows.map(w => w.restoreKey)]) {
        if (blockIds.has(key) || resourceIds.has(key) || key === container.workspaceId) fail('Restore identity collides with a Block, Document or Workspace identity.');
    }
    for (const v of d.views) {
        const anchor = anchors.get(v.anchorBlockId);
        if (!anchor || blockIds.get(v.anchorBlockId) !== 1)
            fail('Missing Desktop anchor.');
        if (d.version < 4 && (v.descriptorVersion !== 1 || v.appId !== appForAnchor(anchor)))
            fail('Unsupported or mismatched application descriptor.');
        for (const r of v.resources) {
            if (r.kind === 'proposition' && d.version < 4)
                fail('Proposition reopening descriptors are not supported by D0.');
            if (d.version < 4 && r.kind === 'document' && (container.kind === 'speedy-workspace' ? !Object.hasOwn(object(container.documents), String(r.documentId)) : !documents.has(String(r.documentId))))
                fail('Missing Document resource entry.');
            if ([r.documentId,r.entityGuid,r.vaultGuid].some(id=>id!==undefined && (d.views.some(v=>v.restoreKey===id)||d.windows.some(w=>w.restoreKey===id))))
                fail('Restore identities must be distinct from resource identities.');
        }
    }
    return structuredClone(container);
}
/** D0 resolves existing anchors only. Unknown app versions are refused, never reinterpreted. */
export function applyManagedDesktop(root: any): any {
    const result = structuredClone(root), d = desktopOf(result);
    if (!d)
        return result;
    const anchors = new Map(shellWindows(result).map(b => [b.id, b]));
    const closed: string[] = [], order = [...d.layout.normalOrder, ...d.layout.pinnedOrder];
    for (const v of d.views) {
        if (d.version < 4 && (v.descriptorVersion !== 1 || !['ink', 'flint', 'quill', 'thesis', 'phosphor', 'viewer'].includes(v.appId)))
            fail('Unsupported application descriptor; the Workspace was not opened.');
        const b = anchors.get(v.anchorBlockId), w = d.windows.find(w => w.view === v.restoreKey)!;
        if (!b)
            fail('Missing Desktop anchor.');
        const expected = appForAnchor(b);
        if (d.version < 4 && v.appId !== expected)
            fail('Application descriptor does not match its anchor.');
        b.metadata = { ...b.metadata, position: { x: w.bounds.x, y: w.bounds.y }, size: { w: w.bounds.width, h: w.bounds.height }, pinned: w.layer === 'pinned', state: w.state === 'closed' ? 'normal' : w.state, zIndex: order.indexOf(w.restoreKey) + 1 };
        if (w.state === 'closed')
            closed.push(`block:${b.id}`);
    }
    result.metadata = { ...result.metadata, workspaceViewVisibility: { ...result.metadata?.workspaceViewVisibility, version: 1, closed } };
    return result;
}
export function appForAnchor(block: any): string {
    const type = block.children?.[0]?.type;
    return type === 'quill-application-block' ? 'quill' : type === 'thesis-application-block' ? 'thesis' : type === 'flint-application-block' ? 'flint' : type === 'phosphor-screen-block' ? 'phosphor' : block.type === 'document-window-block' ? 'ink' : 'viewer';
}
/** Pure explicit upgrade. Allocation is supplied by the session; input is never mutated. */
export function importLegacyDesktop(root: any, allocate: (block: any, index: number) => {
    anchor: string;
    view: string;
    window: string;
}, previous?: ManagedDesktop): any {
    assertJson(root);
    const result = structuredClone(root), views: RestoreView[] = [], windows: RestoreWindow[] = [];
    const blocks = shellWindows(result), ids = new Set<string>();
    blocks.forEach((b, i) => {
        const keys = allocate(b, i);
        if (ids.has(keys.anchor))
            fail('Ambiguous shell Block identity.');
        ids.add(keys.anchor);
        b.id = keys.anchor;
        const oldView = previous?.views.find(v => v.anchorBlockId === keys.anchor), oldWindow = previous?.windows.find(w => w.view === oldView?.restoreKey), m = b.metadata ?? {};
        const view = { ...oldView, restoreKey: oldView?.restoreKey ?? keys.view, anchorBlockId: keys.anchor, appId: oldView?.appId ?? appForAnchor(b), descriptorVersion: oldView?.descriptorVersion ?? 1, persistence: 'anchor' as const, resources: oldView?.resources ?? [] };
        const document = b.children?.find((child: any) => ['document-block', 'document-reference-block'].includes(child.type));
        const documentId = document?.metadata?.documentId ?? document?.id;
        if (documentId && (!oldView || oldView.descriptorVersion === 1 && oldView.appId === appForAnchor(b) && oldView.resources.every(r=>r.kind==='document')))
            view.resources = [{ ...view.resources.find(r => r.kind === 'document' && r.documentId === documentId), kind: 'document', scope: 'workspace', documentId }];
        views.push(view);
        windows.push({ ...oldWindow, restoreKey: oldWindow?.restoreKey ?? keys.window, view: view.restoreKey, layer: m.pinned === true ? 'pinned' : 'normal', state: ['minimized', 'maximized', 'closed'].includes(m.state) ? m.state : 'normal', bounds: { ...oldWindow?.bounds, x: m.position?.x ?? 20, y: m.position?.y ?? 20, width: m.size?.w ?? 840, height: m.size?.h ?? 620 } });
    });
    const ordered = windows.map((w, i) => ({ w, z: Number(blocks[i].metadata?.zIndex) || 0, i })).sort((a, b) => a.z - b.z || a.i - b.i);
    const baseLayout = { ...previous?.layout }; delete baseLayout.tree; delete baseLayout.floating; delete baseLayout.version;
    const base = { ...previous }; delete base.layouts; delete base.activeLayout; delete base.lastActive;
    const desktop = validateManagedDesktop({ ...base, version: previous?.version === 4 ? 4 : 2, kind: 'managed-windows', views, windows, ...(previous?.version === 4 ? {layouts: []} : {}), layout: { ...baseLayout, kind: previous?.version === 4 ? 'split-tree' : 'floating', ...(previous?.version === 4 ? {version:1, floating:windows.map(w=>w.restoreKey)} : {}), normalOrder: ordered.filter(x => x.w.layer === 'normal').map(x => x.w.restoreKey), pinnedOrder: ordered.filter(x => x.w.layer === 'pinned').map(x => x.w.restoreKey) } });
    const p = result.metadata?.workspacePresentation;
    if (p !== undefined && (p.version !== 1 || p.presentations?.desktop && p.presentations.desktop.kind !== 'legacy-tree' && p.presentations.desktop.kind !== 'managed-windows'))
        fail('Cannot upgrade an unsupported presentation.');
    result.metadata = { ...result.metadata, workspacePresentation: { ...(p ?? { version: 1, active: 'desktop', objects: [], presentations: {} }), presentations: { ...p?.presentations, desktop } } };
    return result;
}
