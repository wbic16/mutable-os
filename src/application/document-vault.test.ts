import { expect, it, vi } from 'vitest';
import { createDocumentVaults, vaultRoot } from './document-vault';
import type { NativeDocumentSession } from '../persistence/native-session';
const scan=(vault:string)=>({vault,folders:[],documents:[],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true});
it('shares a disposable root read model without permitting overlapping vaults; closing releases query work',async()=>{
 let resolve!:(v:any)=>void,signal:AbortSignal|undefined;
 const native={establishVault:async()=>({}),discoverVault:vi.fn(async(root:string,s?:AbortSignal)=>{signal=s;return scan(root);}),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),one=await vaults.acquire('./vault/'),two=await vaults.acquire('vault');expect(two).toBe(one);expect(native.discoverVault).toHaveBeenCalledTimes(1);
 await expect(vaults.acquire('vault/nested')).rejects.toThrow('overlapping');one.release();
 native.discoverVault.mockImplementation((_root,s)=>{signal=s;return new Promise(r=>resolve=r);});const pending=two.refresh();two.release();expect(signal?.aborted).toBe(true);resolve(scan('vault'));await pending;
 native.discoverVault.mockImplementation(async r=>scan(r));native.establishVault=async()=>{throw Error('Overlapping persistent Vault');};await expect(vaults.acquire('vault/nested')).rejects.toThrow('persistent Vault');vaults.dispose();await expect(vaults.acquire('.')).rejects.toThrow('disposed');
});
it('does not admit an aborted discovery and confines client paths before any request',async()=>{
 const native={establishVault:async()=>({}),discoverVault:vi.fn(async(root:string)=>scan(root))};const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),c=new AbortController();c.abort();await expect(vaults.acquire('vault',c.signal)).rejects.toMatchObject({name:'AbortError'});expect(native.discoverVault).not.toHaveBeenCalled();
 for(const value of ['/tmp','../vault','vault/../x','vault\\x'])expect(()=>vaultRoot(value)).toThrow();vaults.dispose();
});
it('publishes uncertainty on failed refresh and notifies closure without replacing known rows with absence',async()=>{
 const initial={...scan('vault'),documents:[{resourceId:'a',location:{folder:'vault',filename:'a.mutable.json'},state:'paired'}]};
 const native={establishVault:async()=>({}),discoverVault:vi.fn(async()=>initial)};const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),lease=await vaults.acquire('vault'),listener=vi.fn();lease.subscribe(listener);
 native.discoverVault.mockRejectedValue(Error('worker cancelled'));await expect(lease.refresh()).rejects.toThrow();expect(lease.snapshot().complete).toBe(false);expect(lease.snapshot().documents).toEqual(initial.documents);expect(listener).toHaveBeenCalledTimes(1);lease.release();expect(listener).toHaveBeenCalledTimes(2);expect(lease.isAlive()).toBe(false);vaults.dispose();
});
it('does not scan around existing-file saves and scans only once after tree mutations',async()=>{
 const native={establishVault:async()=>({}),discoverVault:vi.fn(async()=>scan('vault')),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),lease=await vaults.acquire('vault');
 const save=vi.fn(async()=>42);
 await expect(lease.mutate(save,false)).resolves.toBe(42);
 expect(native.discoverVault).toHaveBeenCalledTimes(1);
 await lease.mutate(save);
 expect(native.discoverVault).toHaveBeenCalledTimes(2);
 lease.release();vaults.dispose();
});

const cachedScan=()=>({...scan('vault'),cached:true,documents:[{resourceId:'a',title:'A',location:{folder:'vault',filename:'a.ink'},state:'unenrolled',byteHash:'abc'}]});
it('shows a persistent listing before background reconciliation and keeps it separate from verified discovery',async()=>{
 let finish!:(scan:unknown)=>void;
 const initial=cachedScan(),fresh={...initial,cached:false,documents:[...initial.documents,{...initial.documents[0],resourceId:'b',location:{folder:'vault',filename:'b.ink'}}]};
 const native={establishVault:async()=>({}),browseVault:vi.fn(async(_root:string,mode:string)=>mode==='cached'?initial:new Promise(r=>finish=r)),discoverVault:vi.fn(async()=>({...initial,cached:undefined})),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession,undefined,true),lease=await vaults.acquire('vault');
 expect(lease.listing().documents).toHaveLength(1);expect(lease.checking()).toBe(true);expect(lease.snapshot().complete).toBe(false);expect(lease.snapshot().documents).toEqual([]);expect(native.discoverVault).not.toHaveBeenCalled();
 expect(lease.requireListedFile(initial.documents[0].location).resourceId).toBe('a');expect(()=>lease.requireFile(initial.documents[0].location)).toThrow('incomplete');
 finish(fresh);await vi.waitFor(()=>expect(lease.checking()).toBe(false));expect(lease.listing().documents).toHaveLength(2);expect(lease.snapshot().complete).toBe(false);
 await lease.ensureVerified();expect(native.discoverVault).toHaveBeenCalledTimes(1);expect(lease.snapshot().complete).toBe(true);lease.release();
});
it('background failure preserves cached rows and closing aborts outstanding work',async()=>{
 let reject!:(e:Error)=>void,signal:AbortSignal|undefined;
 const native={establishVault:async()=>({}),browseVault:vi.fn(async(_r:string,mode:string,s?:AbortSignal)=>{signal=s;return mode==='cached'?cachedScan():new Promise((_r,no)=>reject=no);}),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession,undefined,true),lease=await vaults.acquire('vault');reject(Error('offline'));
 await vi.waitFor(()=>expect(lease.notice()).toContain('offline'));expect(lease.listing().documents).toHaveLength(1);expect(lease.snapshot().complete).toBe(false);
 const work=lease.refreshListing();lease.release();expect(signal?.aborted).toBe(true);reject(Error('cancelled'));await expect(work).rejects.toThrow('cancelled');
});
it('refresh, checksum verification and existing-file saves use incremental listing requests',async()=>{
 const native={establishVault:async()=>({}),browseVault:vi.fn(async()=>({...cachedScan(),cached:false})),discoverVault:vi.fn(),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession,undefined,true),lease=await vaults.acquire('vault');
 await lease.refreshListing(true);await lease.refreshListing(true,true);await lease.mutate(async()=>42,false);
 expect(native.browseVault.mock.calls.map(c=>(c as unknown[])[1])).toEqual(['cached','reconcile','verify','reconcile']);expect(native.discoverVault).not.toHaveBeenCalled();lease.release();
});
it('changed bytes invalidate verified evidence even when title, identity and location are unchanged',async()=>{
 const initial={...cachedScan(),cached:false};
 const native={establishVault:async()=>({}),browseVault:vi.fn(async()=>initial),discoverVault:vi.fn(async()=>({...scan('vault'),documents:initial.documents.map(({byteHash,...row})=>({...row,baseline:{nativeHash:byteHash,markdownHash:null,generation:null}}))})),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession,undefined,true),lease=await vaults.acquire('vault');await lease.ensureVerified();const signature=lease.signature();await lease.refreshListing();expect(lease.signature()).toBe(signature);
 native.browseVault.mockResolvedValue({...initial,documents:initial.documents.map(d=>({...d,byteHash:'changed'}))});await lease.refreshListing();expect(lease.snapshot().complete).toBe(false);await lease.ensureVerified();expect(native.discoverVault).toHaveBeenCalledTimes(2);lease.release();
});
it('verification waits for a running background listing so stale results cannot overwrite it',async()=>{
 let finish!:(v:unknown)=>void;const initial=cachedScan();
 const native={establishVault:async()=>({}),browseVault:vi.fn(async(_r:string,mode:string)=>mode==='cached'?initial:new Promise(r=>finish=r)),discoverVault:vi.fn(async()=>({...scan('vault'),documents:initial.documents})),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession,undefined,true),lease=await vaults.acquire('vault');const verified=lease.ensureVerified();expect(native.discoverVault).not.toHaveBeenCalled();finish({...initial,cached:false});await verified;expect(lease.snapshot().complete).toBe(true);lease.release();
});
it('exact selected activation tolerates unrelated malformed files but rejects stale, duplicate and pending evidence',async()=>{
 const row={resourceId:'a',location:{folder:'vault',filename:'a.ink'},title:'A',state:'paired'};
 const value={...scan('vault'),complete:false,documents:[row],diagnostics:[{path:'vault/bad.ink',message:'Malformed native file'}]};
 const native={establishVault:async()=>({}),discoverVault:vi.fn(async()=>value),pendingVaultRelocations:()=>[]};
 const vaults=createDocumentVaults(native as unknown as NativeDocumentSession),lease=await vaults.acquire('vault');
 expect(lease.requireSelectedFile(row.location).resourceId).toBe('a');expect(()=>lease.requireFile(row.location)).toThrow('incomplete');
 native.discoverVault.mockResolvedValue({...value,documents:[row,{...row,location:{folder:'vault',filename:'duplicate.ink'}}]});await lease.refresh();expect(()=>lease.requireSelectedFile(row.location)).toThrow('ambiguous');
 native.discoverVault.mockResolvedValue({...value,documents:[{...row,state:'pending'}]});await lease.refresh();expect(()=>lease.requireSelectedFile(row.location)).toThrow('pending');
 native.discoverVault.mockResolvedValue(value);await lease.refresh();native.discoverVault.mockRejectedValue(Error('offline'));await expect(lease.refresh()).rejects.toThrow();expect(()=>lease.requireSelectedFile(row.location)).toThrow('Refresh');vaults.dispose();
});
