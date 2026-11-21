import {contentUnits,contentLength} from "../block-tree/inline-sequence";
import type { CanonicalRepository } from '../block-tree/repository';
import type { CanonicalResourceBoundaryResult } from '../block-tree/resource-boundary';
import type { RepositoryState, ContentRecord } from '../block-tree/types';
import { resourceSource } from '../block-tree/resource-identity';
import { collectFacts, type InlineFacts } from './collect-facts';
import { normalizePolicy, type ExtractionPolicy } from './policy';
import { WorkSlice, estimateBytes, yieldTask, type YieldControl } from './scheduler';
import type { TextRun } from '../runtime/search-matching';
export type BoundaryRepository = Pick<CanonicalRepository, 'readState' | 'readCanonicalResourceBoundaryCooperative' | 'isBoundaryCurrent' | 'subscribeChanges'>;
/** Stateless observation; subscription, eligibility and lifetime belong to the host. */
export async function observeLive(repository: BoundaryRepository, id: string, policy: ExtractionPolicy, options: {
    signal?: AbortSignal;
    check?: () => void;
    yieldControl?: YieldControl;
    boundary?: CanonicalResourceBoundaryResult;
} = {}) {
    const started = performance.now(), state = repository.readState(), revision = state.revision, pause = options.yieldControl ?? yieldTask;
    const check = () => { options.signal?.throwIfAborted(); options.check?.(); if (repository.readState() !== state || state.revision !== revision)
        throw Error('Stale canonical observation'); };
    check();
    const boundary = options.boundary ?? await repository.readCanonicalResourceBoundaryCooperative(id, { signal: options.signal, yieldControl: pause });
    check();
    if (boundary.status !== 'ready')
        throw Error(`Canonical boundary ${boundary.status}: ${boundary.reason}`);
    if (resourceSource(state.contents[boundary.rootContentKey])?.resourceId !== id)
        throw Error('Canonical boundary resource identity mismatch');
    const checked = () => { check(); if (!repository.isBoundaryCurrent(boundary.token))
        throw Error('Stale canonical boundary'); };
    const boundaryMs = performance.now() - started, work = new WorkSlice(checked, pause), local: RepositoryState = { revision, rootPlacementKey: boundary.rootPlacementKey, contents: Object.create(null), placements: Object.create(null) };
    const queue = [boundary.rootPlacementKey], seen = new Set<string>(), retained = boundary.retainedDefinitionKeys[Symbol.iterator](), originals = new Map<string, ContentRecord>();
    let retainedDone = false;
    const add = async (c: ContentRecord) => {
        if (seen.has(c.key))
            return;
        seen.add(c.key);
        // P1 has audited all Cells/ownership. The semantic helper context needs Block
        // ancestry, not an owner map for text Cells. Inline reads borrow the original
        // record below; this private context is never a resource/admission DTO.
        local.contents[c.key] = c.inlineKind === 'standoff' ? { ...c, inlineContent: [] } : c;
        if (c.inlineKind === 'standoff')
            originals.set(String(c.payload.id), c);
        for (let i = c.children.length - 1; i >= 0; i--) {
            await work.step();
            queue.push(c.children[i]);
        }
        for (const name in c.ownedRelations) {
            await work.step();
            if (Object.hasOwn(c.ownedRelations, name))
                queue.push(c.ownedRelations[name]);
        }
    };
    while (queue.length || !retainedDone) {
        await work.step();
        if (!queue.length) {
            const next = retained.next();
            if (next.done) {
                retainedDone = true;
                continue;
            }
            await add(state.contents[next.value]);
            continue;
        }
        const pk = queue.pop()!, p = state.placements[pk];
        if (!p)
            throw Error('Canonical placement disappeared');
        if (pk === boundary.rootPlacementKey) {
            local.placements[pk] = { ...p, kind: 'owned', resourceRegistration: undefined };
        }
        else if (p.externalReference || p.resolvedReference || p.kind === 'reference') {
            local.placements[pk] = p;
            continue;
        }
        else if (state.contents[p.contentKey]?.viewType === 'document-block') {
            const c = state.contents[p.contentKey];
            local.placements[pk] = { ...p, contentKey: `unresolved:${pk}`, externalReference: { kind: 'block', targetId: String(c.payload.id), source: resourceSource(c)!, version: { kind: 'unpinned' } } };
            continue;
        }
        else
            local.placements[pk] = p;
        await add(state.contents[p.contentKey]);
    }
    const contextMs = performance.now() - started - boundaryMs;
    const inline = async (blockId: string): Promise<InlineFacts> => {
        const c = originals.get(blockId);
        if (!c)
            throw Error('Missing canonical inline source');
        const runs: TextRun[] = [], parts: string[] = [];
        let run: string[] = [], boundaries = [0], units = 0, used = 0;
        let i=-1;
        for (const cell of contentUnits(state,c)) {
            i++;
            await work.step();
            if (cell.kind !== 'text') {
                runs.push({ text: run.join(''), boundaries });
                parts.push('[inline object]');
                run = [];
                boundaries = [i + 1];
                units = 0;
                continue;
            }
            const text = cell.text;
            used += text.length;
            if (used > 2000000)
                throw Error('Native text exceeds the bounded search budget');
            boundaries[units] = i;
            for (let j = 1; j < text.length; j++) {
                if (j % 256 === 0)
                    await work.step();
                boundaries[units + j] = -1;
            }
            units += text.length;
            boundaries[units] = i + 1;
            run.push(text);
            parts.push(text);
        }
        runs.push({ text: run.join(''), boundaries });
        checked();
        return { length: contentLength(c), text: { coordinate: 'cell', runs }, async snippet(start, end) { const result: string[] = []; for (let i = start; i < end; i++) {
                await work.step();
                result.push(parts[i]);
            } return result.join(''); } };
    };
    const t = performance.now(), phases = { textMs: 0, annotationsMs: 0 };
    const facts = await collectFacts(local, id, options.signal, inline, { extraction: normalizePolicy(policy), check: checked, timings: phases, step: () => work.step(), cloneValue: async (value) => { await estimateBytes(value, work, 256 * 1024); return structuredClone(value); } });
    work.finish();
    return { facts, revision, timings: { boundaryMs, contextMs, factsMs: performance.now() - t, ...phases, totalMs: performance.now() - started, maxSliceMs: work.maxSliceMs } };
}
