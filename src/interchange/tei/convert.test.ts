// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertTei as convertCurrentTei, convertTeiFragment } from './convert';
import { defaultTeiLimits, teiLimits } from './model';
import { decodeBlockTree } from '../../block-tree/codecs';
import { captureNative, decodeNative, nativeBytes } from '../../persistence/native-resource';
import { projectSaved } from '../../knowledge-sqlite/saved-projection';
import type { ExistingBlockDto } from '../../block-tree/types';
import { teiModes, teiStandoffProperties, teiBlockProperties, teiRecordTypes } from './definitions';
const wrap = (body: string) => `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>${body}</body></text></TEI>`;
export function blocks(b: ExistingBlockDto): ExistingBlockDto[] { return [b, ...b.children?.flatMap(blocks) ?? []]; }
const texts = (r: ReturnType<typeof convertTei>) => blocks(r.document).filter(b => b.type === 'standoff-editor-block').map(b => b.text);
const defs = (r: ReturnType<typeof convertTei>): any[] => Object.values(r.document.linkedAnnotations as object);
const annotations = (r: ReturnType<typeof convertTei>): any[] => blocks(r.document).flatMap(b => b.standoffProperties as any[] ?? []);
const fixture = (name: string) => readFileSync(`src/interchange/tei/fixtures/${name}`, 'utf8');
afterEach(() => vi.restoreAllMocks());

it('uses genuine text Blocks, native Modes, independent semantic overlaps and exactly one Page', () => {
 const r = convertTei(wrap('<div><head>Heading</head><lg><l>A <persName ref="#missing"><del>😀é</del></persName></l></lg><sp who="#missing"><speaker>A</speaker><stage>aside</stage><p>Speech</p></sp></div>'));
 expect(r.document.children).toHaveLength(1); expect(r.document.children![0].type).toBe('page-block');
 const all = blocks(r.document); expect(all.filter(b => b.type === 'page-block')).toHaveLength(1);
 expect(all.map(b => b.mode)).toEqual(expect.arrayContaining(['tei/section','tei/heading','tei/verse-group','tei/verse-line','tei/dramatic-speech','tei/speaker','tei/stage-direction']));
 expect(texts(r)).toContain('A 😀é');
 const deletion = defs(r).find(d => d.metadata.role === 'tei/deletion'); expect(deletion.isDeleted).toBeUndefined();
 expect(annotations(r).find(p => p.annotationId === deletion.id)).toMatchObject({start:2,end:4});
});

it('recovers known descendants under unknown and foreign wrappers without interpreting foreign TEI names', () => {
 const r = convertTei(wrap('<unknown odd="yes"><p>A <persName>Mary</persName></p><x:del xmlns:x="urn:other">still here</x:del></unknown><p><div><p>imperfect nesting</p></div></p>'));
 expect(texts(r).join('')).toContain('A Marystill hereimperfect nesting');
 expect(defs(r).some(d=>d.metadata.role==='tei/person-name')).toBe(true);
 expect(defs(r).find(d=>d.metadata.namespace==='urn:other')).toMatchObject({type:'tei/semantic'});
 expect(r.diagnostics.map(d=>d.code)).toContain('generic-element');
 expect(JSON.stringify(r.document)).toContain('"odd":"yes"');
});

it('preserves forward, broken, duplicate, external and ordered references without services or placeholders', () => {
 const fetch = vi.spyOn(globalThis, 'fetch');
 const r = convertTei(wrap('<p><persName ref="#later #missing #later https://example.test/#later">A</persName><name target="#dup" corresp="#missing" who="#missing" ana="#missing" wit="#w2 #w1 #w2">B</name></p><p xml:id="later">later</p><p xml:id="dup">one</p><p xml:id="dup">two</p><p xml:base="https://example.test/other"><name ref="#later">C</name></p>'));
 const a = defs(r).find(d=>d.metadata.role==='tei/person-name').metadata.references[0];
 expect(a.raw).toBe('#later #missing #later https://example.test/#later');
 expect(a.tokens.map((t:any)=>t.state)).toEqual(['resolved','unresolved','resolved','unresolved']);
 expect(a.tokens[0].target).toEqual(a.tokens[2].target);
 const ambiguity = defs(r).flatMap(d=>d.metadata.references??[]).flatMap((r:any)=>r.tokens).find((t:any)=>t.state==='ambiguous');
 expect(ambiguity.candidates).toHaveLength(2); expect(ambiguity.target).toBeUndefined();
 expect(defs(r).some(d=>d.type==='mutable/gloss')).toBe(false); expect(fetch).not.toHaveBeenCalled();
 const external = defs(r).find(d=>d.metadata.references?.[0].base); expect(external.metadata.references[0].tokens[0]).toMatchObject({scope:'external',state:'unresolved',effectiveUri:'https://example.test/other#later'});
});

it('keeps header secondary and distinguishes correspondence roles, dates and genuine local Entities', () => {
 const r = convertTei('<TEI><teiHeader><fileDesc><titleStmt><title>Letter title</title><author><persName>Clara</persName></author></titleStmt></fileDesc><profileDesc><correspDesc><correspAction type="sent"><persName ref="#alice">Alice</persName><placeName ref="#london">London</placeName><date when="1842-05-03">3 May</date></correspAction><correspAction type="received"><persName ref="#bob">Bob</persName><date when="1842-05-05">5 May</date></correspAction></correspDesc><listPerson><person xml:id="alice"><persName>Alice</persName></person></listPerson></profileDesc></teiHeader><text><body><opener><dateline><date type="writing" when="1842-05-02">2 May</date></dateline><salute>Dear Editor</salute></opener><p>Body</p><closer><signed>A.</signed></closer></body></text></TEI>');
 const row = r.document.children![0].children![0]; expect(row.type).toBe('tab-row-block');
 expect(row.children!.map(b=>b.metadata)).toEqual([{name:'Text',active:true},{name:'Metadata',active:false}]);
 expect(blocks(row.children![0]).some(b=>b.text==='Clara')).toBe(false);
 const ds=defs(r); expect(ds.filter(d=>d.type==='mutable/gloss')).toHaveLength(1);
 const sent=ds.find(d=>d.type==='tei/correspAction'&&d.metadata.role==='tei/sent'); expect(sent.metadata.participantAnnotationIds).toHaveLength(1);
 expect(ds.map(d=>d.metadata.role)).toEqual(expect.arrayContaining(['tei/author','tei/sending-date','tei/receiving-date','tei/writing-date']));
 const metadata=r.document.metadata as any; expect(metadata.title).toBe('Letter title'); expect(metadata.tei.header.titleBlockIds).toHaveLength(1); expect(metadata.tei.header.authorBlockIds).toHaveLength(1);
 const alice=ds.find(d=>d.metadata.references?.[0]?.raw==='#alice'); expect(alice.metadata.references[0].tokens[0].state).toBe('resolved');
 expect(annotations(r).some(p=>p.type==='codex/entity-reference')).toBe(false);
});

it('retains incomplete correspondence without inventing a participant', () => {
 const r=convertTei('<TEI><teiHeader><correspDesc><correspAction type="sent"/></correspDesc></teiHeader><text><p>Letter</p></text></TEI>');
 expect(defs(r).find(d=>d.type==='tei/correspAction').metadata.participantAnnotationIds).toEqual([]);
 expect(defs(r).filter(d=>d.type==='mutable/gloss')).toHaveLength(0);
 expect(texts(r).join('')).toContain('participant not recorded');
});

it('keeps every alternative without Cartesian multiplication, duplication of context or destructive deletion', () => {
 const r=convertTei(wrap('<p>before<choice><orig>olde</orig><reg>old</reg><abbr/><expan>expanded</expan></choice>after<app><rdg wit="#absent">reading<choice><sic>x</sic><corr>y</corr></choice></rdg><lem>lemma</lem></app><del>deleted</del></p>'));
 const rows=blocks(r.document).filter(b=>b.type==='tab-row-block'); expect(rows).toHaveLength(3);
 expect(rows.map(b=>b.children!.length)).toEqual([4,2,2]);
 rows.forEach(row=>expect(row.children!.filter(b=>(b.metadata as any).active)).toHaveLength(1));
 expect(texts(r).filter(t=>t==='before')).toHaveLength(1); expect(texts(r)).toEqual(expect.arrayContaining(['olde','old','','expanded','after','reading','x','y','lemma','deleted']));
 expect(annotations(r).some(p=>p.isDeleted||p.type==='text/superposition')).toBe(false);
});

it('keeps page breaks distinct from the native Page and emits exact qualified points', () => {
 const r=convertTei(wrap('<p>ab<lb break="no"/>cd<pb n="2" facs="https://example.test/scan"/>ef<anchor xml:id="a"/>g<lb/>h</p><p><ref target="#a">anchor</ref></p>'));
 expect(texts(r)).toContain('abcdefg\nh'); expect(blocks(r.document).filter(b=>b.type==='page-block')).toHaveLength(1);
 const ms=defs(r).filter(d=>d.type==='tei/milestone'); expect(ms).toHaveLength(4);
 expect(ms.filter(d=>d.metadata.precision==='point')).toHaveLength(3);
 expect(annotations(r).filter(p=>p.isZeroWidth).map(p=>[p.start,p.end])).toEqual([[2,2],[4,4],[6,6]]);
 expect(defs(r).find(d=>d.metadata.role==='tei/reference').metadata.references[0].tokens[0]).toMatchObject({state:'resolved',target:{kind:'definition'}});
});

it.each(['<p>bad</wrong><p>later</p>', '<p q="broken>bad</p><p>later</p>', '<p>truncated'])('retains trusted rich prefix and literal malformed suffix: %s', bad => {
 const source='<TEI><text><body><p><persName>Good</persName></p>'+bad;
 const r=convertTei(source);
 expect(texts(r)[0]).toBe('Good'); expect(texts(r).slice(1).join('')).toBe(bad);
 expect(defs(r).some(d=>d.metadata.role==='tei/person-name')).toBe(true); expect(r.diagnostics.map(d=>d.code)).toContain('malformed-xml');
});

it('recovers subsequent semantics only through a fresh strict parse for undefined entities', () => {
 const r=convertTei(wrap('<p>A &missing; B</p><p><persName>Later</persName></p>'));
 expect(texts(r)).toEqual(['A &missing; B','Later']); expect(defs(r).some(d=>d.metadata.role==='tei/person-name')).toBe(true);
 expect(r.diagnostics.map(d=>d.code)).toContain('literal-entity'); expect(r.diagnostics.map(d=>d.code)).not.toContain('malformed-xml');
 const safe=convertTei(wrap('<p><![CDATA[<p>&missing;</p>]]></p><!-- <p>fake</p> --><p>real</p>'));
 expect(texts(safe)).toEqual(['<p>&missing;</p>','real']);
});

it('does not fetch or expand a DTD and preserves undefined entity spelling', () => {
 const fetch=vi.spyOn(globalThis,'fetch'); const r=convertTei('<!DOCTYPE TEI SYSTEM "https://example.test/evil" [<!ENTITY secret "HIDDEN">]>'+wrap('<p>&secret;</p>'));
 expect(texts(r)).toEqual(['&secret;']); expect(fetch).not.toHaveBeenCalled(); expect(r.diagnostics.map(d=>d.code)).toContain('doctype');
});

it('preserves mixed whitespace, significant indentation, language and code-point intervals', () => {
 const r=convertTei(wrap('<p xml:space="preserve" xml:lang="fr"> A <hi rend="italic">😀é</hi> B\r\n C </p>'));
 expect(texts(r)).toEqual([' A 😀é B\n C ']); const style=annotations(r).find(p=>p.type==='style/italics'); expect(style).toMatchObject({start:3,end:5});
 expect(defs(r)[0].metadata.language).toBe('fr');
});

it('supports configurable generous limits, explicit truncation, byte/depth guards and bounded diagnostics', () => {
 expect(defaultTeiLimits.cells).toBeGreaterThanOrEqual(2_000_000);
 const large=convertTei(wrap('<p>'+'a'.repeat(300_001)+'</p>')); expect(large.stats.cells).toBe(300_001); expect(large.truncated).toBe(false);
 const r=convertTei(wrap('<p>😀abcdef</p><p>omitted</p>'),{cells:3}); expect(r.truncated).toBe(true); expect(texts(r)).toEqual([expect.stringContaining('INCOMPLETE IMPORT'),'😀ab']);
 expect(()=>convertTei(wrap('<p>x</p>'),{bytes:5})).toThrow(/byte limit/); expect(()=>teiLimits({cells:NaN})).toThrow(/configuration/);
 const depth=convertTei(wrap('<div>'.repeat(20)+'x'+'</div>'.repeat(20)),{depth:8}); expect(depth.truncated).toBe(true); expect(texts(depth)[0]).toContain('INCOMPLETE IMPORT');
 const warnings=convertTei(wrap('<p>'+Array.from({length:100},(_,i)=>`<name ref="#x${i}">x</name>`).join('')+'</p>'),{diagnosticExamples:3});
 expect(warnings.diagnostics.reduce((n,d)=>n+d.examples.length,0)).toBeLessThanOrEqual(3); expect(warnings.diagnostics.find(d=>d.code==='unresolved-reference')?.count).toBe(100);
});

it('keeps fragment roots and definitions without a Document or Page', () => {
 const f=convertTeiFragment(wrap('<p><name ref="#x">A</name></p>'));
 expect(f.roots.flatMap(blocks).some(b=>['document-block','page-block'].includes(b.type!))).toBe(false);
 expect(Object.keys(f.definitions)).toHaveLength(1);
});

it('uses the required namespace in separate descriptive vocabularies', () => {
 expect([...teiModes.map(d=>d.mode),...teiStandoffProperties.map(d=>d.type),...teiBlockProperties.map(d=>d.type),...teiRecordTypes].every(t=>t.startsWith('tei/'))).toBe(true);
});

it('is semantically deterministic with fresh identities', () => {
 const source=wrap('<p xml:id="p"><name ref="#p #x">A</name></p><choice><orig>x</orig><reg>y</reg></choice>');
 const normalize=(value:unknown)=>{const ids=new Map<string,string>();return JSON.stringify(value).replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g,id=>{if(!ids.has(id))ids.set(id,'ID'+ids.size);return ids.get(id)!;});};
 const a=convertTei(source),b=convertTei(source); expect(a.document.id).not.toBe(b.document.id); expect(normalize(a)).toBe(normalize(b));
});

it.each(['A040080.xml','A041209.xml'])('converts real TEI %s and survives native capture, reload and saved projection', async name => {
 const r=convertTei(fixture(name)); expect(r.truncated).toBe(false); expect(r.stats.cells).toBeGreaterThan(1000);
 expect(blocks(r.document).filter(b=>b.type==='page-block')).toHaveLength(1);
 expect(defs(r).filter(d=>d.type==='tei/correspAction')).toHaveLength(2);
 const native=nativeBytes(captureNative(decodeBlockTree(r.document).state,r.document.id));
 const reloaded=decodeNative(native); expect(Object.values(reloaded.contents).filter(c=>c.viewType==='page-block')).toHaveLength(1);
 const projection=await projectSaved(native,'12345678-1234-1234-1234-123456789abc'); expect(projection.blocks.length).toBeGreaterThan(10);
 expect(JSON.stringify(reloaded)).toContain('tei/correspAction');
},30000);

it('qualifies a scholarly text above the former 200,000-Cell ceiling through native persistence', () => {
 const started=performance.now(),length=300_100;
 const result=convertTei(wrap(Array.from({length:100},()=>'<p>'+'a'.repeat(length/100)+'</p>').join('')));
 expect(result.stats.cells).toBe(length);expect(result.truncated).toBe(false);
 const bytes=nativeBytes(captureNative(decodeBlockTree(result.document).state,result.document.id));
 const saved=decodeNative(bytes);expect(Object.values(saved.contents).filter(c=>c.viewType==='text-cell')).toHaveLength(length);
 console.info('TEI scholarly native qualification',JSON.stringify({cells:length,bytes:bytes.length,elapsedMs:Math.round(performance.now()-started),heapMiB:Math.round(process.memoryUsage().heapUsed/1048576)}));
},120000);

it('retains root pointers, publication dates, alignment ordering and compound semantic roles',()=>{
 const r=convertTei('<TEI xml:id="root" corresp="#missing"><teiHeader><publicationStmt><date when="2020">2020</date></publicationStmt></teiHeader><text><body><p rend="left center">Aligned</p><postscript><p>Postscript body</p></postscript><p><ref target="#root">self</ref></p></body></text></TEI>');
 expect((r.document.metadata as any).tei.source.references[0].tokens[0].state).toBe('unresolved');
 expect(defs(r).find(d=>d.metadata.role==='tei/publication-date')).toBeTruthy();
 expect((blocks(r.document).find(b=>b.text==='Aligned')!.blockProperties as any[]).filter(p=>p.type==='block/alignment').map(p=>p.value)).toEqual(['left','center']);
 expect(blocks(r.document).some(b=>(b.blockProperties as any[]??[]).some(p=>p.metadata?.role==='tei/postscript'))).toBe(true);
 expect(defs(r).find(d=>d.metadata.role==='tei/reference').metadata.references[0].tokens[0]).toMatchObject({state:'resolved',target:{kind:'block',id:r.document.id}});
 const f=convertTeiFragment('<TEI xml:id="root"><p><ref target="#root">self</ref></p></TEI>');
 expect((Object.values(f.definitions)[0] as any).metadata.references[0].tokens[0].state).toBe('unresolved');
});

it.each([{blocks:3},{annotations:2},{references:2},{elements:6}])('recovers a valid bounded candidate when a configured budget is exhausted: %j',limits=>{
 const r=convertTei(wrap('<p>before</p><p xml:id="retained"><name ref="#one #two #three">text</name></p><p>after</p>'),limits);
 expect(r.truncated).toBe(true);expect(texts(r)[0]).toContain('INCOMPLETE IMPORT');
 expect(()=>captureNative(decodeBlockTree(r.document).state,r.document.id)).not.toThrow();
});

it('does not discard spaces in mixed content containing alternatives or nested header names',()=>{
 const r=convertTei('<TEI><teiHeader><titleStmt><author><persName>A</persName> <persName>B</persName></author></titleStmt></teiHeader><text><p>one<hi> </hi>two <choice><orig>x</orig><reg>y</reg></choice> three</p></text></TEI>');
 expect(texts(r)).toEqual(expect.arrayContaining(['A B','one two ',' three']));
});

it('counts heading presentation properties against the same annotation budget',()=>{
 const r=convertTei(wrap('<head>First</head><head>Second</head>'),{annotations:1});
 expect(r.truncated).toBe(true);expect(texts(r)).toContain('First');expect(texts(r)[0]).toContain('INCOMPLETE IMPORT');
});

it('treats prototype-like XML names and rendition values as unknown source data',()=>{
 const r=convertTei(wrap('<constructor><p>A</p></constructor><toString>B</toString><__proto__ note="kept">C</__proto__><p><hi rend="constructor">D</hi><name __proto__="retained">E</name></p>'));
 expect(texts(r).join('')).toBe('ABCDE');expect(defs(r).some(d=>d.metadata.fields?.__proto__==='retained')).toBe(true);
 expect(()=>captureNative(decodeBlockTree(r.document).state,r.document.id)).not.toThrow();
});

it('does not reject useful content for one local NUL corruption',()=>{
 const xml=wrap('<p><persName>Trusted</persName></p><p>Local\0defect</p><p>Later</p>');
 const r=convertTei(new TextEncoder().encode(xml));expect(texts(r)[0]).toBe('Trusted');
 expect(texts(r).slice(1).join('')).toContain('Local\0defect');expect(texts(r).slice(1).join('')).toContain('Later');
 expect(r.diagnostics.some(d=>d.code==='malformed-xml')).toBe(true);
 expect(()=>captureNative(decodeBlockTree(r.document).state,r.document.id)).not.toThrow();
});

// Retained M1–M3 grouped conversion compatibility oracle.
function convertTei(...args: Parameters<typeof convertCurrentTei>) { return convertCurrentTei(args[0], args[1], args[2], args[3], { ...args[4], inlineAlternatives: false }); }
