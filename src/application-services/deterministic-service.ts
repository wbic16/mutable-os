import { academicIdentifier } from '../academic/identifiers';
import type { AcademicIdentifier } from '../academic/identifiers';
import type { AcademicCapture } from '../academic/model';
import type { Executor, JobStorage, JobRecord } from './capabilities';
import { object, jobId } from './validation';
import { httpsUrl } from '../iiif/model';
import type { DeterministicOperations, DeterministicResult } from './deterministic-contracts';
interface Ports {
  acquireXml: (
    source: string,
    signal: AbortSignal
  ) => Promise<{
    bytes: Uint8Array;
    endpoint: string;
    secondary?: Uint8Array;
    discovery?: Uint8Array[];
  }>;
  knowledge?: (request: any, signal?: AbortSignal) => Promise<any>;
  cavernId: string;
  jobs: JobStorage;
  executor: Executor;
  acquire: (
    id: AcademicIdentifier,
    signal: AbortSignal
  ) => Promise<{
    bytes: Uint8Array;
    endpoint: string;
    secondary?: Uint8Array;
    discovery?: Uint8Array[];
  }>;
  retain: (
    bytes: Uint8Array,
    mediaType: string,
    signal: AbortSignal
  ) => Promise<AcademicCapture['asset']>;
  read: (ref: AcademicCapture['asset'], signal: AbortSignal) => Promise<Uint8Array>;
  uuid: () => string;
  now: () => string;
}
/** Retains unreviewed source captures; never creates canonical knowledge implicitly. */
export class DeterministicService {
  private tail: Promise<unknown> = Promise.resolve();
  private active?: AbortController;
  private queued = 0;
  private closed = false;
  constructor(private p: Ports) {}
  async call<K extends keyof DeterministicOperations>(
    op: K,
    input: DeterministicOperations[K]['input'],
    signal?: AbortSignal
  ): Promise<DeterministicOperations[K]['output']> {
    if (this.closed) throw Error('Academic handlers closed');
    const v = input as any;
    object(
      v,
      op === 'deterministic.review'
        ? ['id', 'operationId', 'targetId', 'name', 'note']
        : ['deterministic.import', 'deterministic.xml'].includes(op)
          ? ['id', 'source']
          : ['id']
    );
    jobId(v.id);
    signal?.throwIfAborted();
    if (op === 'deterministic.review') {
      jobId(v.operationId);
      if (v.targetId) jobId(v.targetId);
      if (
        typeof v.note !== 'string' ||
        !v.note.trim() ||
        v.note.length > 4000 ||
        (v.name !== undefined && (typeof v.name !== 'string' || v.name.length > 1000)) ||
        !!v.targetId === !!v.name
      )
        throw Error('Choose an existing entity or a new reviewed name, with a note');
      if (!this.p.knowledge) throw Error('Canonical review unavailable');
      const r = await this.p.jobs.load(v.id);
      if (r.preparation.kind !== 'deterministic' || r.summary.state !== 'completed' || !r.result)
        throw Error('Completed source capture required');
      const { capture } = JSON.parse(
        new TextDecoder().decode(await this.p.jobs.readResult(v.id, r.result))
      );
      const c = signal ?? new AbortController().signal;
      await this.p.read(capture.asset, c);
      const { projection, ...snapshot } = capture;
      return await this.p.knowledge(
        {
          op: 'deterministic-review',
          operationId: v.operationId,
          targetId: v.targetId,
          name: v.name,
          note: v.note,
          snapshot: { ...snapshot, title: projection.title },
        },
        c
      );
    }
    if (op === 'deterministic.xml') {
      httpsUrl(v.source);
      await this.p.jobs.create(v.id, { kind: 'deterministic', source: v.source, format: 'xml' });
    }
    if (op === 'deterministic.import') {
      if (!academicIdentifier(v.source)) throw Error('Unrecognised academic identifier');
      await this.p.jobs.create(v.id, { kind: 'deterministic', source: v.source });
    }
    if (op === 'deterministic.inspect') {
      let r = await this.p.jobs.load(v.id);
      if (r.preparation.kind !== 'deterministic') throw Error('Wrong job type');
      if (r.summary.state === 'running') {
        let lease;
        try {
          lease = await this.p.jobs.acquire(v.id);
        } catch (e) {
          if (!(e instanceof Error) || !e.message.includes('executing in another host')) throw e;
        }
        if (lease)
          try {
            r = await this.p.jobs.load(v.id);
            if (r.summary.state === 'running')
              r = await this.p.jobs.checkpoint(
                {
                  ...r,
                  summary: {
                    ...r.summary,
                    state: 'interrupted',
                    error: 'Explicit resume required',
                  },
                },
                r.summary.revision
              );
          } finally {
            await lease.close();
          }
      }
      return { job: r.summary } as any;
    }
    if (!['deterministic.xml', 'deterministic.import', 'deterministic.resume'].includes(op))
      throw Error('Unsupported operation');
    if (this.queued >= 8) throw Error('Academic queue full');
    this.queued++;
    const task = this.tail.then(() => this.run(v.id, signal));
    this.tail = task.catch(() => {});
    try {
      return (await task) as any;
    } finally {
      this.queued--;
    }
  }
  private async run(id: string, signal?: AbortSignal) {
    if (this.closed) throw Error('Academic handlers closed');
    signal?.throwIfAborted();
    const c = (this.active = new AbortController()),
      abort = () => c.abort(),
      timer = setTimeout(abort, 60000);
    signal?.addEventListener('abort', abort, { once: true });
    let lease;
    try {
      lease = await this.p.jobs.acquire(id);
      let r = await this.p.jobs.load(id);
      if (r.preparation.kind !== 'deterministic') throw Error('Wrong job type');
      const source = r.preparation.source,
        isXml = r.preparation.format === 'xml',
        identity = academicIdentifier(source)!;
      const checkpoint = async (
        state: JobRecord['summary']['state'],
        data: unknown,
        error?: string
      ) => {
        const result = await this.p.jobs.putResult(
          id,
          new TextEncoder().encode(JSON.stringify(data))
        );
        r = await this.p.jobs.checkpoint(
          { ...r, result, summary: { ...r.summary, state, error } },
          r.summary.revision
        );
      };
      let prepared: any = r.result
        ? JSON.parse(new TextDecoder().decode(await this.p.jobs.readResult(id, r.result)))
        : {};
      if (r.summary.state === 'completed') {
        await this.p.read(prepared.capture.asset, c.signal);
        for (const a of prepared.capture.assets ?? []) await this.p.read(a, c.signal);
        return { capture: prepared.capture, jobId: id };
      }
      await checkpoint('running', prepared);
      try {
        if (!prepared.asset) {
          const acquired = isXml
            ? await this.p.acquireXml(source, c.signal)
            : await this.p.acquire(identity, c.signal);
          c.signal.throwIfAborted();
          const asset = await this.p.retain(
            acquired.bytes,
            !isXml && ['orcid', 'isbn', 'pmcid'].includes(identity.family)
              ? 'application/json'
              : 'application/xml',
            c.signal
          );
          const secondary = acquired.secondary
            ? await this.p.retain(acquired.secondary, 'application/xml', c.signal)
            : undefined;
          const discovery = [];
          for (const b of acquired.discovery ?? [])
            discovery.push(await this.p.retain(b, 'application/json', c.signal));
          prepared = {
            asset,
            secondary,
            discovery,
            endpoint: acquired.endpoint,
            retrievedAt: this.p.now(),
            snapshotId: this.p.uuid(),
          };
          await checkpoint('running', prepared);
        }
        const bytes = await this.p.read(prepared.asset, c.signal),
          secondary = prepared.secondary
            ? await this.p.read(prepared.secondary, c.signal)
            : undefined;
        const discovery = [];
        for (const a of prepared.discovery ?? []) discovery.push(await this.p.read(a, c.signal));
        const { projection } = (await this.p.executor.run(
          {
            kind: 'deterministic-parse',
            format: isXml ? 'ocr' : identity.family,
            identity,
            bytes,
            secondary,
            discovery,
          },
          c.signal
        )) as DeterministicResult;
        c.signal.throwIfAborted();
        const capture: AcademicCapture = {
          version: 1,
          kind: 'deterministic',
          snapshotId: prepared.snapshotId,
          resourceId: prepared.asset.assetId,
          source,
          endpoint: prepared.endpoint,
          retrievedAt: prepared.retrievedAt,
          asset: prepared.asset,
          assets: [
            ...(prepared.secondary ? [prepared.secondary] : []),
            ...(prepared.discovery ?? []),
          ],
          format: projection.kind,
          ...(isXml
            ? {}
            : {
                identity:
                  identity.family === 'arxiv'
                    ? academicIdentifier('arxiv:' + projection.citations[0].key)!
                    : identity,
              }),
          projection,
        };
        await checkpoint('completed', { capture });
        return { capture, jobId: id };
      } catch (e) {
        await checkpoint(
          c.signal.aborted ? 'cancelled' : 'failed',
          prepared,
          String(e).slice(0, 500)
        );
        throw Error(
          `${String(e)}. Resume through Inspect / Import linked resource: mutable-academic-job:${id}; published originals are retained.`
        );
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      this.active = undefined;
      await lease?.close();
    }
  }
  async close() {
    this.closed = true;
    this.active?.abort();
    await this.tail;
  }
}
