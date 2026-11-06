import { extractPackageData } from './package-data.mjs';
import { parentPort, workerData } from 'node:worker_threads';
import { openFoundation, restoreSnapshot } from './foundation.mjs';
import { prepareHome } from './paths.mjs';
import { PhextVFS } from '../phext/vfs.ts';
import path from 'node:path';
import { projectSaved } from './saved-projection.ts';
import { sqlKnowledgeRead } from './query-services.ts';
import { randomUUID } from 'node:crypto';
import { createEntityLookup } from './entity-lookup.mjs';
let store, phextVfs;
try {
  if (workerData.restoreFrom && workerData.readOnly) throw Error('Read-only mode cannot restore databases');
  if (workerData.initialize && workerData.readOnly) throw Error('Read-only mode cannot initialize databases');
  // Mode selection: the host (client.mjs) resolves the Cavern's
  // mode and rides it here as `phextKnowledge` — a phext path for a
  // phext-mode Cavern, absent for a native-mode one.
  //
  // Phext mode: the worker owns its own PhextVFS instance on the
  // Cavern phext (the lifecycle's instance owns the document strata;
  // flush generations keep them coherent). No .mutable home is
  // prepared: the knowledge lives in the phext and in the ephemeral
  // replica the foundation builds in temp. Creation is explicit,
  // mirroring prepareHome: only an initializing open (or a restore,
  // which establishes by conversion) may create the phext file. A
  // plain open of an unestablished Cavern refuses without leaving a
  // file behind.
  //
  // Native mode: no phext instance at all — the disk foundation
  // opens `.mutable/mutable.db` in-process, as before the cutover,
  // and the writer lease is the disk writer lock on that home.
  const phextPath = typeof workerData.phextKnowledge === 'string' ? workerData.phextKnowledge : undefined;
  if (phextPath) {
    phextVfs = workerData.readOnly || (!workerData.initialize && !workerData.restoreFrom)
      ? PhextVFS.open(phextPath)
      : PhextVFS.openOrCreate(phextPath);
  }
  // Restoring a SQLite snapshot follows the destination's mode: in
  // phext mode it converts into the phext (the snapshot stays a
  // transport format; the 4.6 converter does the verified move;
  // refused when the phext already has knowledge); in native mode
  // the validated databases are published into `.mutable`.
  const restored = workerData.restoreFrom
    ? (phextVfs
      ? restoreSnapshot(workerData.restoreFrom, workerData.vault, workerData.scopeValidated, phextVfs)
      : restoreSnapshot(workerData.restoreFrom, workerData.vault, workerData.scopeValidated))
    : undefined;
  const home = phextPath ? path.dirname(phextPath) : prepareHome(workerData).home;
  if (!workerData.readOnly) await new Promise((resolve, reject) => {
    parentPort.once('message', message => message.leaseGranted ? resolve() : reject(Error(message.leaseError || 'Writer lease unavailable')));
    parentPort.postMessage({ leaseRequest: true, home, ...(phextPath ? { phextKnowledge: phextPath } : {}) });
  });
  store = openFoundation(workerData, { hostLeaseHeld: !workerData.readOnly, scopeValidated: workerData.scopeValidated, ...(phextVfs ? { phextVfs, phextPath } : {}) });
  parentPort.postMessage({ ready: true, restored });
} catch (e) { parentPort.postMessage({ startupError: e.message }); parentPort.close(); }
if (store) {
  const lookup = createEntityLookup();
  let queue = Promise.resolve();
  let staged;
  parentPort.on('message', ({ id, operation, directory, payload }) => {
    queue = queue.then(async () => {
      try {
        let value;
        const check=()=>{if(payload?.cancellation&&Atomics.load(payload.cancellation,0))throw Error('Saved indexing canceled');};
        check();
        if(workerData.entityReader && !['entity-lookup','package-data','close'].includes(operation))throw Error('Entity reader only accepts lookups');
        if(['inspect-saved','stage-saved'].includes(operation)&&payload.vaultGuid!==store.vaultGuid)throw Error('Saved indexing vault identity mismatch');
        switch (operation) {
          case 'package-data': value=store.readKnowledge(db=>extractPackageData(db,payload,check));break;
          case 'entity-lookup': value=store.readKnowledge(db=>lookup(db,payload,check));break;
          case 'entities': { const {cancellation,...input}=payload; value=store.entities(input,check);break; }
          case 'cardex': {const {cancellation,...input}=payload;value=store.cardex(input,check);break;}
          case 'propositions': { const {cancellation,...input}=payload; value=store.propositions(input,check);break; }
          case 'semantics': { const {cancellation,...input}=payload; value=store.semantics(input,check);break; }
          case 'audit-status': value=store.auditStatus();break;
          case 'operation-outcome': value=store.operationOutcome(payload.operationId);break;
          case 'audit-deliver': {const {cancellation,...input}=payload;value=store.deliverAudit(input,check);break;}
          case 'evidence-source': {
            if(payload.vaultGuid!==store.vaultGuid)throw Error('Evidence vault identity mismatch');
            const projection=await projectSaved(payload.bytes,store.vaultGuid,undefined,undefined,check),e=payload.evidence;
            if(projection.resourceId!==e.resourceGuid)throw Error('Evidence Resource identity changed');
            if(projection.contentHash!==e.sourceContentHash){value={status:'stale',diagnostics:['Source generation changed']};break;}
            const source=projection.blocks.find(x=>x.block.guid===e.blockGuid),b=source?.block;
            if(!b){value={status:'missing',diagnostics:['Source Block missing']};break;}
            if(e.authoredPropertyId!==null){
              const properties=[...source.properties,...source.segments].filter(p=>p.authoredId===e.authoredPropertyId);
              if(!properties.length){value={status:'missing',diagnostics:['Authored source property missing']};break;}
              if(properties.length!==1){value={status:'unresolved',diagnostics:['Authored source property identity ambiguous']};break;}
              const p=properties[0];if(p.coordinate!==undefined&&(p.coordinate!==e.coordinate||p.startIndex>e.startIndex||p.endIndex<e.endIndex)){value={status:'unresolved',diagnostics:['Evidence span differs from authored property scope']};break;}
            }
            const units=source.sourceUnits;
            const zeroWidth=e.startIndex===e.endIndex&&e.coordinate==='utf16';
            if(zeroWidth?e.endIndex>(b.text?.length??0):b.coordinate!==e.coordinate||e.endIndex>units.length)throw Error('Evidence coordinate/span unavailable');
            const excerpt=zeroWidth?'':units.slice(e.startIndex,e.endIndex).join('');
            value=e.excerpt!==null&&e.excerpt!==excerpt?{status:'unresolved',diagnostics:['Evidence excerpt differs from source span']}:{status:'resolved',excerpt,diagnostics:[]};break;
          }
          case 'knowledge-revision': value=store.knowledgeRevision();break;
          case 'knowledge-cache-file': value=store.cacheFile?store.cacheFile():null;break;
          case 'knowledge-read': value=await store.readKnowledge(db=>sqlKnowledgeRead(db,payload,check));break;
          case 'finish-reconciliation': value=store.finishReconciliation();break;
          case 'inventory': value=store.inventory(); break;
          case 'index-status': value=store.indexStatus(); break;
          case 'resource-projection': value=store.resourceProjection(payload.resourceId); break;
          case 'inspect-saved': {const p=await projectSaved(payload.bytes,payload.vaultGuid,payload.policy,undefined,check);check();value={resourceId:p.resourceId,rootBlockId:p.rootBlockId,contentHash:p.contentHash,format:p.format,blockIds:p.blocks.map(b=>b.block.guid)};break;}
          case 'stage-saved': {
            staged=undefined;
            const timings={},projection=await projectSaved(payload.bytes,payload.vaultGuid,payload.policy,timings,check),token=randomUUID();
            check();const prepared=store.prepareReconciliation(projection,payload.evidence,store.indexingBaseline(projection.resourceId),{mode:payload.mode,timings,check});
            staged={token,prepared,timings};
            value={token,resourceId:projection.resourceId,contentHash:projection.contentHash,timings};break;
          }
          case 'commit-saved': {
            if(!staged||staged.token!==payload.token)throw Error('Expired saved indexing token');
            const job=staged;staged=undefined;const timings={...job.timings};value={...store.commitReconciliation(job.prepared,{timings,check}),timings};break;
          }
          case 'discard-saved': if(staged?.token===payload.token)staged=undefined;value={discarded:true};break;
          case 'deletion-baseline': value=store.indexingBaseline(payload.resourceId);break;
          case 'remove-confirmed': value=store.removeConfirmed(payload.resourceId,payload.expected);break;
          case 'index-issue': value=store.recordIssue(payload.path,payload.reason);break;
          case 'inspect': value = store.inspect(); break;
          case 'verify': value = store.verify(); break;
          case 'rebuild-fts': value = store.rebuildFts(); break;
          case 'clear-derived': value = store.clearDerived(); break;
          case 'backup': value = await store.backup(directory); break;
          case 'close': store.close(); phextVfs?.close(); parentPort.postMessage({ id, value: { closed: true } }); parentPort.close(); return;
          default: throw Error('Unsupported SQLite foundation operation');
        }
        parentPort.postMessage({ id, value });
      } catch (e) { parentPort.postMessage({ id, error: e.message }); }
    });
  });
}
