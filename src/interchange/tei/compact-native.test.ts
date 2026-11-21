// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertTei as convertCurrentTei } from './convert';
// Preserve the pre-M4 grouped-alternative compatibility oracle.
const convertTei: typeof convertCurrentTei = (source, limits, filename, timings, options) => convertCurrentTei(source, limits, filename, timings, { ...options, inlineAlternatives: false });
import { encodeTeiNative } from './compact-native';
import { decodeBlockTree, encodeDocument } from '../../block-tree/codecs';
import { captureNative, decodeNative, nativeBytes, nativeText } from '../../persistence/native-resource';
import { resourceToRepository } from '../../history/durable-core';
const sources = [
 ...['A040080.xml','A041209.xml'].map(name=>readFileSync(`src/interchange/tei/fixtures/${name}`,'utf8')),
 '<TEI><teiHeader><listPerson><person xml:id="alice"><persName>Alice</persName></person></listPerson></teiHeader><text><p>😀 <persName ref="#alice #missing"><del>Alice</del></persName><lb/>x<pb/><choice><orig>a</orig><reg><choice><sic>b</sic><corr/></choice></reg></choice></p></text></TEI>',
 '<TEI><p>Trusted <persName ref="#missing">Alice</persName></p><p>Broken</wrong><p>Later</p></TEI>',
 '<TEI><p>foo &undefined; <persName ref="#unknown">Bar</persName></p></TEI>',
 '<TEI/>',
];
it.each(sources.map((xml,index)=>({xml,index})))('matches the canonical codec oracle without worker Cell construction (case $index)',({xml})=>{
 const {document}=convertTei(xml),encoded=encodeTeiNative(document),decoded=decodeNative(encoded.bytes);
 const oracle=decodeBlockTree(document).state,actual=resourceToRepository(decoded);
 expect(encodeDocument(actual)).toEqual(encodeDocument(oracle));
 const original=captureNative(oracle,document.id!);
 // Placement identities are intentionally fresh, but every authored field,
 // native range, definition, reference and child order matches the old path.
 expect(encodeDocument(resourceToRepository(decodeNative(nativeBytes(original))))).toEqual(encodeDocument(actual));
 expect(nativeText(captureNative(actual,document.id!))).toContain('mutable-document');
 expect(encoded.counts.contents).toBe(0);expect(encoded.counts.placements).toBe(0);
});
it('preserves bounded partial content and the visible notice through native decoding',()=>{
 const {document}=convertTei('<TEI><p>abcdef</p></TEI>',{cells:3});
 const actual=encodeDocument(resourceToRepository(decodeNative(encodeTeiNative(document).bytes)));
 expect(actual).toEqual(encodeDocument(decodeBlockTree(document).state));expect(JSON.stringify(actual)).toContain('INCOMPLETE IMPORT');
});
it('fails closed if future producers emit unsupported structure instead of silently losing it',()=>{
 const {document}=convertTei('<TEI/>');document.children![0].relation={leftMargin:{type:'standoff-editor-block',text:'x'}};
 expect(()=>encodeTeiNative(document)).toThrow(/unsupported structure/);
});
