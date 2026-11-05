import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {createSignal,Show} from 'solid-js';
import {TextualReferences} from './references';
import {RetainedInstrumentSlot} from './cardex';
import type {ApplicationKnowledge,VaultSearchResults} from '../../feature-api/document-application';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(stop=>stop());document.body.replaceChildren();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
it('keeps reference query typing local and rejects late results after cancellation',async()=>{
 const requests:((value:VaultSearchResults)=>void)[]=[];
 const search=vi.fn(()=>new Promise<VaultSearchResults>(resolve=>requests.push(resolve))),cancel=vi.fn();
 const api={search,cancel,cancelPicker:vi.fn(),current:()=>true} as unknown as ApplicationKnowledge;
 const host=document.body.appendChild(document.createElement('div'));
 cleanup.push(render(()=><TextualReferences knowledge={api} restore={()=>{}} close={()=>{}}/>,host));
 const input=host.querySelector('input')!,form=host.querySelector('form')!;
 for(const value of ['M','Mi','Michelangelo']){input.value=value;input.dispatchEvent(new InputEvent('input',{bubbles:true}));}
 expect(search).not.toHaveBeenCalled();
 form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(search).toHaveBeenCalledTimes(1);
 input.value='New';input.dispatchEvent(new InputEvent('input',{bubbles:true}));
 form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(search).toHaveBeenCalledTimes(2);
 const result=(title:string):VaultSearchResults=>({token:title,hits:[{id:title,documentId:title,blockId:title,title,location:'fixture',kind:'title',snippet:title,start:0,end:1}],diagnostics:[],available:1,discovered:1,complete:true});
 requests[1](result('Current result'));await tick();requests[0](result('Obsolete result'));await tick();
 expect(host.textContent).toContain('Current result');expect(host.textContent).not.toContain('Obsolete result');expect(cancel).toHaveBeenCalled();
});
it('restores an identical retained field DOM on presentation close and leaves its native state intact',()=>{
 const source=document.body.appendChild(document.createElement('div')),field=document.createElement('div'),next=document.createElement('span');
 const input=field.appendChild(document.createElement('input'));input.value='Unsaved draft';source.append(field,next);
 const host=document.body.appendChild(document.createElement('div')),[shown,setShown]=createSignal(true);
 cleanup.push(render(()=><Show when={shown()}><RetainedInstrumentSlot element={field}/></Show>,host));
 expect(host.contains(field)).toBe(true);expect(field.firstChild).toBe(input);setShown(false);
 expect(source.firstChild).toBe(field);expect(field.nextSibling).toBe(next);expect(input.value).toBe('Unsaved draft');
});
it('does not resurrect a retained field when its owning record has been closed',()=>{
 const source=document.body.appendChild(document.createElement('div')),field=source.appendChild(document.createElement('div'));
 const host=document.body.appendChild(document.createElement('div')),[element,setElement]=createSignal<HTMLElement|undefined>(field);
 cleanup.push(render(()=><RetainedInstrumentSlot element={element()}/>,host));
 expect(host.contains(field)).toBe(true);setElement(undefined);expect(source.contains(field)).toBe(false);expect(host.contains(field)).toBe(false);
});

import {cardexPresentationPorts,canPresentCardex,type CardexPresentationPort} from '../../application/cardex-presentation-ports';
import type {ReactiveEditor} from '../../reactive-editor/editor';
it('allows only registered, idle Cardex retention on Desktop/Textual routes and keeps lifecycle barriers',()=>{
 let ready=true,transfer=true;
 const editor={node:()=>({viewType:'cardex-application-block'}),blockQueries:{ancestors:()=>[{key:'window',viewType:'window-block'}]},windowManager:{ownerForNode:()=> 'window-id',lifecycle:{canTransfer:()=>transfer}}} as unknown as ReactiveEditor;
 expect(canPresentCardex(editor,'card','desktop','textual')).toBe(false);
 const release=cardexPresentationPorts(editor).register({key:'card',windowKey:'window',canPresent:()=>ready,dirty:()=>true} as CardexPresentationPort);cleanup.push(release);
 expect(canPresentCardex(editor,'card','desktop','textual')).toBe(true);expect(canPresentCardex(editor,'card','textual','desktop')).toBe(true);
 expect(canPresentCardex(editor,'card','desktop','canvas')).toBe(false);expect(canPresentCardex(editor,'card','textual','spatial')).toBe(false);
 ready=false;expect(canPresentCardex(editor,'card','textual','desktop')).toBe(false);ready=true;transfer=false;expect(canPresentCardex(editor,'card','textual','desktop')).toBe(false);
 release();transfer=true;expect(canPresentCardex(editor,'card','textual','desktop')).toBe(false);
});
