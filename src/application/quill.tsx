import {CompositionLayers} from '../features/quill/layers';
import {QuillCompositionContext} from '../features/quill/composition-context';
import {studioFor} from '../features/quill/studio';
import { Show, For, createSignal, createMemo, onMount, onCleanup } from 'solid-js';
import type { CodexFeature } from '../feature-api';
import type { ReactiveEditor } from '../reactive-editor/editor';
import { ChildBlocks } from '../rendering/block-outlet';
import { QUILL_APP, QUILL_TYPE } from '../features/quill/model';
import { QuillShell, type QuillContext } from '../features/quill/shell';
import { documentApplicationCapabilities } from './document-application-capabilities';
import { createDocumentApplicationTabs } from './document-application-tabs';
import { documentApplicationPorts } from './document-application-ports';
import { convertQuill, convertQuillToText, composeQuillRange, addQuillSource, invokeQuill, quillRecord, quillSources } from './quill-operations';

export interface QuillPresentationHost {
  active(): import('../reactive-editor/workspace-presentation').PresentationName;
  select(name: import('../reactive-editor/workspace-presentation').PresentationName): boolean;
}
export function createQuillFeature(editor: ReactiveEditor, presentation?: QuillPresentationHost): CodexFeature {
  return {id:'quill',activate(scope) {
    const contexts = new Map<string,QuillContext>();
    let pending: QuillContext | undefined;
    scope.own(()=>contexts.clear());
    documentApplicationCapabilities(editor,scope).register({applicationId:'quill',label:'Quill',type:QUILL_APP,seedDocuments:()=>[],
      beforeOpen(){if(presentation && presentation.active()!=='desktop' && (!presentation.select('desktop') || presentation.active()!=='desktop'))throw Error('Finish the current interaction before opening Quill on the Desktop.');},
      create(documents) { const dto=createDocumentApplicationTabs(QUILL_APP,documents);if(pending)contexts.set(String(dto.id),pending);return dto; },
      view:props=><QuillShell editor={editor} application={props.application} context={contexts.get(props.application.id ?? '')}/>,
    });
    // Discard return bookmarks when their owning application is deleted. No text-edit scan.
    scope.own(editor.repository.subscribeChanges(change=>{
      if(change.inlineOwner || change.split || change.childrenOwner || change.listWrap)return;
      for(const before of change.previousContents.values()) if(before?.viewType===QUILL_APP && !editor.repository.state.contents[before.key]) contexts.delete(String(before.payload.id));
    }));
    const Composition = (props:{nodeKey:string}) => {
      let root!:HTMLDivElement;const [active,setActive]=createSignal<string>();
      const sources=()=>{const n=editor.node(props.nodeKey);return ((n?.payload.quill as any)?.sources??[]).map((s:any)=>{const ref=(n?.payload.blockProperties as any[])?.find(p=>p.metadata?.quillRole===s.role);return {role:s.role,node:n?.children.map(k=>editor.node(k)).find(c=>c?.payload.id===ref?.value)};});};
      const problem = createMemo(()=>{
        const node=editor.node(props.nodeKey);node?.payload.quill;node?.payload.blockProperties;node?.children;
        try {if(node)quillSources(editor,node.placementKey);return '';}catch(e){return (e as Error).message;}
      });
      onMount(()=>onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'container',focus:()=>root.focus({preventScroll:true})})));
      return <div ref={root} tabIndex={-1} class="quill-composition" data-block-type={QUILL_TYPE} data-runtime-key={props.nodeKey} data-block-id={String(editor.node(props.nodeKey)?.payload.id ?? '')}>
        <header><strong>Text composition</strong><button disabled={!!problem()} onPointerDown={e=>e.preventDefault()} onClick={()=>editor.commandRegistry.execute('quill.edit',{targetKey:props.nodeKey,args:undefined})}>Edit in Quill</button></header>
        <Show when={problem()}><p role="status">{problem()} Native children are retained below.</p></Show>
        <Show when={!problem()} fallback={<ChildBlocks parentKey={props.nodeKey}/>}><div class="quill-source-navigation"><label>Text source<select aria-label="Active text source" value={active()??sources()[0]?.node?.key} onChange={e=>{setActive(e.currentTarget.value);studioFor(root)?.choose(e.currentTarget.value);editor.focus.request(e.currentTarget.value,{reason:'quill-source'});}}><For each={sources()}>{s=><option value={s.node?.key}>{s.role}</option>}</For></select></label><button onClick={()=>addQuillSource(editor,props.nodeKey,'title')}>Add title</button><button onClick={()=>addQuillSource(editor,props.nodeKey,'caption')}>Add text source</button><span>Independent native text sources · one artboard</span></div>
        <QuillCompositionContext.Provider value={{active,setActive}}><div class="quill-source-stack"><CompositionLayers editor={editor} nodeKey={props.nodeKey} root={()=>root} config={()=>editor.node(props.nodeKey)!.payload.quill as any}/><ChildBlocks parentKey={props.nodeKey}/></div></QuillCompositionContext.Provider></Show>
      </div>;
    };
    scope.own(editor.registry.register({type:QUILL_TYPE,capabilities:['container'],view:Composition},scope.owner));
    const workspace=()=>{const s=editor.repository.readState();return s.contents[s.placements[s.rootPlacementKey].contentKey].viewType==='workspace-block';};
    scope.own(editor.commandRegistry.register({id:'quill.edit',label:'Edit in Quill',canExecute:({targetKey})=>workspace() && !!editor.node(targetKey) && ['standoff-editor-block',QUILL_TYPE].includes(editor.node(targetKey)!.viewType),execute({targetKey}) {
      const sourcePresentation=presentation?.active();
      const invocation=invokeQuill(editor,targetKey),windowId=editor.windowManager?.ownerForNode(targetKey);
      const originPort=documentApplicationPorts(editor).ports().find(p=>windowId ? p.windowId()===windowId : p.session()?.projection.viewId===invocation.viewId);
      const scroll:Array<{element:HTMLElement;top:number;left:number}>=[];
      for(let element=editor.mounts.get(targetKey)?.root as HTMLElement|undefined;element;element=element.parentElement??undefined)scroll.push({element,top:element.scrollTop,left:element.scrollLeft});
      const context:QuillContext={existing:!!invocation.existingComposition,documentId:invocation.documentId,
        confirm(){if(!scope.active())throw Error('Quill is closed.');invocation.existingComposition=convertQuill(editor,invocation);context.existing=true;},
        async returnToSource(){
          if(!scope.active())throw Error('Quill is closed.');
          if(sourcePresentation && presentation && presentation.active()!==sourcePresentation && (!presentation.select(sourcePresentation) || presentation.active()!==sourcePresentation))throw Error('Finish the current interaction before returning to the originating presentation.');
          originPort?.application.openDocument(invocation.documentId);
          if(windowId){if(!editor.windowManager?.registry.windows[windowId])throw Error('The originating window is closed. Open the Document from the library.');editor.windowManager.lifecycle.activate(windowId);}
          const current=windowId ? editor.windowManager?.lifecycle.readyTicket(windowId) : editor.windowManager?.lifecycle.ticket();
          await Promise.resolve();await Promise.resolve();
          if(!scope.active())return;
          if(current?.()===false)throw Error('Return was superseded by another window action.');
          // Textual measures its grid before attaching the retained Document. Wait
          // only for this occurrence, with the existing window readiness guard.
          for(let frame=0;frame<60;frame++) {
            const source=editor.projections.get(invocation.viewId)?.nodeForPlacement(invocation.sourcePlacement);
            const mount=source && editor.mounts.get(source.key);
            if(mount && !mount.root.closest('[hidden],[inert]'))break;
            if(!scope.active() || current?.()===false || sourcePresentation && presentation?.active()!==sourcePresentation)throw Error('Return was superseded by another window action.');
            await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
          }
          if(!scope.active() || current?.()===false)throw Error('Return was superseded by another window action.');
          const view=editor.projections.get(invocation.viewId),node=view?.nodeForPlacement(invocation.sourcePlacement);
          if(!node || !editor.mounts.get(node.key) || editor.mounts.get(node.key)!.root.closest('[hidden],[inert]'))throw Error('The originating text view is unavailable. Open the Document from the library.');
          const set=editor.selections.sets[node.key],primary=set?.items.find(i=>i.id===set.primaryId);
          const selection=primary?{anchor:primary.anchor.boundary.index,head:primary.head.boundary.index}:quillRecord(editor,invocation.sourcePlacement).revision===invocation.sourceRevision?invocation.selection:undefined;
          editor.focus.request(node.key,{reason:'quill-return',caret:'start'});
          if(selection){editor.mounts.get(node.key)?.restoreInlineSelection?.(selection);editor.selections.setPrimary(node.key,node.contentKey,node.viewId,selection.anchor,selection.head);}
          for(const saved of scroll)if(saved.element.isConnected){saved.element.scrollTop=saved.top;saved.element.scrollLeft=saved.left;}
        },
      };
      pending=context;
      try{editor.commandRegistry.execute('quill.open',{targetKey,args:{documentId:invocation.documentId}});}finally{pending=undefined;}
    }},scope.owner));
    for(const [id,independent] of [['quill.convertSelection',false],['quill.copySelection',true]] as const)scope.own(editor.commandRegistry.register({id,label:independent?'Compose independently from selection':'Convert selection to Quill',canExecute:({targetKey})=>workspace()&&editor.node(targetKey)?.viewType==='standoff-editor-block',execute({targetKey}){composeQuillRange(editor,targetKey,independent);}},scope.owner));
    scope.own(editor.commandRegistry.register({id:'quill.convert',label:'Convert to Quill',canExecute:({targetKey})=>workspace() && editor.node(targetKey)?.viewType==='standoff-editor-block',execute({targetKey}){convertQuill(editor,invokeQuill(editor,targetKey));}},scope.owner));
    scope.own(editor.commandRegistry.register({id:'quill.toText',label:'Convert to Standoff Text',canExecute:({targetKey})=>editor.blockQueries.ancestorPath(targetKey).some(n=>n.viewType===QUILL_TYPE),execute({targetKey}){const view=editor.node(targetKey)!.viewId,sources=convertQuillToText(editor,targetKey),node=editor.nodeForPlacementInView(sources[0],view);if(node)editor.focus.request(node.key,{reason:'quill-conversion',caret:'start'});}},scope.owner));
    scope.own(editor.featureActions.register({id:'quill.edit',slot:'document-actions',label:'Edit in Quill',command:'quill.edit',order:90},scope.owner));
  }};
}
