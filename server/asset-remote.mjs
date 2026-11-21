import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import ipaddr from 'ipaddr.js';
import { IMAGE_LIMITS } from './asset-image-validation.mjs';
export function remoteAssetUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || url.hash || value.length > 4096) throw Error('Remote images require a credential-free HTTPS URL on port 443.');
  return url;
}
export function publicAddress(address) {
  try { const ip = ipaddr.parse(address); return ip.range() === 'unicast' && !(ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()); } catch { return false; }
}
/** Explicit consent is checked by the route. DNS and redirects cannot change the allowed origin/address policy. */
export async function acquireRemoteAsset(value, signal, dependencies = {}) {
  return (await acquire(value, signal, dependencies, {accept:'image/png, image/jpeg', bytes:IMAGE_LIMITS.bytes})).bytes;
}
async function acquire(value, signal, dependencies, policy) {
  const parse=policy.head?imageReferenceUrl:remoteAssetUrl;
  const origin = parse(value).origin, resolve = dependencies.lookup ?? lookup;
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.throwIfAborted(); signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, policy.head?5000:15000);
  try {
    let url = parse(value);
    for (let hop = 0; hop <= 3; hop++) {
      controller.signal.throwIfAborted();
      if (!policy.head && url.origin !== origin) throw Error('A different image origin requires new consent.');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const answers = await Promise.race([resolve(host, { all: true, verbatim: true }), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Image download cancelled or timed out.')), { once: true }))]);
      controller.signal.throwIfAborted();
      if (!answers.length || answers.some(a => !publicAddress(a.address))) throw Error('Remote image address is not public.');
      const address = answers[0];
      const connect=dependencies.request??(url.protocol==='http:'?httpRequest:request);
      const result = await new Promise((resolve, reject) => {
        // Some hosts reject anonymous clients. Identify the application without impersonating a browser or sending user data.
        const req = connect(url, { ...(policy.head?{method:'HEAD'}:{}),agent: false, signal: controller.signal, headers: { Accept: policy.accept, 'Accept-Encoding': 'identity', 'User-Agent': 'MutableOS/0.0.0 (Flint; user-requested resource import)' }, lookup: (_host, options, cb) => options?.all ? cb(null, [address]) : cb(null, address.address, address.family) }, res => {
          if ([301,302,303,307,308].includes(res.statusCode)) { const redirect = res.headers.location; res.destroy(); resolve({ redirect }); return; }
          if (res.statusCode !== 200) { res.destroy(); reject(Error(`Remote server refused the download (HTTP ${res.statusCode}).`)); return; }
          if(policy.head){
            const length=res.headers['content-length'],mediaType=String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase();
            const size=typeof length==='string'&&/^\d+$/.test(length)?Number(length):NaN;
            const byteLength=Number.isSafeInteger(size)&&size>=0&&mediaType.startsWith('image/')&&(!res.headers['content-encoding']||res.headers['content-encoding']==='identity')?size:null;
            res.destroy();resolve({byteLength,mediaType,url:url.href});return;
          }
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity' || Number(res.headers['content-length'] ?? 0) > policy.bytes) { res.destroy(); reject(Error('Remote image response was rejected.')); return; }
          const chunks = []; let size = 0;
          res.on('data', chunk => { size += chunk.length; if (size > policy.bytes) { req.destroy(Error('Remote image exceeds the byte limit.')); return; } chunks.push(chunk); });
          res.on('end', () => resolve({ bytes: Buffer.concat(chunks), mediaType: res.headers['content-type'], url:url.href })); res.on('error', reject); res.on('aborted', () => reject(Error('Remote image response was interrupted.')));
        });
        req.on('error', reject); req.end();
      });
      if (result.bytes || policy.head&&Object.hasOwn(result,'byteLength')) return result;
      if (!result.redirect || hop === 3) throw Error('Remote image redirect limit exceeded.');
      url = parse(new URL(result.redirect, url).href);
    }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

function imageReferenceUrl(value){
 if(typeof value!=='string'||value.length>4096)throw Error('Invalid image reference');
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.port||url.username||url.password)throw Error('Image references require public HTTP(S) URLs on standard ports');
 url.hash='';return url;
}
/** Metadata only. Redirects may cross public origins (e.g. Commons → Upload),
 * with fresh DNS validation/pinning at every hop. Never reads an image body. */
export async function inspectImageReference(url,signal,dependencies={}){
 const result=await acquire(url,signal,dependencies,{head:true,accept:'image/*'});
 return {byteLength:result.byteLength};
}

/** Internal DOI adapters only; callers cannot choose an arbitrary API endpoint. */
export async function acquireScholarlyJson(provider,doi,signal,dependencies={}) {
  if(!['agency','crossref','datacite'].includes(provider)||typeof doi!=='string'||doi.length>4096||!/^10\.\d{4,9}\/[^\s]+$/.test(doi))throw Error('Invalid scholarly endpoint');
  const encoded=encodeURIComponent(doi),endpoint=provider==='datacite'?`https://api.datacite.org/dois/${encoded}`:`https://api.crossref.org/works/${encoded}${provider==='agency'?'/agency':''}`;
  const result=await acquire(endpoint,signal,dependencies,{accept:'application/json, application/vnd.api+json',bytes:2*1024*1024});
  if(!/^application\/(?:json|vnd\.api\+json)(?:;|$)/i.test(String(result.mediaType)))throw Error('Scholarly response is not JSON');
  return {bytes:new Uint8Array(result.bytes),endpoint:result.url};
}

export const TEXT_POLICIES = Object.freeze({html:'text/html', markdown:'text/markdown', text:'text/plain'});
export function textPolicy(format) {
  if (!Object.hasOwn(TEXT_POLICIES, format)) throw Error('Unsupported linked-resource format.');
  return TEXT_POLICIES[format];
}
/** Same protected transport as images; text is never rendered or executed here. */
export async function acquireRemoteText(value, format, signal, dependencies = {}) {
  const expected=textPolicy(format);
  const result=await acquire(value,signal,dependencies,{accept:format==='markdown'?'text/markdown, text/plain':expected,bytes:2*1024*1024});
  const parts=String(result.mediaType??'').toLowerCase().split(';').map(p=>p.trim());
  const mediaType=parts.shift();
  if(mediaType!==expected&&!(format==='markdown'&&mediaType==='text/plain'))throw Error('Linked resource Content-Type does not match the chosen format.');
  if(parts.some(p=>!/^charset=(?:"?(?:utf-8|us-ascii)"?)$/.test(p)))throw Error('Linked text requires UTF-8 or US-ASCII; unsupported charset or Content-Type parameter.');
  let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(result.bytes);}catch{throw Error('Linked text is not valid UTF-8.');}
  if(parts.some(p=>p.includes('us-ascii'))&&/[^\x00-\x7f]/.test(source))throw Error('Linked text does not match its US-ASCII charset.');
  if(/[\u0000-\u0008\u000b\u000e-\u001f]/.test(source)||[...source].length>200000)throw Error('Linked text contains binary controls or exceeds 200,000 characters.');
  if(format==='html')for(const meta of source.match(/<meta\b[^>]*>/gi)??[])for(const match of meta.matchAll(/charset\s*=\s*["']?([^\s"'/>;]+)/gi))if(!['utf-8','us-ascii'].includes(match[1].toLowerCase()))throw Error('HTML declares an unsupported charset.');
  if(format==='markdown'&&/^\s*(?:<!doctype\s+html|<html\b)/i.test(source))throw Error('The response is HTML, not Markdown.');
  return {source,format,url:result.url,mediaType,byteHash:createHash('sha256').update(result.bytes).digest('hex')};
}

/** Fixed Wikimedia API operations, not an arbitrary proxy. One resource, no graph traversal. */
export async function acquireEncyclopedia(source,signal,dependencies={}) {
 const get=async url=>{const r=await acquire(url,signal,dependencies,{accept:'application/json',bytes:2*1024*1024});if(!/^application\/json(?:;|$)/i.test(String(r.mediaType)))throw Error('Wikimedia response is not JSON');return {bytes:new Uint8Array(r.bytes),endpoint:r.url};};
 if(typeof source==='string'){
  if(!/^Q[1-9]\d{0,14}$/.test(source))throw Error('Invalid Wikidata identity');
  const r=await get(`https://www.wikidata.org/wiki/Special:EntityData/${source}.json`);return {endpoint:r.endpoint,responses:[r.bytes]};
 }
 if(!source||!/^[a-z][a-z0-9-]{0,30}\.wikipedia\.org$/.test(source.site)||source.oldid!==undefined&&(!Number.isSafeInteger(source.oldid)||source.oldid<1))throw Error('Invalid Wikipedia source');
 const api=params=>`https://${source.site}/w/api.php?${new URLSearchParams({format:'json',formatversion:'2',...params})}`;
 if(!source.oldid&&(typeof source.title!=='string'||!source.title||source.title.length>512))throw Error('Invalid Wikipedia title');
 const first=await get(api({action:'query',prop:'revisions|pageprops',rvprop:'ids|timestamp',...(source.oldid?{revids:String(source.oldid)}:{titles:source.title,redirects:'1'})}));
 const page=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(first.bytes)).query?.pages?.[0],revision=page?.revisions?.[0]?.revid;
 if(page?.ns!==0||page?.missing||!Number.isSafeInteger(revision)||revision<1||source.oldid&&source.oldid!==revision)throw Error('Wikipedia article/revision unavailable');
 const second=await get(api({action:'parse',oldid:String(revision),prop:'text|wikitext|revid',disableeditsection:'1'}));
 return {endpoint:second.endpoint,responses:[first.bytes,second.bytes]};
}

/** IIIF URLs are selected only by scoped application operations. Redirects stay
 * on their reviewed origin; public DNS is pinned for every request. */
export async function acquireIIIF(url,format,signal,dependencies={}) {
 if(!['json','tile'].includes(format))throw Error('Invalid IIIF acquisition format');
 const r=await acquire(url,signal,dependencies,{accept:format==='json'?(/\/info\.json(?:\?|$)/.test(url)?'application/ld+json, application/json':'application/ld+json;profile="http://iiif.io/api/presentation/3/context.json", application/json'):'image/jpeg, image/png',bytes:(format==='json'?8:2)*1024*1024});
 if(format==='json'){
  if(!/^application\/(?:ld\+)?json(?:;|$)/i.test(String(r.mediaType)))throw Error('IIIF information is not JSON');
  return {bytes:new Uint8Array(r.bytes),endpoint:r.url};
 }
 if(!/^image\/(?:jpeg|png)(?:;|$)/i.test(String(r.mediaType)))throw Error('IIIF tile is not PNG/JPEG');
 const {validateIIIFTile}=await import('./asset-image-validation.mjs'),metadata=await validateIIIFTile(r.bytes,signal);
 return {bytes:new Uint8Array(r.bytes),endpoint:r.url,width:metadata.width,height:metadata.height};
}

/** Explicit managed PDF acquisition; parser admission is a bounded host task. */
export async function acquirePdf(url,signal,dependencies={}) {
 const r=await acquire(url,signal,dependencies,{accept:"application/pdf",bytes:50*1024*1024});
 const u=new URL(r.url),pmcOriginal=u.hostname==='pmc-oa-opendata.s3.amazonaws.com'&&/^\/PMC[1-9]\d{0,8}\.[1-9]\d{0,3}\/[^/]+\.pdf$/.test(u.pathname);
 if(!/^application\/pdf(?:;|$)/i.test(String(r.mediaType))&&!(pmcOriginal&&/^(?:application|binary)\/octet-stream(?:;|$)/i.test(String(r.mediaType))))throw Error("Resource is not served as PDF");
 return {bytes:new Uint8Array(r.bytes),endpoint:r.url};
}

// Deterministic single-record APIs. Global per-process spacing is conservative
// across Vault hosts; no background retries or provider graph traversal.
let academicNext=0,academicQueue=Promise.resolve();
export async function acquireAcademicRecord(identifier,signal,dependencies={}) {
 const {family,key}=identifier??{};let endpoint;
 if(family==='orcid'&&/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(key))endpoint=`https://pub.orcid.org/v3.0/${key}/record`;
 else if(family==='arxiv'&&/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d{0,3})?$/.test(key))endpoint=`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(key)}&max_results=1`;
 else if(family==='pmid'&&/^[1-9]\d{0,8}$/.test(key))endpoint=`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${key}&retmode=xml&tool=MutableOS`;
 else if(family==='pmcid'&&/^PMC[1-9]\d{0,8}$/.test(key))endpoint=`https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${key}&format=json&tool=MutableOS`;
 else if(family==='isbn'&&/^97[89]\d{10}$/.test(key))endpoint=`https://openlibrary.org/api/books?bibkeys=ISBN:${key}&jscmd=data&format=json`;
 else throw Error('Unsupported academic provider identity');
 const get=async(url,json)=>{
  const contact=process.env.MUTABLE_RESOURCE_CONTACT;if(contact&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)&&['eutils.ncbi.nlm.nih.gov','pmc.ncbi.nlm.nih.gov'].includes(new URL(url).hostname)){const addressed=new URL(url);addressed.searchParams.set('email',contact);url=addressed.href;}
  const wait=academicQueue.then(async()=>{signal?.throwIfAborted();const delay=Math.max(0,academicNext-Date.now());if(delay)await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Acquisition cancelled'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delay);signal?.addEventListener('abort',abort,{once:true});});academicNext=Date.now()+3100;});academicQueue=wait.catch(()=>{});await wait;
  const r=await acquire(url,signal,dependencies,{accept:json?'application/json':'application/atom+xml, application/xml, text/xml',bytes:2*1024*1024});if(!(json&&url.startsWith('https://pmc-oa-opendata.s3.amazonaws.com/metadata/')&&/^(?:application|binary)\/octet-stream(?:;|$)/i.test(String(r.mediaType)))&&!(json?/^application\/(?:json|vnd\.orcid\+json)(?:;|$)/i:/^(?:application\/(?:atom\+)?xml|text\/xml)(?:;|$)/i).test(String(r.mediaType)))throw Error('Academic provider Content-Type mismatch');return {bytes:new Uint8Array(r.bytes),endpoint:r.url};
 };
 const result=await get(endpoint,['orcid','pmcid','isbn'].includes(family));
 if(family==='pmcid'){const records=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.bytes)).records,r=records?.find(r=>r.pmcid===key);if(r?.pmid&&/^[1-9]\d{0,8}$/.test(r.pmid)){const secondary=await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${r.pmid}&retmode=xml&tool=MutableOS`,false);result.secondary=secondary.bytes;}}
 if(family==='pmcid'){
  // Only one article prefix, at most three versions. No bucket inventory scan.
  const listing=await get(`https://pmc-oa-opendata.s3.amazonaws.com/?list-type=2&prefix=${key}.&delimiter=%2F&max-keys=4`,false);
  const {SaxesParser}=await import('saxes');const prefixes=[];let field='',buffer='',truncated=false;
  const parser=new SaxesParser();parser.on('doctype',()=>{throw Error('Unexpected provider DTD');});parser.on('opentag',n=>{field=n.name;buffer='';});parser.on('text',v=>buffer+=v);parser.on('closetag',()=>{if(field==='Prefix'&&new RegExp('^'+key+'\\.[1-9]\\d{0,3}/$').test(buffer))prefixes.push(buffer);if(field==='IsTruncated'&&buffer==='true')truncated=true;field='';});parser.write(new TextDecoder().decode(listing.bytes)).close();
  result.discovery=[];
  if(!truncated&&prefixes.length<=3)for(const prefix of prefixes){const record=await get(`https://pmc-oa-opendata.s3.amazonaws.com/metadata/${prefix.slice(0,-1)}.json`,true);result.discovery.push(record.bytes);}
 }
 return result;
}

/** Explicit single OCR XML acquisition. Never follows image/stylesheet/entity links. */
export async function acquireOcrXml(source,signal,dependencies={}){
 const r=await acquire(source,signal,dependencies,{accept:'application/xml, text/xml',bytes:8*1024*1024});
 if(!/^(?:application|text)\/xml(?:;|$)/i.test(String(r.mediaType)))throw Error('OCR response must be XML');return {bytes:new Uint8Array(r.bytes),endpoint:r.url};
}

/** Explicit web metadata only. Same DNS pinning, origin, byte and deadline policy. */
export async function acquireWebMetadata(url,format,signal,dependencies={}) {
 const u=remoteAssetUrl(url);if(!['html','x-oembed','bluesky','spotify','soundcloud','github','apple-podcast','calendar','feed'].includes(format))throw Error('Unsupported web metadata format');
 if(format==='x-oembed'&&(u.origin!=='https://publish.x.com'||u.pathname!=='/oembed'))throw Error('Invalid X metadata endpoint');
 if(format==='bluesky'&&(u.origin!=='https://public.api.bsky.app'||u.pathname!=='/xrpc/app.bsky.feed.getPostThread'||u.searchParams.get('depth')!=='0'||u.searchParams.get('parentHeight')!=='0'))throw Error('Invalid Bluesky metadata endpoint');
 if(format==='spotify'&&(u.origin!=='https://open.spotify.com'||u.pathname!=='/oembed'))throw Error('Invalid Spotify endpoint');
 if(format==='soundcloud'&&(u.origin!=='https://soundcloud.com'||u.pathname!=='/oembed'))throw Error('Invalid SoundCloud endpoint');
 if(format==='github'&&(u.origin!=='https://api.github.com'||!/^\/(?:repos\/|gists\/)/.test(u.pathname)))throw Error('Invalid GitHub endpoint');
 if(format==='apple-podcast'&&(u.origin!=='https://itunes.apple.com'||u.pathname!=='/lookup'))throw Error('Invalid Apple endpoint');
 const xml=format==='feed',calendar=format==='calendar';
 const r=await acquire(url,signal,dependencies,{accept:format==='html'?'text/html':xml?'application/rss+xml, application/atom+xml, application/xml, text/xml':calendar?'text/calendar':'application/json',bytes:2*1024*1024});
 if(!(format==='html'?/^text\/html(?:;|$)/i:xml?/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/i:calendar?/^text\/calendar(?:;|$)/i:format==='apple-podcast'?/^(?:application\/json|text\/javascript)(?:;|$)/i:/^application\/json(?:;|$)/i).test(String(r.mediaType)))throw Error('Web metadata Content-Type mismatch');
 const charset=/charset\s*=\s*"?([^;"\s]+)/i.exec(String(r.mediaType));if(charset&&!['utf-8','us-ascii'].includes(charset[1].toLowerCase()))throw Error('Web metadata requires UTF-8');
 return {body:new TextDecoder('utf-8',{fatal:true,ignoreBOM:!['html','x-oembed','bluesky'].includes(format)}).decode(r.bytes),endpoint:r.url};
}
