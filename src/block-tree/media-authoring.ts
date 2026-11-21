import ipaddr from 'ipaddr.js';
import {mediaUrl} from '../interchange/media-url';
import {inspectUri,videoFragment} from '../interchange/uri';
import {resourceBlock,resourceUrl} from '../interchange/resource-url';
import {materializeFragment} from '../interchange/materialize';
import type {ExistingBlockDto} from './types';

/** Human Add Image preparation. Local/blob UI inputs retain their existing
 * policy; external conversational inputs additionally use externalMediaUrl. */
export function prepareImage(value:unknown,alt?:string):ExistingBlockDto {
 const url=mediaUrl(value);if(!url||alt!==undefined&&typeof alt!=='string')throw Error('Enter a valid image URL and alternative text');
 return {id:crypto.randomUUID(),type:'image-block',metadata:{url,...(alt!==undefined?{alt}:{})},children:[]};
}
/** Syntax-only boundary for external embeds; no DNS/availability probes.
 * Browser DNS, redirects and remote playback remain browser-owned. This does
 * not promise the pinned-DNS/content guarantees of native acquisition. */
export function externalMediaUrl(value:unknown):string {
 if(typeof value!=='string')throw Error('External media needs an absolute HTTP(S) URL');
 const url=new URL(inspectUri(value).url),host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
 if(url.port||!host.includes('.')&&!host.includes(':')||/(^|\.)(localhost|local|internal|lan|home|invalid)$/.test(host))throw Error('External media cannot address local resources or nonstandard ports');
 if(ipaddr.isValid(host)){
  const ip=ipaddr.parse(host);if(ip.range()!=='unicast'||ip.kind()==='ipv6'&&(ip as ipaddr.IPv6).isIPv4MappedAddress())throw Error('External media cannot address private or reserved networks');
 }
 return url.href;
}
export function prepareExternalImage(url:unknown,alt:unknown){
 if(typeof alt!=='string'||alt.length>1024)throw Error('Invalid external image alternative text');
 return prepareImage(externalMediaUrl(url),alt);
}
/** The native URI video route, including its strict provider descriptors and
 * local activation lifecycle. Share URL normalization matches resource paste. */
export function prepareVideoReference(value:unknown){
 const url=externalMediaUrl(value),resource=resourceUrl(url);
 if(!resource?.video)throw Error('Unsupported video reference; use a supported YouTube or Vimeo URL');
 return materializeFragment(videoFragment(resource.video));
}
/** Explicit native resource-paste iframe path. No source HTML, srcdoc, sandbox
 * flags or trusted web capture can be provided by an authoring declaration. */
export function prepareWebsiteEmbed(value:unknown){
 const url=externalMediaUrl(value),resource=resourceUrl(url);
 if(resource?.kind!=='iframe')throw Error('Use the image or provider-video operation for this resource');
 return resourceBlock(url).native;
}
export const externalMediaLimits={nodes:8,url:4096,alt:1024} as const;
