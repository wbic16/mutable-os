import type { AcquiredText, LinkedTextFormat } from '../interchange/uri';
import { assetKey, managedAsset, type AssetManifest, type ManagedAssetReference } from '../interchange/managed-asset';
export interface AssetContext { cavernId?: string; session?: string }
export interface AssetLease { id: string; token: string; cavernId: string }
/** Session-owned runtime URLs only; original references remain canonical. */
export class ManagedAssets {
  private entries = new Map<string, { users: number; controller: AbortController; promise: Promise<string>; url?: string }>();
  private alive = true;
  constructor(private context: () => AssetContext, private enabled: () => boolean) {}
  async request(path: string, body: unknown, signal?: AbortSignal, lease?: AssetLease) {
    const scope = this.context();
    if (!this.alive || !this.enabled() || !scope.cavernId || !scope.session) throw Error('Choose a Cavern before importing images.');
    const form = body instanceof FormData;
    const response = await fetch(`/api/assets/${path}`, { method: 'POST', signal, headers: { 'X-Mutable-Cavern': scope.session, ...(!form ? { 'Content-Type': 'application/json' } : {}), ...(lease ? { 'X-Mutable-Asset-Lease': lease.token } : {}) }, body: form ? body : JSON.stringify(body ?? {}) });
    if (scope.session !== this.context().session || scope.cavernId !== this.context().cavernId || !this.alive) throw Error('The Cavern changed; asset import cancelled.');
    const result = await response.json(); if (!response.ok || !result.Success) throw Error(result.Error || 'Asset operation failed.');
    return result.Data;
  }
  begin(remoteConsent: string[], signal?: AbortSignal): Promise<AssetLease> { return this.request('begin', { remoteConsent }, signal); }
  beginText(url:string, format:LinkedTextFormat, signal?:AbortSignal):Promise<AssetLease> {return this.request('begin-text',{url,format},signal);}
  acquireText(lease:AssetLease,url:string,format:LinkedTextFormat,signal?:AbortSignal):Promise<AcquiredText> {return this.request(`${lease.id}/text/remote`,{url,format},signal,lease);}
  verify(asset: ManagedAssetReference, signal?: AbortSignal): Promise<AssetManifest> { return this.request('verify', asset, signal); }
  /** Bind an existing original, without downloading/acquiring it. The native
   * verify endpoint hashes the stored bytes. Recheck this fence at admission. */
  async verifiedImage(value: unknown, signal?: AbortSignal) {
    const parsed = managedAsset(value), scope = { ...this.context() };
    if (!parsed) throw Error('Invalid managed image reference.');
    const reference: ManagedAssetReference = {kind:'managed', cavernId:parsed.cavernId, assetId:parsed.assetId};
    const check = () => {
      signal?.throwIfAborted();
      const current = this.context();
      if (!this.alive || !this.enabled() || !scope.session || !scope.cavernId || reference.cavernId !== scope.cavernId || current.session !== scope.session || current.cavernId !== scope.cavernId) throw Error('Managed image is outside the active Cavern/session.');
    };
    check();
    const manifest = await this.verify(reference, signal);
    check();
    if (manifest?.assetId !== reference.assetId || manifest?.cavernId !== reference.cavernId || !['image/png','image/jpeg'].includes(manifest?.mediaType) || !Number.isSafeInteger(manifest?.byteLength) || manifest.byteLength <= 0 || manifest.byteLength > 10*1024*1024) throw Error('Managed image verification mismatch.');
    return {manifest:{...manifest,...reference}, check};
  }
  async stage(lease: AssetLease, file: Blob, signal?: AbortSignal): Promise<AssetManifest> {
    const form = new FormData(); form.append('asset', file, 'clipboard-image');
    return this.request(`${lease.id}/images/stage`, form, signal, lease);
  }
  async stageSvg(lease:AssetLease,file:Blob,signal?:AbortSignal):Promise<AssetManifest>{const form=new FormData();form.append('asset',file,'composition.svg');return this.request(`${lease.id}/images/svg`,form,signal,lease);}
  async stageOriginal(lease:AssetLease,file:Blob,signal?:AbortSignal):Promise<AssetManifest>{const form=new FormData();form.append('asset',file,'retained-original');return this.request(`${lease.id}/originals/stage`,form,signal,lease);}
  remote(lease: AssetLease, url: string, signal?: AbortSignal): Promise<AssetManifest> { return this.request(`${lease.id}/images/remote`, { url }, signal, lease); }
  action(lease: AssetLease, action: string, signal?: AbortSignal) { return this.request(`${lease.id}/${action}`, {}, signal, lease); }
  async original(asset: ManagedAssetReference, signal: AbortSignal): Promise<{reference:ManagedAssetReference;mediaType:'image/png'|'image/jpeg';bytes:Uint8Array}> {
    const scope=this.context();
    if(!this.alive||!this.enabled()||!scope.session||asset.cavernId!==scope.cavernId)throw Error('Original asset is outside the active Cavern.');
    const manifest=await this.verify(asset,signal);
    const response=await fetch(`/api/assets/${encodeURIComponent(asset.assetId)}/content?cavernId=${encodeURIComponent(asset.cavernId)}`,{headers:{'X-Mutable-Cavern':scope.session},signal});
    if(!response.ok||!response.body)throw Error('Original asset unavailable.');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){signal.throwIfAborted();const part=await reader.read();if(part.done)break;if((size+=part.value.length)>10*1024*1024)throw Error('Original asset size limit');chunks.push(part.value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(!this.alive||scope.session!==this.context().session||asset.cavernId!==this.context().cavernId||manifest.byteLength!==size||asset.assetId!==`sha256:${digest}`||!['image/png','image/jpeg'].includes(manifest.mediaType))throw Error('Original asset integrity/session mismatch');
    return {reference:asset,mediaType:manifest.mediaType as 'image/png'|'image/jpeg',bytes};
  }
  bind(image: HTMLImageElement, value: unknown): () => void {
    const asset = managedAsset(value), scope = this.context();
    if (!asset || !this.alive || !this.enabled() || asset.cavernId !== scope.cavernId || !scope.session) { image.removeAttribute('src'); return () => {}; }
    const key = `${scope.session}/${assetKey(asset)}`;
    let entry = this.entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { users: 0, controller, promise: Promise.resolve('') };
      const current = entry;
      entry.promise = (async () => {
        const r = await fetch(`/api/assets/${encodeURIComponent(asset.assetId)}/content?cavernId=${encodeURIComponent(asset.cavernId)}`, { headers: { 'X-Mutable-Cavern': scope.session! }, signal: controller.signal });
        if (!r.ok) throw Error('Managed asset is unavailable.');
        const blob = await r.blob();
        if (controller.signal.aborted || !this.alive || this.context().session !== scope.session || this.context().cavernId !== asset.cavernId || !['image/png','image/jpeg'].includes(blob.type) || blob.size > 10*1024*1024) throw Error('Managed asset response was rejected.');
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (`sha256:${digest}` !== asset.assetId || controller.signal.aborted || !this.alive) throw Error('Managed asset integrity failure.');
        return current.url = URL.createObjectURL(blob);
      })();
      this.entries.set(key, entry);
    }
    entry.users++; let alive = true;
    entry.promise.then(url => { if (alive && this.alive && scope.session === this.context().session) image.src = url; }).catch(() => { if (alive) { image.removeAttribute('src'); image.title = 'Image unavailable in this Cavern'; } });
    return () => { alive = false; if (--entry!.users === 0) { entry!.controller.abort(); if (entry!.url) URL.revokeObjectURL(entry!.url); this.entries.delete(key); } };
  }
  dispose() { this.alive = false; for (const entry of this.entries.values()) { entry.controller.abort(); if (entry.url) URL.revokeObjectURL(entry.url); } this.entries.clear(); }
}
