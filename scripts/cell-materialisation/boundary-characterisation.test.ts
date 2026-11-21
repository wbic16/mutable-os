// Investigation characterisation only: records current contracts, including point inconsistency.
import {it,expect} from 'vitest';
import {mapStandoffPropertiesForReplacement} from '../../src/interchange/ranges';
import {decodeBlockTree} from '../../src/block-tree/codecs';
import {captureNative,nativeBytes,decodeNative} from '../../src/persistence/native-resource';
import {graphemeBoundaries} from '../../src/input/graphemes';
const map=(p:any,start:number,end:number,count:number)=>mapStandoffPropertiesForReplacement([p],start,end,count,[],6) as any[];
it('characterises inclusive range edges, interior insertion and complete deletion without Cell keys',()=>{
 const p={id:'p',type:'style/bold',start:1,end:3};
 expect(map(p,1,1,1)[0]).toMatchObject({start:2,end:4});
 expect(map(p,2,2,1)[0]).toMatchObject({start:1,end:4});
 expect(map(p,4,4,1)[0]).toMatchObject({start:1,end:3});
 expect(map(p,1,4,0)).toEqual([]);
});
it('records the existing equal-end versus end-before-start point conventions without repairing either',()=>{
 expect(map({start:1,end:1,isZeroWidth:true},0,0,1)[0]).toMatchObject({start:2,end:2});
 expect(map({start:1,end:0,isZeroWidth:true},0,0,1)[0]).toMatchObject({start:1,end:0});
});
it('distinguishes code-point coordinates from UTF16 and grapheme navigation',()=>{
 const text='A😀e\u0301';expect(text.length).toBe(5);expect([...text]).toHaveLength(4);expect(graphemeBoundaries(text)).toEqual([0,1,2,4]);
});
it('native round trips preserve authored data while regenerating private Cell keys',()=>{
 const dto={id:'doc',type:'document-block',children:[{id:'t',type:'standoff-editor-block',text:'A😀e\u0301',standoffProperties:[{id:'p',type:'style/bold',start:1,end:3}]}]};
 const bytes=nativeBytes(captureNative(decodeBlockTree(dto).state,'doc'));
 const a=decodeNative(bytes),b=decodeNative(bytes),cells=(r:typeof a)=>Object.values(r.contents).filter(c=>c.viewType==='text-cell').map(c=>c.key);
 expect(cells(a)).toHaveLength(4);expect(cells(a).every(k=>!cells(b).includes(k))).toBe(true);
 expect(nativeBytes(a)).toEqual(bytes);expect(nativeBytes(b)).toEqual(bytes);
});
