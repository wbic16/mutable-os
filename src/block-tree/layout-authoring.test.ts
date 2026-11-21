import {expect,it} from 'vitest';
import {prepareList,prepareLayout} from './layout-authoring';
import {importSemanticHtml} from '../interchange/html-import';
import {parseClipboardHtml} from '../interchange/html-ast';
const text=(value:string)=>({id:crypto.randomUUID(),type:'standoff-editor-block',text:value});
it('shares native list/item and table header configuration with the human HTML import route',()=>{
 const imported=importSemanticHtml(parseClipboardHtml('<ol start="5" reversed><li value="9"><input type="checkbox" checked>First</li><li>Second</li></ol><table><tr><th>Header</th><td>Data</td></tr></table>').tree).fragment!;
 const list=prepareList([[text('First')],[text('Second')]],'ordered',{start:5,reversed:true,items:[{value:9,checked:true},{value:null,checked:null}]});
 expect(list.metadata).toEqual(imported.blocks.find(b=>b.type==='indented-list-block')!.data.metadata);
 const items=imported.blocks.filter(b=>b.type==='container-block');
 list.children!.forEach((n,i)=>{expect((n.metadata as any).htmlListItem).toEqual((items[i].data.metadata as any).htmlListItem);expect(n.checked).toBe(items[i].data.checked);});
 const table=prepareLayout('table',[[[text('Header')],[text('Data')]]],{headers:[[true,false]]});
 expect(table.children![0].children!.map(n=>n.metadata)).toEqual(imported.blocks.filter(b=>b.type==='table-cell-block').map(b=>b.data.metadata));
});
it('retains signed numbering, reversed defaults and ragged native grids without pretending spans or widths render',()=>{
 expect((prepareList([[text('a')],[text('b')]],'ordered',{start:null,reversed:true,items:null}).metadata as any).htmlList.start).toBe(2);
 expect((prepareList([[text('a')]],'ordered',{start:-3,reversed:false,items:null}).metadata as any).htmlList.start).toBe(-3);
 expect(prepareLayout('grid',[[[text('a'),text('b')]],[[text('c')],[text('d')]]]).children!.map(r=>r.children!.length)).toEqual([1,2]);
 for(const config of [{headers:[[true]],columnWidths:[30]},{headers:[[true]],rowSpan:2}])expect(()=>prepareLayout('table',[[[text('x')]]],config)).toThrow();
});
