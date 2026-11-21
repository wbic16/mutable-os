import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {Readable} from 'node:stream';
import {acquireRemoteAsset,publicAddress,remoteAssetUrl} from './asset-remote.mjs';
test('rejects nonpublic IPv4/IPv6, mapped addresses and unsafe schemes/credentials/ports',()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.2','172.20.1.1','0.0.0.0','100.64.0.1','192.0.2.1','224.0.0.1','::1','::','fc00::1','fe80::1','::ffff:8.8.8.8'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const value of ['http://example.com/a','file:///a','https://a:b@example.com/a','https://example.com:8443/a'])assert.throws(()=>remoteAssetUrl(value));
});
const answer=[{address:'8.8.8.8',family:4}];
const transport=(responses,inspect=()=>{})=>(url,options,callback)=>{inspect(url,options);const req=new EventEmitter();req.destroy=e=>req.emit('error',e);req.end=()=>queueMicrotask(()=>{const response=responses.shift();const stream=Readable.from(response.bytes?[response.bytes]:[]);stream.statusCode=response.status??200;stream.headers=response.headers??{};callback(stream);});return req;};
test('pins vetted DNS to the actual connection and sends no credentials or cookies',async()=>{
 let pins=0;const bytes=await acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('original')}],(_url,options)=>{assert.equal(options.agent,false);assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Accept-Encoding','User-Agent']);options.lookup('example.com',{},(error,address,family)=>{assert.equal(address,'8.8.8.8');assert.equal(family,4);pins++;});})});assert.equal(bytes.toString(),'original');assert.equal(pins,1);
});
test('identifies the importer on every redirect without changing the consented query',async()=>{
 const url='https://upload.wikimedia.org/wikipedia/commons/b/b2/Josef_Hofman.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail_unscaled',seen=[];
 const result=await acquireRemoteAsset(url,undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'/original.jpg?source=clipboard'}},{bytes:Buffer.from('original JPEG bytes')}],(u,options)=>{seen.push(u.href);assert.equal(options.headers['User-Agent'],'MutableOS/0.0.0 (Flint; user-requested resource import)');assert.equal(options.headers.Accept,'image/png, image/jpeg');})});
 assert.deepEqual(seen,[url,'https://upload.wikimedia.org/original.jpg?source=clipboard']);assert.equal(result.toString(),'original JPEG bytes');
});
test('reports the remote HTTP status instead of a generic rejection',async()=>{
 for(const status of [403,404,429])await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{status}])}),new RegExp(`HTTP ${status}`));
});
test('rejects mixed public/private DNS before connecting',async()=>{await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>[...answer,{address:'127.0.0.1',family:4}],request:()=>{assert.fail('must not connect');}}),/not public/);});
test('revalidates same-origin redirects and refuses a changed origin or rebound address',async()=>{
 let lookups=0;await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>++lookups===1?answer:[{address:'10.0.0.1',family:4}],request:transport([{status:302,headers:{location:'/b'}}])}),/not public/);
 await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'https://other.example/a'}}])}),/new consent/);
 await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport(Array.from({length:4},()=>({status:302,headers:{location:'/b'}})))}),/redirect limit/);
});
test('rejects oversized responses and honours an already-aborted import',async()=>{
 await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{headers:{'content-length':String(11*1024*1024)}}])}),/rejected/);
 const controller=new AbortController();controller.abort();await assert.rejects(acquireRemoteAsset('https://example.com/a',controller.signal));
});

test('text acquisition shares pinning/redirect protections and returns exact validated UTF-8 source',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');let pins=0;
 const result=await acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'/folder/page'}},{bytes:Buffer.from('<p>héllo</p>'),headers:{'content-type':'text/html; charset=utf-8'}}],(_url,options)=>{assert.equal(options.headers.Accept,'text/html');assert.equal(options.headers['Accept-Encoding'],'identity');assert.equal(options.headers.Cookie,undefined);options.lookup('example.com',{},(_,a)=>{assert.equal(a,'8.8.8.8');pins++;});})});
 assert.equal(result.source,'<p>héllo</p>');assert.equal(result.url,'https://example.com/folder/page');assert.match(result.byteHash,/^[a-f0-9]{64}$/);assert.equal(pins,2);
 for(const format of ['markdown','text']){const r=await acquireRemoteText('https://example.com/a',format,undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('source'),headers:{'content-type':format==='text'?'text/plain':'text/markdown'}}])});assert.equal(r.source,'source');}
 await assert.rejects(acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'https://other.test/a'}}])}),/new consent/);
 let n=0;await assert.rejects(acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>++n===1?answer:[{address:'127.0.0.1',family:4}],request:transport([{status:302,headers:{location:'/b'}}])}),/not public/);
});
test('text policy rejects mismatched formats, charsets, compressed and excessive responses',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');
 for(const response of [
  {headers:{'content-type':'image/png'}},{headers:{'content-type':'text/html; charset=iso-8859-1'}},
  {headers:{'content-type':'text/html','content-encoding':'gzip'}},{headers:{'content-type':'text/html','content-length':String(3*1024*1024)}},
  {bytes:Buffer.from([255]),headers:{'content-type':'text/html'}},{bytes:Buffer.from('<meta charset="windows-1252">'),headers:{'content-type':'text/html'}},
  {bytes:Buffer.from('a'.repeat(200001)),headers:{'content-type':'text/html'}},{bytes:Buffer.from('a'.repeat(2*1024*1024+1)),headers:{'content-type':'text/html'}},
  {bytes:Buffer.from('\0'),headers:{'content-type':'text/html'}},{bytes:Buffer.from('é'),headers:{'content-type':'text/html; charset=us-ascii'}}
 ])await assert.rejects(acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>answer,request:transport([response])}));
 await assert.rejects(acquireRemoteText('https://example.com/a','video'),/Unsupported/);
 await assert.rejects(acquireRemoteText('https://example.com/a','markdown',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('<html>'),headers:{'content-type':'text/markdown'}}])}),/not Markdown/);
});
test('cancellation interrupts pending text DNS and streaming requests',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');
 const controller=new AbortController(),pending=acquireRemoteText('https://example.com/a','html',controller.signal,{lookup:()=>new Promise(()=>{}),request:()=>assert.fail('must not connect')});controller.abort();await assert.rejects(pending);
 const streaming=new AbortController();let stop;
 const result=acquireRemoteText('https://example.com/a','html',streaming.signal,{lookup:async()=>answer,request:(_u,options,callback)=>{const req=new EventEmitter();req.end=()=>{const stream=new Readable({read(){}});stream.statusCode=200;stream.headers={'content-type':'text/html'};callback(stream);stop=()=>stream.destroy(Error('aborted'));options.signal.addEventListener('abort',stop);queueMicrotask(()=>streaming.abort());};return req;}});await assert.rejects(result,/aborted/);
});

test('explicit Markdown accepts text/plain without admitting an HTML response',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');
 const dependencies=bytes=>({lookup:async()=>answer,request:transport([{bytes:Buffer.from(bytes),headers:{'content-type':'text/plain'}}])});
 const result=await acquireRemoteText('https://example.com/readme.md','markdown',undefined,dependencies('# Heading'));assert.equal(result.format,'markdown');assert.equal(result.source,'# Heading');assert.equal(result.mediaType,'text/plain');
 await assert.rejects(acquireRemoteText('https://example.com/readme.md','markdown',undefined,dependencies('<!doctype html><html>')),/not Markdown/);
});


test('scholarly acquisition fixes provider endpoints and preserves remote security boundaries',async()=>{
 const {acquireScholarlyJson}=await import('./asset-remote.mjs');
 let seen;const r=await acquireScholarlyJson('datacite','10.1234/a/b',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('{"data":{}}'),headers:{'content-type':'application/vnd.api+json'}}],u=>seen=u.href)});
 assert.equal(seen,'https://api.datacite.org/dois/10.1234%2Fa%2Fb');assert.equal(new TextDecoder().decode(r.bytes),'{"data":{}}');
 await assert.rejects(acquireScholarlyJson('arbitrary','10.1234/a'),/Invalid/);
 for(const response of [{status:302,headers:{location:'https://private.example/x'}},{headers:{'content-type':'text/html'}},{headers:{'content-type':'application/json','content-length':String(2*1024*1024+1)}}])await assert.rejects(acquireScholarlyJson('crossref','10.1234/a',undefined,{lookup:async()=>answer,request:transport([response])}));
 await assert.rejects(acquireScholarlyJson('crossref','10.1234/a',undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}]}),/not public/);
});

test('Wikipedia acquisition resolves once and pins the second call to the selected revision',async()=>{
 const {acquireEncyclopedia}=await import('./asset-remote.mjs');const seen=[];
 const first=Buffer.from(JSON.stringify({query:{pages:[{ns:0,pageid:42,revisions:[{revid:123}]}]}})),second=Buffer.from('{"parse":{"revid":123}}');
 const r=await acquireEncyclopedia({site:'en.wikipedia.org',title:'Redirect'},undefined,{lookup:async()=>answer,request:transport([first,second].map(bytes=>({bytes,headers:{'content-type':'application/json'}})),url=>seen.push(url))});
 assert.equal(seen[0].searchParams.get('redirects'),'1');assert.equal(seen[1].searchParams.get('oldid'),'123');assert.equal(seen[1].searchParams.has('page'),false);assert.deepEqual(Buffer.from(r.responses[1]),second);
 for(const source of ['Q42/../../evil',{site:'en.wikipedia.org.evil',title:'A'},{site:'localhost',title:'A'}])await assert.rejects(acquireEncyclopedia(source));
 await assert.rejects(acquireEncyclopedia('Q42',undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}]}),/public/);
 await assert.rejects(acquireEncyclopedia('Q42',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'https://evil.test/api'}}])}),/consent/);
 await assert.rejects(acquireEncyclopedia('Q42',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('<html>'),headers:{'content-type':'text/html'}}])}),/JSON/);
});

test('IIIF JSON uses protected acquisition, rejects wrong MIME, origin changes and nonpublic DNS',async()=>{
 const {acquireIIIF}=await import('./asset-remote.mjs');const bytes=Buffer.from('{"exact":"source"}');const r=await acquireIIIF('https://example.com/manifest','json',undefined,{lookup:async()=>answer,request:transport([{bytes,headers:{'content-type':'application/ld+json; charset=utf-8'}}])});assert.deepEqual(Buffer.from(r.bytes),bytes);
 await assert.rejects(acquireIIIF('https://example.com/manifest','json',undefined,{lookup:async()=>answer,request:transport([{bytes,headers:{'content-type':'text/html'}}])}),/not JSON/);
 await assert.rejects(acquireIIIF('https://example.com/manifest','json',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'https://other.example/manifest'}}])}),/new consent/);
 await assert.rejects(acquireIIIF('https://example.com/manifest','json',undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}],request:()=>assert.fail('private request')}),/not public/);
 await assert.rejects(acquireIIIF('https://example.com/manifest','json',undefined,{lookup:async()=>answer,request:transport([{headers:{'content-length':String(9*1024*1024)}}])}),/rejected/);
});
test('IIIF tile decoding is bounded and original PNG bytes are preserved',async()=>{
 const sharp=(await import('sharp')).default,{acquireIIIF}=await import('./asset-remote.mjs');for(const size of [512,513]){const bytes=await sharp({create:{width:size,height:size,channels:3,background:'#abc'}}).png().toBuffer();const result=acquireIIIF('https://example.com/tile','tile',undefined,{lookup:async()=>answer,request:transport([{bytes,headers:{'content-type':'image/png'}}])});if(size===513)await assert.rejects(result,/limit/);else{const r=await result;assert.equal(r.width,512);assert.deepEqual(Buffer.from(r.bytes),bytes);}}
});

test('PDF acquisition keeps HTTPS public-address/redirect authority and validates content type and original byte cap',async()=>{
 const {acquirePdf}=await import('./asset-remote.mjs'),bytes=Buffer.from('%PDF-1.7\nretained original');
 const deps=responses=>({lookup:async()=>answer,request:transport(responses,(_u,options)=>{assert.equal(options.headers.Accept,'application/pdf');assert.equal(options.headers.Cookie,undefined);})});
 const r=await acquirePdf('https://papers.example/work.pdf?source=clipboard',undefined,deps([{bytes,headers:{'content-type':'application/pdf'}}]));assert.deepEqual(Buffer.from(r.bytes),bytes);assert.equal(r.endpoint,'https://papers.example/work.pdf?source=clipboard');
 await assert.rejects(acquirePdf('https://papers.example/work.pdf',undefined,deps([{bytes,headers:{'content-type':'text/html'}}])),/not served as PDF/);
 await assert.rejects(acquirePdf('https://papers.example/work.pdf',undefined,deps([{headers:{'content-type':'application/pdf','content-length':String(50*1024*1024+1)}}])),/rejected/);
 await assert.rejects(acquirePdf('https://papers.example/work.pdf',undefined,deps([{status:302,headers:{location:'https://private.example/work.pdf'}}])),/new consent/);
 await assert.rejects(acquirePdf('https://papers.example/work.pdf',undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}]}),/not public/);
});

test('academic identifiers choose fixed endpoints; remote OCR and PMC PDF retain transport boundaries',async()=>{
 const {acquireAcademicRecord,acquireOcrXml,acquirePdf}=await import('./asset-remote.mjs');let seen;
 const r=await acquireAcademicRecord({family:'orcid',key:'0000-0002-1825-0097'},undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('{}'),headers:{'content-type':'application/json'}}],u=>seen=u.href)});assert.equal(seen,'https://pub.orcid.org/v3.0/0000-0002-1825-0097/record');assert.equal(r.bytes.length,2);
 await assert.rejects(acquireAcademicRecord({family:'orcid',key:'../../etc/passwd'}),/Unsupported/);
 await assert.rejects(acquireOcrXml('https://example.org/ocr.xml',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('<script/>'),headers:{'content-type':'text/html'}}])}),/must be XML/);
 const bytes=Buffer.from('%PDF-1.7 fixture');const deps=()=>({lookup:async()=>answer,request:transport([{bytes,headers:{'content-type':'binary/octet-stream'}}])});
 assert.deepEqual(Buffer.from((await acquirePdf('https://pmc-oa-opendata.s3.amazonaws.com/PMC123.1/PMC123.1.pdf',undefined,deps())).bytes),bytes);
 await assert.rejects(acquirePdf('https://example.org/file.pdf',undefined,deps()),/not served as PDF/);
 await assert.rejects(acquirePdf('https://pmc-oa-opendata.s3.amazonaws.com/other.pdf',undefined,deps()),/not served as PDF/);
});

test('web metadata shares SSRF, redirects, MIME and credential boundaries without discovered endpoint access',async()=>{
 const {acquireWebMetadata}=await import('./asset-remote.mjs');const dep=(responses,inspect)=>({lookup:async()=>answer,request:transport(responses,inspect)});
 const r=await acquireWebMetadata('https://example.org/page','html',undefined,dep([{bytes:Buffer.from('<title>Exact</title>'),headers:{'content-type':'text/html; charset=utf-8'}}],(_u,o)=>assert.equal(o.headers.Cookie,undefined)));assert.equal(r.body,'<title>Exact</title>');
 await assert.rejects(acquireWebMetadata('https://example.org','bluesky'),/endpoint/);
 await assert.rejects(acquireWebMetadata('https://example.org','html',undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}],request:()=>assert.fail('private network')}),/not public/);
 await assert.rejects(acquireWebMetadata('https://example.org','html',undefined,dep([{status:302,headers:{location:'https://elsewhere.org'}}])),/new consent/);
 for(const response of [{status:403},{status:429},{headers:{'content-type':'image/svg+xml'}},{headers:{'content-type':'text/html','content-length':String(3*1024*1024)}},{headers:{'content-type':'text/html; charset=latin1'}}])await assert.rejects(acquireWebMetadata('https://example.org','html',undefined,dep([response])));
});
test('everyday metadata retains UTF-8 originals and preserves protected endpoint, DNS, redirect and MIME bounds',async()=>{
 const {acquireWebMetadata}=await import('./asset-remote.mjs');const dep=(responses,inspect)=>({lookup:async()=>answer,request:transport(responses,inspect)});
 const original='\uFEFFBEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';assert.equal((await acquireWebMetadata('https://example.org/a.ics','calendar',undefined,dep([{bytes:Buffer.from(original),headers:{'content-type':'text/calendar'}}],(_u,o)=>{assert.equal(o.headers.Cookie,undefined);assert.equal(o.headers.Authorization,undefined);}))).body,original);
 for(const format of ['spotify','soundcloud','github','apple-podcast'])await assert.rejects(acquireWebMetadata('https://evil.example/api',format),/endpoint/);
 for(const format of ['feed','calendar']){
  await assert.rejects(acquireWebMetadata('https://example.org/file',format,undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}],request:()=>assert.fail('private')}),/not public/);
  await assert.rejects(acquireWebMetadata('https://example.org/file',format,undefined,dep([{status:302,headers:{location:'https://other.example/file'}}])),/new consent/);
  await assert.rejects(acquireWebMetadata('https://example.org/file',format,undefined,dep([{bytes:Buffer.from('<html/>'),headers:{'content-type':'text/html'}}])),/Content-Type/);
  await assert.rejects(acquireWebMetadata('https://example.org/file',format,undefined,dep([{status:429}])),/429/);
 }
});

test('image size inspection uses only HEAD across public redirects and never consumes the body',async()=>{
 const {inspectImageReference}=await import('./asset-remote.mjs');const seen=[];let reads=0;
 const responses=[{status:302,headers:{location:'https://upload.example.org/large.jpg'}},{status:200,headers:{'content-type':'image/jpeg','content-length':'107119245'}}];
 const result=await inspectImageReference('https://commons.example.org/file',undefined,{lookup:async()=>answer,request:(url,options,callback)=>{
  assert.equal(options.method,'HEAD');seen.push(url.hostname);options.lookup(url.hostname,{},(_,address)=>assert.equal(address,'8.8.8.8'));
  const req=new EventEmitter();req.end=()=>{const r=responses.shift(),body=new Readable({read(){reads++;}});body.statusCode=r.status;body.headers=r.headers;callback(body);};return req;
 }});
 assert.deepEqual(result,{byteLength:107119245});assert.equal(reads,0);assert.deepEqual(seen,['commons.example.org','upload.example.org']);
});
test('image HEAD rejects private redirects, bounds redirects and cancels DNS; unknown length is not zero',async()=>{
 const {inspectImageReference}=await import('./asset-remote.mjs');
 for(const headers of [{},{'content-length':'bad'},{'content-length':'9007199254740993'},{'content-length':'-1'},{'content-length':'123','content-encoding':'gzip'}])assert.deepEqual(await inspectImageReference('https://example.org/a',undefined,{lookup:async()=>answer,request:transport([{headers:{'content-type':'image/png',...headers}}])}),{byteLength:null});
 await assert.rejects(inspectImageReference('https://example.org/a',undefined,{lookup:async h=>h==='example.org'?answer:[{address:'127.0.0.1',family:4}],request:transport([{status:302,headers:{location:'http://internal.example/a'}}])}),/not public/);
 await assert.rejects(inspectImageReference('https://example.org/a',undefined,{lookup:async()=>answer,request:transport(Array.from({length:4},()=>({status:302,headers:{location:'/again'}})))}),/redirect limit/);
 await assert.rejects(inspectImageReference('https://example.org/a',undefined,{lookup:async()=>answer,request:transport([{status:405}])}),/405/);
 const controller=new AbortController(),pending=inspectImageReference('https://example.org/a',controller.signal,{lookup:()=>new Promise(()=>{})});controller.abort();await assert.rejects(pending);
});
