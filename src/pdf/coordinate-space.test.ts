// @vitest-environment node
import {expect,it} from 'vitest';
import {addressForPoint,blockAddress,cellAddress,documentTriple,formatAddress,fromTopLeftBox,geometryForAddress,pageAddress,parseAddress,type PageGeometry} from './coordinate-space';
import {checkedPdfCapture,samePdfCapture} from './capture';
import {pdfCaptureFixture} from './fixtures';
const identity='sha256:'+'b'.repeat(64);
const page=(pageIndex:number,rotation=0):PageGeometry=>({
 pageIndex,
 frame:{viewBox:rotation===90?[0,0,792,612]:[0,0,612,792],rotation},
 text:'Alpha beta\ngamma delta epsilon\nzeta',
 blocks:[
  {ordinal:0,range:{start:0,end:10},bbox:[40,700,200,20]},
  {ordinal:1,range:{start:11,end:30},bbox:[40,660,300,20],cells:[{range:{start:11,end:19},bbox:[40,660,140,20]},{range:{start:20,end:30},bbox:[190,660,150,20]}]},
 ],
});
it('derives a deterministic 1..999 document triple from the identity string',()=>{
 const triple=documentTriple(identity);
 expect(triple).toEqual(documentTriple(identity));expect(triple).toHaveLength(3);
 for(const n of triple){expect(Number.isInteger(n)).toBe(true);expect(n).toBeGreaterThanOrEqual(1);expect(n).toBeLessThanOrEqual(999);}
 expect(documentTriple('sha256:'+'c'.repeat(64))).not.toEqual(triple);
});
it('round-trips geometry to address to geometry exactly, including table cells',()=>{
 const p=page(0),block=p.blocks[1];
 const address=blockAddress(identity,p,block);
 expect(address.slice(3)).toEqual([1,2,0,2,1,19]);
 expect(geometryForAddress(p,address)).toEqual(block.bbox);
 expect(parseAddress(formatAddress(address))).toEqual(address);
 const cell=cellAddress(identity,p,block,1);
 expect(cell.slice(3)).toEqual([1,2,2,2,10,10]);
 expect(geometryForAddress(p,cell)).toEqual(block.cells![1].bbox);
 expect(parseAddress(formatAddress(cell))).toEqual(cell);
 const whole=pageAddress(identity,p);
 expect(whole.slice(3)).toEqual([1,0,0,1,1,p.text.length]);
 expect(geometryForAddress(p,whole)).toEqual([0,0,612,792]);
 expect(parseAddress(formatAddress(whole))).toEqual(whole);
 expect(()=>parseAddress('1.2.3/0.0.0/1.1.0')).toThrow('Invalid phext address');
 expect(()=>parseAddress('1.2.3/1.0.0/0.1.0')).toThrow('Invalid phext address');
});
it('addresses regions out of stream order: page 3 is placed before page 1 is read',()=>{
 const third=page(2),first=page(0);
 // The page-3 region is addressed first; placement carries no sequence.
 const late=blockAddress(identity,third,third.blocks[0]);
 expect(late[3]).toBe(3);expect(late[4]).toBe(1);
 expect(geometryForAddress(third,late)).toEqual(third.blocks[0].bbox);
 // The same address names nothing on page 1, and page 1 addressing is unaffected.
 expect(geometryForAddress(first,late)).toBeUndefined();
 const early=blockAddress(identity,first,first.blocks[0]);
 expect(early[3]).toBe(1);expect(early.slice(0,3)).toEqual(late.slice(0,3));
});
it('keeps rotated-page geometry inside the page frame (rotation 90)',()=>{
 const p:PageGeometry={pageIndex:0,frame:{viewBox:[0,0,792,612],rotation:90},text:'Rotated page text',blocks:[{ordinal:0,range:{start:0,end:7},bbox:[40,500,200,20]}]};
 const address=addressForPoint(identity,p,100,510);
 expect(address).toEqual(blockAddress(identity,p,p.blocks[0]));
 expect(geometryForAddress(p,address)).toEqual([40,500,200,20]);
 expect(geometryForAddress(p,pageAddress(identity,p))).toEqual([0,0,792,612]);
});
it('resolves points to the smallest containing space: cell, then block, then page',()=>{
 const p=page(0);
 expect(addressForPoint(identity,p,250,670)).toEqual(cellAddress(identity,p,p.blocks[1],1));
 expect(addressForPoint(identity,p,100,710)).toEqual(blockAddress(identity,p,p.blocks[0]));
 expect(addressForPoint(identity,p,500,100)).toEqual(pageAddress(identity,p));
});
it('converts top-left-origin engine boxes into the repository frame',()=>{
 expect(fromTopLeftBox({viewBox:[0,0,612,792],rotation:0},{x:40,y:52,width:200,height:20})).toEqual([40,720,200,20]);
 expect(fromTopLeftBox({viewBox:[10,20,622,812],rotation:0},{x:40,y:52,width:200,height:20})).toEqual([50,740,200,20]);
});
it('accepts the local-file provenance class in checkedPdfCapture and nothing looser',()=>{
 const base=pdfCaptureFixture(),local={...base,endpoint:'local-file',sourceUrl:'work.pdf'};
 expect(checkedPdfCapture(local)).toBe(local);expect(()=>samePdfCapture(local,structuredClone(local))).not.toThrow();
 expect(()=>checkedPdfCapture({...local,sourceUrl:'dir/work.pdf'})).toThrow('provenance');
 expect(()=>checkedPdfCapture({...local,sourceUrl:'https://papers.example/work.pdf'})).toThrow('provenance');
 expect(()=>checkedPdfCapture({...local,sourceUrl:''})).toThrow('provenance');
 expect(()=>checkedPdfCapture({...base,endpoint:'local-file'})).toThrow('provenance');
 expect(()=>checkedPdfCapture({...base,sourceUrl:'work.pdf'})).toThrow();
});
