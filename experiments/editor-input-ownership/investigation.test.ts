// Investigation-only probes of existing behavior and native CodeMirror hooks.
// These do not implement EditorInputCapability or change production routing.
// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {EditorState, Prec} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {BindingRegistry, chord, keyboard} from '../../src/input/bindings';
import {MountRegistry} from '../../src/runtime/mounts';
import {FocusService} from '../../src/runtime/focus';

const cleanup: Array<()=>void> = [];
afterEach(()=>{while(cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); vi.restoreAllMocks();});
function bindings() {
  const registry=new BindingRegistry(); cleanup.push(()=>registry.dispose()); return registry;
}
function editor(extensions:any[]) {
  const host=document.createElement('div'); document.body.append(host);
  const view=new EditorView({parent:host,state:EditorState.create({doc:'abc',extensions})});
  cleanup.push(()=>view.destroy()); return view;
}
const key=(name:string,ctrlKey=false)=>new KeyboardEvent('keydown',{key:name,ctrlKey,bubbles:true,cancelable:true});
function action(registry:BindingRegistry,id:string,defaults:any[],handler:(ctx:any)=>boolean|void) {
  registry.register({id,name:id,description:'Investigation',category:'probe',tags:[],scope:'probe',defaults,handler});
}

describe('existing binding semantics',()=>{
  it('consumes an unsupported chord prefix before consulting the handler',()=>{
    const registry=bindings(),run=vi.fn(()=>false);
    action(registry,'unsupported',[chord(keyboard(';','Ctrl'),keyboard('r'))],ctx=>ctx.run('unsupported'));
    const event=key(';',true);
    expect(registry.dispatch(event,['probe'],run)).toBe(true);
    expect(event.defaultPrevented).toBe(true);expect(run).not.toHaveBeenCalled();
  });
  it('requires explicit false for fallthrough: void means handled',()=>{
    const registry=bindings();action(registry,'void',[keyboard('F8')],()=>{});
    const event=key('F8');expect(registry.dispatch(event,['probe'],()=>false)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('native SDK event delivery',()=>{
  it('a capture listener can prevent a native CodeMirror handler from receiving input',()=>{
    const called=vi.fn(()=>true),view=editor([EditorView.domEventHandlers({keydown:called})]);
    const capture=(e:Event)=>{if(e.target===view.contentDOM){e.preventDefault();e.stopPropagation();}};
    document.addEventListener('keydown',capture,true);cleanup.push(()=>document.removeEventListener('keydown',capture,true));
    view.contentDOM.dispatchEvent(key('F8'));expect(called).not.toHaveBeenCalled();
    document.removeEventListener('keydown',capture,true);
    view.contentDOM.dispatchEvent(key('F8'));expect(called).toHaveBeenCalledOnce();
  });
  it('a native DOM extension can invoke live Mutable overrides once, with false falling through',()=>{
    const registry=bindings(),run=vi.fn(()=>true),native=vi.fn(()=>true);
    action(registry,'shared',[keyboard('F8')],ctx=>ctx.run('shared'));
    const view=editor([
      Prec.highest(EditorView.domEventHandlers({keydown:event=>registry.dispatch(event,['probe'],run)})),
      keymap.of([{key:'F8',run:native},{key:'F9',run:native}]),
    ]);
    view.contentDOM.dispatchEvent(key('F8'));expect(run).toHaveBeenCalledOnce();expect(native).not.toHaveBeenCalled();
    registry.import(JSON.stringify({version:2,overrides:{shared:[keyboard('F9')]}}));
    view.contentDOM.dispatchEvent(key('F8'));expect(native).toHaveBeenCalledOnce();expect(run).toHaveBeenCalledOnce();
    view.contentDOM.dispatchEvent(key('F9'));expect(run).toHaveBeenCalledTimes(2);expect(native).toHaveBeenCalledOnce();
  });
  it('a highest-precedence keymap any runs ahead of a later named binding',()=>{
    const any=vi.fn(()=>true),named=vi.fn(()=>true);
    const view=editor([Prec.highest(keymap.of([{any}])),keymap.of([{key:'F8',run:named}])]);
    view.contentDOM.dispatchEvent(key('F8'));expect(any).toHaveBeenCalledOnce();expect(named).not.toHaveBeenCalled();
  });
  it('a programmatic selection change does not focus a background editor',()=>{
    const view=editor([]),outside=document.createElement('input');document.body.append(outside);outside.focus();
    view.dispatch({selection:{anchor:2}});
    expect(view.state.selection.main.head).toBe(2);expect(view.hasFocus).toBe(false);expect(document.activeElement).toBe(outside);
  });
});

describe('existing mounted occurrence and focus contracts',()=>{
  it('stale unmount disposal does not remove a replacement mount',()=>{
    const mounts=new MountRegistry(),root=document.createElement('div');document.body.append(root);
    const handle={root,focusElement:root,inputPolicy:'opaque-widget' as const,focus:()=>{}};
    const old=mounts.register('occurrence',handle),generation=mounts.get('occurrence')!.generation;
    const current=mounts.register('occurrence',handle);cleanup.push(current);old();
    expect(mounts.get('occurrence')!.generation).toBe(generation+1);
  });
  it('final release resets the numeric generation: handle identity is needed for stale leases',()=>{
    const mounts=new MountRegistry(),root=document.createElement('div');document.body.append(root);
    const handle={root,focusElement:root,inputPolicy:'opaque-widget' as const,focus:()=>{}};
    mounts.register('occurrence',handle);const old=mounts.get('occurrence')!;
    mounts.releaseOccurrence('occurrence');const dispose=mounts.register('occurrence',handle);cleanup.push(dispose);
    expect(mounts.get('occurrence')!.generation).toBe(old.generation);
    expect(mounts.get('occurrence')).not.toBe(old);
  });
  it('the generic native end-focus path supplies zero for a non-textarea surface',()=>{
    const mounts=new MountRegistry(),focus=new FocusService(mounts);cleanup.push(()=>focus.dispose());
    const root=document.createElement('div');root.contentEditable='true';root.tabIndex=0;root.textContent='abc';document.body.append(root);
    const restore=vi.fn();cleanup.push(mounts.register('occurrence',{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus(),restoreSelection:restore}));
    focus.request('occurrence',{caret:'end'});
    expect(restore).toHaveBeenCalledWith({start:0,end:0,direction:'none'});
  });
});
