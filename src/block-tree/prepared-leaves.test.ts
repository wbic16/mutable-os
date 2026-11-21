import {expect,it} from 'vitest';
import {composePreparedLeaves} from './prepared-leaves';
import {resourceSurface} from '../interchange/resource-surface';
import {pdfBlock} from '../pdf/block';
import {pdfCaptureFixture} from '../pdf/fixtures';
import {isAuthoredBlock} from './identity';
it('preserves native resource Surface descendants and terminal information identity without dependency reconstruction',()=>{
 const source=resourceSurface(pdfBlock(pdfCaptureFixture()).native),before=structuredClone(source),slot='host-slot';
 const result=composePreparedLeaves({type:'document-block',children:[{id:slot,type:'mutable/pdf-document-block'}]},new Map([[slot,source]]),256,24000);
 expect(source).toEqual(before);const original=Object.values(source.state.contents),actual=Object.values(result.state.contents);for(const c of original)expect((result.state.contents[c.key]??actual.find(n=>n.payload.id===c.payload.id))).toMatchObject({viewType:c.viewType,payload:c.payload,children:c.children,inlineContent:c.inlineContent,ownedRelations:c.ownedRelations});
 const pdf=actual.find(c=>c.viewType==='mutable/pdf-document-block')!,info=actual.find(c=>c.viewType==='resource-information-block')!;expect((info.payload.blockProperties as any[])[0].value).toBe(pdf.payload.id);
 const nodes=original.filter(isAuthoredBlock).length,cells=original.length-nodes;expect(()=>composePreparedLeaves({type:'document-block',children:[{id:slot,type:'mutable/pdf-document-block'}]},new Map([[slot,source]]),nodes,24000)).toThrow(/budget/);expect(()=>composePreparedLeaves({type:'document-block',children:[{id:slot,type:'mutable/pdf-document-block'}]},new Map([[slot,source]]),256,cells-1)).toThrow(/budget/);
});
it('keeps prepared fragments private, singular, dependency-free and matched to an empty slot',()=>{
 for(const variant of ['reference','definition','annotations','missing','children']){const fragment=pdfBlock(pdfCaptureFixture()).native,root=fragment.state.placements[fragment.roots[0]],content=fragment.state.contents[root.contentKey];if(variant==='reference')root.kind='reference';if(variant==='definition')content.definitionOwnerKey='foreign';if(variant==='annotations')fragment.linkedAnnotations={a:{}} as any;
 expect(()=>composePreparedLeaves({type:'document-block',children:[{id:variant==='missing'?'different':'slot',type:'mutable/pdf-document-block',...(variant==='children'?{children:[{type:'standoff-editor-block',text:'x'}]}:{})}]},new Map([['slot',fragment]]),256,24000)).toThrow();}
});
