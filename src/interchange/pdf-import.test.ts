// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {Blob as NodeBlob} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {detectFormat,formats} from './formats';
import {readSelectedFile} from './file-input';
import {prepareFiles} from './document-import';
import {checkedPdfCapture} from '../pdf/capture';
import {PDF_BLOCK} from '../pdf/model';
import {pdfFixture} from '../pdf/fixtures';
const file=(name:string,value:string|Uint8Array,type='')=>({name,blob:new NodeBlob([value],{type}) as unknown as Blob});
it('registers the pdf import format on the LiteParse adapter profile',()=>{
 const row=formats.find(f=>f.id==='pdf');
 expect(row).toMatchObject({label:'PDF document',extensions:['pdf'],mediaTypes:['application/pdf'],operations:['import','insert'],adapter:'liteparse-resource',profile:'mutable-liteparse-v1'});
});
it('detects PDFs by signature and rejects renamed or mismatched content',async()=>{
 vi.stubGlobal('crypto',webcrypto);
 expect(detectFormat('paper.pdf','application/pdf',pdfFixture())).toBe('pdf');
 expect(()=>detectFormat('paper.pdf','application/pdf',new TextEncoder().encode('not a pdf at all'))).toThrow('do not match');
 expect(()=>detectFormat('paper.txt','text/plain',pdfFixture())).toThrow('do not match');
 const read=await readSelectedFile(file('paper.pdf',pdfFixture(),'application/pdf'));
 expect(read).toMatchObject({format:'pdf',title:'paper',filename:'paper.ink',source:''});
 expect(read.byteHash).toMatch(/^[a-f0-9]{64}$/);
});
it('prepares a local PDF as a retained-original block with a real local capture',async()=>{
 vi.stubGlobal('crypto',webcrypto);
 const [prepared]=await prepareFiles([file('paper.pdf',pdfFixture(3),'application/pdf')]);
 const block=prepared.fragment.blocks[0];
 expect(block.type).toBe(PDF_BLOCK);expect(block.data.importFileIndex).toBe(0);
 const capture=checkedPdfCapture(block.data.pdf);
 expect(capture.endpoint).toBe('local-file');expect(capture.sourceUrl).toBe('paper.pdf');
 expect(capture.inspection).toMatchObject({kind:'pdf-inspection',pages:3});
 expect(capture.asset.assetId).toBe('sha256:'+prepared.provenance.byteHash);
 expect(prepared.provenance).toMatchObject({format:'pdf'});
});
