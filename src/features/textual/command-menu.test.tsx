// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {TextualCommandMenu} from './command-menu';
import {menuLabel,menuSize,placeMenu,type TextualMenuItem} from './menu-layout';
let dispose:()=>void=()=>{};afterEach(()=>{dispose();document.body.replaceChildren();});
it('sizes labels, existing shortcuts, indicators, separators and frame cells without a fixed panel height',()=>{
 expect(menuLabel({label:'Create Gloss (Ctrl+G)'})).toEqual({label:'Create Gloss',shortcut:'Ctrl+G'});
 expect(menuSize([{label:'Open',shortcut:'Ctrl+O'},{label:'More',children:[],separatorBefore:true}])).toEqual({columns:18,rows:5,shortcut:6,arrow:2});
 expect(placeMenu(80,25,20,8,70,20,{col:60,width:15})).toEqual({col:40,row:16,width:20,height:8});
 expect(placeMenu(30,12,80,30,20,5)).toEqual({col:0,row:1,width:29,height:10});
});
function mount(items:TextualMenuItem[]){
 const scope=document.createElement('div');scope.className='textual-workspace';const anchor=document.createElement('button'),host=document.createElement('div');scope.append(anchor,host);document.body.append(scope);
 const close=vi.fn(),execute=vi.fn(action=>action());dispose=render(()=><TextualCommandMenu items={items} grid={{columns:80,rows:25,cellWidthPx:10,cellHeightPx:20}} anchor={anchor} close={close} execute={execute}/>,host);
 const key=(key:string)=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 return {host,close,execute,key};
}
it('keeps hovered rows mounted, skips disabled rows and dispatches the existing action once',async()=>{
 const action=vi.fn(),{host,key,execute}=mount([{label:'One'},{label:'Disabled',disabled:true},{label:'Run',run:action}]);await Promise.resolve();
 const row=host.querySelectorAll('button')[2];key('ArrowDown');await Promise.resolve();expect(document.activeElement).toBe(row);expect(row.dataset.active).toBe('true');expect(host.querySelectorAll('button')[2]).toBe(row);
 row.click();expect(execute).toHaveBeenCalledTimes(1);expect(action).toHaveBeenCalledTimes(1);
});
it('opens lazy children only on activation and Escape returns to the parent before closing',async()=>{
 const load=vi.fn(()=>[{label:'Child'}]),{host,key,close}=mount([{label:'More',loadChildren:load}]);await Promise.resolve();expect(load).not.toHaveBeenCalled();key('ArrowRight');await Promise.resolve();expect(host.querySelectorAll('[role=menu]')).toHaveLength(2);expect(load).toHaveBeenCalledTimes(1);
 key('Escape');await Promise.resolve();expect(host.querySelectorAll('[role=menu]')).toHaveLength(1);expect(close).not.toHaveBeenCalled();key('Escape');expect(close).toHaveBeenCalledTimes(1);
});
it('retains the existing input command and dismisses outside the menu',async()=>{
 const submit=vi.fn(),{host,key,close}=mount([{label:'Colour',input:{label:'CSS colour',value:'#ff0000',submit}}]);await Promise.resolve();(document.activeElement as HTMLElement).click();await Promise.resolve();expect(host.querySelector('input')?.value).toBe('#ff0000');host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(submit).toHaveBeenCalledWith('#ff0000');key('Escape');document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));expect(close).toHaveBeenCalled();
});
