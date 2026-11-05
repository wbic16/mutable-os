import {expect,it,vi} from 'vitest';
import {flintPanes} from './layout';
import {measuredGrid} from './grid';
import {nativeIslands} from './native-islands';

it('retains a useful source region and uses a full secondary view on narrow grids',()=>{
 for(const zoom of [.75,1,1.25,2])for(const width of [420,800,1280,1754]){
  const grid=measuredGrid(width,900,9.640625*zoom,20*zoom);
  const panes=flintPanes(grid,true,true);
  expect(panes.document+panes.left+panes.right).toBe(panes.width);
  expect(panes.document).toBeGreaterThan(0);
  expect(panes.right===0||panes.document>=56).toBe(true);
  if(panes.fullscreen)expect(panes.secondary).toBe(panes.width);
  for(const value of [panes.width,panes.left,panes.right,panes.document])expect(Number.isInteger(value)).toBe(true);
 }
});
it('ignores native text edits and sizes only observed media; disposal restores the DOM',async()=>{
 let callback:ResizeObserverCallback=()=>{};const observe=vi.fn(),disconnect=vi.fn();
 vi.stubGlobal('ResizeObserver',class{constructor(cb:ResizeObserverCallback){callback=cb;}observe=observe;unobserve=vi.fn();disconnect=disconnect;});
 const root=document.createElement('div');root.innerHTML='<figure class="reactive-image"><img/></figure><div class="reactive-standoff-flow"><span>Text</span></div><div class="reactive-table" aria-colcount="3"></div>';document.body.append(root);
 const image=root.querySelector('img')!,flow=root.querySelector('.reactive-standoff-flow')!,table=root.querySelector<HTMLElement>('.reactive-table')!;
 const adapter=nativeIslands(root,20),start={...adapter.diagnostics},contains=vi.spyOn(root,'contains');
 try{
  for(let i=0;i<20;i++){flow.append(document.createElement('span'));flow.firstChild?.remove();}
  const decoration=document.createElementNS('http://www.w3.org/2000/svg','svg');root.append(decoration);decoration.remove();
  await Promise.resolve();expect(contains).not.toHaveBeenCalled();expect(adapter.diagnostics).toEqual(start);expect(observe).toHaveBeenCalledTimes(1);
  callback([{target:image,contentRect:{height:217}}] as unknown as ResizeObserverEntry[],{} as ResizeObserver);
  expect(image.style.getPropertyValue('--tw-island-pad')).toBe('3px');adapter.zoom(25);expect(image.style.getPropertyValue('--tw-island-pad')).toBe('8px');
  table.setAttribute('aria-colcount','4');await Promise.resolve();expect(table.style.getPropertyValue('--tw-table-columns')).toBe('4');
 }finally{adapter.dispose();root.remove();vi.unstubAllGlobals();}
 expect(image.style.length).toBe(0);expect(table.style.length).toBe(0);expect(disconnect).toHaveBeenCalledOnce();
});
