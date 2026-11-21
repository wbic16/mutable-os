import { emptyFragment, validateFragment } from './fragment';
import { materializeFragment } from './materialize';
import { inspectUri, type PassiveVideo } from './uri';
import { managedAsset, type AssetManifest } from './managed-asset';

/** Syntax-only dispatch for the explicit resource-paste gesture. No URL probes. */
export function resourceUrl(value: string) {
  let inspected: ReturnType<typeof inspectUri>;
  try { inspected = inspectUri(value); } catch { return; }
  const url = new URL(inspected.url);
  // Share/tracking parameters are not player configuration. Extract one public
  // identifier and feed it through the existing strict provider validator.
  let video: PassiveVideo | undefined = inspected.video;
  if (!video && url.protocol === 'https:' && !url.port) {
    const clean = new URL(url); clean.search = ''; clean.hash = '';
    if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) {
        clean.hostname = 'www.youtube.com'; clean.searchParams.set('v', url.searchParams.get('v')!);
      } else if (/^\/live\/[\w-]{11}$/.test(url.pathname)) clean.pathname = url.pathname.replace('/live/', '/embed/');
    }
    // Unlisted Vimeo links require a separate access token; do not discard it.
    if (!url.searchParams.has('h')) video = inspectUri(clean.href).video;
  }
  const kind = video?.provider ?? (/\.(png|jpe?g)$/i.test(url.pathname) ? 'image' : 'iframe');
  if (kind === 'image') url.hash = ''; // A fragment is provenance, not part of an HTTP acquisition.
  return { url: url.href, kind, video } as const;
}
export type ResourceUrl = NonNullable<ReturnType<typeof resourceUrl>>;

/** Only this explicit operation may construct active resource Blocks. Ordinary
 * imported HTML/native carriers still pass through inert type negotiation. */
export function resourceBlock(value: string, image?: Omit<AssetManifest, 'kind'>) {
  const resource = resourceUrl(value);
  if (!resource) throw Error('Paste one absolute HTTP(S) resource URL.');
  if(resource.kind === 'image') {
    if(!image) throw Error('The image must be downloaded and validated first.');
    return managedImageBlock(image, decodeName(resource.url), value.trim());
  }
  const type = resource.video ? `${resource.video.provider}-player-block` : 'iframe-block';
  const body = resource.video ? { video: { ...resource.video } }
    : { metadata: { url: resource.url, height: 600, resourceEmbed: true, title: new URL(resource.url).hostname } };
  return activeResourceBlock(type, { ...body, sourceUrl: value.trim() });
}
/** Shared host preparation for verified managed images. No new resource or
 * source ownership is created; callers establish resource authority first. */
export function managedImageBlock(image: Omit<AssetManifest,'kind'>, alt: string, sourceUrl?: string) {
  const asset = managedAsset({kind:'managed',cavernId:image.cavernId,assetId:image.assetId});
  if(!asset || !['image/png','image/jpeg'].includes(image.mediaType)) throw Error('The image must be downloaded and validated first.');
  if(typeof alt !== 'string') throw Error('Invalid image alternative text.');
  return activeResourceBlock('image-block', {asset,metadata:{alt},...(sourceUrl?{sourceUrl}:{})});
}
function activeResourceBlock(type: string, data: Record<string,any>) {
  const f = emptyFragment();
  f.blocks.push({ localId: 'resource', type, data, blockProperties: [], children: [], relations: {} });
  f.placements.push({ localId: 'resource-placement', kind: 'owned', target: { kind: 'local', object: 'block', id: 'resource' } });
  f.roots.push({ placement: 'resource-placement', openStart: false, openEnd: false, clippedStart: false, clippedEnd: false });
  const fragment = validateFragment(f), native = materializeFragment(fragment);
  const root = native.state.contents[native.state.placements[native.roots[0]].contentKey];
  // Replace the inert negotiation result only with our locally constructed data.
  root.viewType = type; root.payload = { ...data, id: root.payload.id, type, blockProperties: [] };
  return { fragment, native };
}
function decodeName(value: string) {
  const name = new URL(value).pathname.split('/').at(-1) ?? 'Image';
  try { return decodeURIComponent(name); } catch { return name; }
}
