import type {EntityAuthorityState} from '../../application/entity-authority-resolution';
import {publicImageUrl} from '../../feature-api/entity-enrichment';
import {managedAsset, type ManagedAssetReference} from '../../interchange/managed-asset';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import {bindCardThumbnail} from '../cardex/service';

export interface SemanticThumbnail {asset?: ManagedAssetReference; url?: string}
export function semanticThumbnail(entity: any, authority?: EntityAuthorityState): SemanticThumbnail {
 const asset = authority?.status === 'linked' && !authority.canonical?.deletedUtc ? managedAsset(authority.canonical?.imageRef) : undefined;
 const urls = [entity?.attributes?.enrichment?.thumbnail?.url, ...(['linked', 'verified'].includes(authority?.status ?? '') ? [authority?.record?.thumbnail?.url] : [])];
 return {asset, url: urls.find(publicImageUrl)};
}

/** Reuse Cardex's bounded asset queue and lease; send only a small raster into the sandbox. */
export function bindSemanticThumbnail(editor: ReactiveEditor, thumbnail: SemanticThumbnail, publish: (url?: string) => void) {
 publish(thumbnail.url);
 if (!thumbnail.asset) return () => {};
 const image = new Image(); let alive = true;
 const loaded = () => {
  if (!alive || !image.naturalWidth || !image.naturalHeight) return;
  const canvas = document.createElement('canvas'), scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  try { const context = canvas.getContext('2d'); if (!context) return; context.drawImage(image, 0, 0, canvas.width, canvas.height); publish(canvas.toDataURL('image/png')); } catch { /* Keep the available URL or initials fallback. */ }
 };
 image.addEventListener('load', loaded);
 const stop = bindCardThumbnail(editor, image, thumbnail.asset);
 return () => { alive = false; image.removeEventListener('load', loaded); stop(); };
}
