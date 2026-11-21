import {surfaceSide,surfaceShell} from '../block-tree/compound-authoring';
import { createStore } from 'solid-js/store';
import { hasBlockMode } from '../block-tree/mode-editing';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { BlockNode } from '../block-tree/types';
import { resourceTypes, resourceNotes, resourceInformation } from '../interchange/resource-surface';

export const surfaceCommands = [
  {id:'surface.flip',name:'reverse flip',reason:'Turn the nearest surface over; create one if absent'},
  {id:'surface.create',name:'reverse create',reason:'Create a reverse without switching faces'},
  {id:'surface.unwrap',name:'reverse unwrap',reason:'Move reverse Blocks after their owner, retaining all content'},
  {id:'surface.delete',name:'reverse delete',reason:'Remove the reverse with confirmation'},
  {id:'container.group',name:'container group',reason:'Group contiguous selected sibling Blocks'},
  {id:'container.dissolve',name:'container dissolve',reason:'Remove a structural container, preserving its children'},
];
export interface SurfaceController { flip():void; reveal(child:string):void }
export class BlockSurfaces {
  private readonly information = createStore<Record<string, HTMLElement | undefined>>({});
  informationTarget(key: string) { return this.information[0][key]; }
  setInformationTarget(key: string, target: HTMLElement | undefined) { this.information[1](key, target); }
  private controllers = new Map<string, SurfaceController>();
  constructor(private editor: ReactiveEditor) {}
  /** Whole-Block operations carry the structural reverse with its front owner.
   * Editing a child within a grouped front still targets that child alone. */
  wholeBlockKey(key:string):string {
    if(!this.editor.features.reversibleBlocks)return key;
    const node=this.editor.node(key),side=node&&this.parent(node),surface=side&&this.parent(side);
    return side?.viewType==='side-block'&&side.children.length===1&&surface?.viewType==='surface-block'&&surface.children[0]===side.key?surface.key:key;
  }
  confirmDelete(keys:string[]) {
    if(!this.editor.features.reversibleBlocks)return true;
    const seen=new Set<string>();
    const hasReverse=(key:string):boolean=>{if(seen.has(key))return false;seen.add(key);const n=this.editor.node(key);return !!n&&(n.viewType==='surface-block'&&n.children.length>1||n.children.some(hasReverse));};
    return !keys.some(hasReverse)||window.confirm('This selection contains reverse content. Delete both faces and their contents? Undo restores them.');
  }
  register(key:string, controller:SurfaceController) { this.controllers.set(key,controller); return ()=>this.controllers.delete(key); }
  private parent(n:BlockNode) { return this.editor.projections.get(n.viewId)?.parentOf(n.key); }
  nearest(key:string):BlockNode|undefined { let n=this.editor.node(key);while(n){if(n.viewType==='surface-block')return n;n=this.parent(n);} }
  reveal(key:string) { let n=this.editor.node(key);while(n){const p=this.parent(n);if(p?.viewType==='surface-block')this.controllers.get(p.key)?.reveal(n.key);n=p;} }
  target(key:string) {
    const selection=this.editor.blockSelection;
    if(selection.state.items.length>1)throw Error('Select one Block for this operation.');
    return this.editor.node(selection.state.items[0]?.nodeKey??key);
  }
  private forAction(id:string,key:string) {
    let n=this.target(key);
    if(id==='container.dissolve'&&!this.editor.blockSelection.state.items.length)while(n&&n.viewType!=='container-block'){n=this.parent(n);}
    return n;
  }
  private ordinary(n:BlockNode, allowSurface=false) {
    const p=this.parent(n),placement=this.editor.repository.readState().placements[n.placementKey];
    if(!p||(n.viewType==='side-block'||n.viewType==='surface-block'&&!allowSurface)||!this.editor.blockSelection.eligible(n.key)||placement.kind!=='owned'||placement.externalReference||placement.resolvedReference||placement.resourceRegistration)throw Error('Choose an ordinary Document Block. Resource roots and reference placements cannot be wrapped.');
    return p;
  }
  private groupTargets() {
    const nodes=this.editor.blockSelection.actionTargets().map(t=>this.editor.node(t.nodeKey)!);
    if(nodes.length<2)throw Error('Select at least two contiguous sibling Blocks.');
    const parent=this.ordinary(nodes[0],true);
    if(nodes.some(n=>this.ordinary(n,true)?.key!==parent.key))throw Error('Group only Blocks with the same parent.');
    const sorted=[...nodes].sort((a,b)=>parent.children.indexOf(a.key)-parent.children.indexOf(b.key));
    const first=parent.children.indexOf(sorted[0].key);
    if(sorted.some((n,i)=>parent.children[first+i]!==n.key))throw Error('Select a contiguous run of sibling Blocks; no Blocks were moved.');
    return sorted;
  }
  can(id:string,key:string) {
    if(!this.editor.features.reversibleBlocks)return false;
    if(this.editor.commandRegistry.permit?.(key,id)===false)return false;
    try {
      if(id==='container.group'){this.groupTargets();return true;}
      const n=this.forAction(id,key);if(!n)return false;
      if(id==='surface.unwrap'||id==='surface.delete')return !!this.nearest(n.key)?.children[1];
      if(id==='container.dissolve')return n.viewType==='container-block';
      if(id==='surface.flip')return !!this.nearest(n.key)||!!this.ordinary(n);
      if(id==='surface.create')return n.viewType==='surface-block'||!!this.ordinary(n);
    }catch{return false;}return false;
  }
  private validateContinuity(nodes: BlockNode[]) {
    for (const n of nodes) {
      // Check each mounted projection of the affected subtree. A shared parent
      // can expose the same placement more than once; never guess which owner
      // should survive. No repository/document inventory is built here.
      const visit=(key:string)=>{const node=this.editor.node(key)!;
        for(const projection of this.editor.projections.values()) {
          if(projection.occurrenceCount(node.placementKey)>1)throw Error('This Block has shared occurrences. Conversion cannot yet preserve each mounted view; no changes were made.');
          const occurrence=projection.nodeForPlacement(node.placementKey),mount=occurrence&&this.editor.mounts.get(occurrence.key);
          if(mount?.composing)throw Error('Finish text composition before changing the Block structure.');
          if(mount?.root.querySelector('iframe,video,audio') && typeof (document.body as any).moveBefore!=='function')throw Error('This browser cannot move a live media viewer without resetting it. Use a browser with state-preserving DOM moves, or convert before loading the viewer. No changes were made.');
        }
        node.children.forEach(visit);
      }; visit(n.key);
    }
  }
  private back(surface:string, resource?:BlockNode) {
    const c=this.editor.commands;
    return c.insert(surfaceSide('back',[...(resource?[resourceInformation(resource.payload),...resourceNotes(resource.payload,resource.viewType)]:[]),{type:'standoff-editor-block',text:''}]), {kind:'at',parentKey:surface,index:1});
  }
  run(id:string,key:string, invocation?:{nodeKey:string;start:number;end:number;version:number}) {
    if(!this.editor.features.reversibleBlocks)return;
    if(this.editor.commandRegistry.permit?.(key,id)===false)return;
    const e=this.editor,c=e.commands;
    try {
      if(e.completionInput?.beforeSave?.()===false)return;
      const n=id==='container.group'?this.groupTargets()[0]:this.forAction(id,key);if(!n)throw Error('Choose a Block.');
      const view=n.viewId, surface=this.nearest(n.key);
      if(id==='surface.flip'&&surface?.children[1]&&!invocation){this.controllers.get(surface.key)?.flip();return;}
      if(id==='surface.delete'&&surface?.children[1]&&!window.confirm('Delete this reverse and everything on it? Canonical resource attributes remain on the front. Undo restores the reverse.'))return;
      let dissolveSurface:BlockNode|undefined;
      if(id==='container.dissolve') {
        if(n.viewType!=='container-block')throw Error('Choose a ContainerBlock.');
        if(hasBlockMode(n.payload))throw Error('Dissolving would remove this Block Mode; clear it explicitly first.');
        const parent=this.parent(n);
        if(parent?.viewType==='side-block'&&this.parent(parent)?.viewType==='surface-block'){
          if(parent.children.length!==1||Object.keys(n.ownedRelations).length||e.repository.contentReferenceCount(n.contentKey)!==1)throw Error('This container has other face content, owned relations or shared occurrences. Unwrap the reverse explicitly before dissolving it.');
          dissolveSurface=this.parent(parent);
          if(hasBlockMode(parent.payload)||hasBlockMode(dissolveSurface!.payload))throw Error('Dissolving would remove the surrounding Block Mode; move the children explicitly instead.');
          if(dissolveSurface!.children[0]!==parent.key)throw Error('Use reverse unwrap to extract a reverse container.');
          if(dissolveSurface!.children[1]&&!window.confirm('Dissolve this container and unwrap its reverse after its children? All reverse content will be preserved. Cancel to keep the structure.'))return;
        }
      }
      const direct=this.parent(n),directSurface=n.viewType==='surface-block'?n:direct?.viewType==='side-block'&&this.parent(direct)?.children[0]===direct.key?this.parent(direct):undefined;
      const moving = id==='container.group' ? this.groupTargets() :
        (id==='surface.create'&&!directSurface||id==='surface.flip'&&!surface) ? [n] :
        id==='container.dissolve' ? [dissolveSurface??n] :
        id==='surface.unwrap'&&surface ? [surface] : [];
      if(moving.length)this.validateContinuity(moving);
      const activeElement=document.activeElement,focused=e.mounts.resolveElement(activeElement),selection=focused?.handle.captureInlineSelection?.(),nativeSelection=focused?.handle.captureSelection?.();
      let result=n.placementKey, flipAfter=false;
      c.transaction(surfaceCommands.find(v=>v.id===id)?.name??id,()=>{
        if(invocation){const source=e.node(invocation.nodeKey);if(!source||e.repository.readState().contents[source.contentKey].inlineRevision!==invocation.version)throw Error('The command source changed.');c.replaceInlineRange(source.placementKey,invocation.start,invocation.end,'');}
        if(id==='container.group') {
          const nodes=this.groupTargets();result=c.insert({type:'container-block',metadata:{structuralContainer:true},children:[]},{kind:'before',anchorKey:n.placementKey});
          nodes.forEach((item,index)=>c.move(item.placementKey,{kind:'at',parentKey:result,index}));
        } else if(id==='surface.create'||id==='surface.flip') {
          // Explicit Create on a child of a reverse creates a nested surface.
          const direct=this.parent(n), existing=n.viewType==='surface-block'?n:direct?.viewType==='side-block'&&this.parent(direct)?.children[0]===direct.key?this.parent(direct):undefined;
          const use=id==='surface.flip'?surface:existing;
          if(use){result=use.placementKey;if(!use.children[1])this.back(result);}
          else {this.ordinary(n);result=c.insert(surfaceShell(),{kind:'before',anchorKey:n.placementKey});const front=c.insert(surfaceSide('front',[]),{kind:'at',parentKey:result,index:0});c.move(n.placementKey,{kind:'at',parentKey:front,index:0});this.back(result,resourceTypes.has(n.viewType)?n:undefined);}
          flipAfter=id==='surface.flip';
        } else if(id==='surface.unwrap'||id==='surface.delete') {
          if(!surface?.children[1])throw Error('There is no reverse.');
          this.dismantle(surface,id==='surface.unwrap');result=surface.placementKey;
        } else if(id==='container.dissolve') {
          if(dissolveSurface)this.dismantle(dissolveSurface,true);
          // Dissolving a front container promotes its children and removes
          // the emptied surface after preserving the extracted back content.
          if(dissolveSurface){let before=dissolveSurface.placementKey;for(const child of n.children){c.move(e.node(child)!.placementKey,{kind:'before',anchorKey:before});}c.remove(dissolveSurface.placementKey);}
          else c.unwrap(n.placementKey);
        }
      });
      e.blockSelection.clear();
      queueMicrotask(()=>{const node=e.nodeForPlacementInView(result,view);if(!node)return;if(flipAfter)this.controllers.get(node.key)?.flip();else if(focused&&e.mounts.get(focused.nodeKey)===focused.handle){if(document.activeElement!==activeElement){if(activeElement instanceof HTMLElement&&focused.handle.root.contains(activeElement))activeElement.focus({preventScroll:true});else focused.handle.focus();}if(selection)focused.handle.restoreInlineSelection?.(selection);if(nativeSelection)focused.handle.restoreSelection?.(nativeSelection);}else e.focus.request(node.key,{reason:'block-structure'});});
    }catch(error){e.blockSelection.setMessage(error instanceof Error?error.message:String(error));}
  }
  private dismantle(surface:BlockNode,extract:boolean) {
    if(surface.children.length>2)throw Error('This legacy surface has more than two faces. Move its extra face content explicitly before dismantling it.');
    const e=this.editor, c=e.commands, back=e.node(surface.children[1]);if(!back)return;
    const parent=this.parent(surface);if(extract&&!parent)throw Error('This surface has no surrounding insertion point.');
    const containers=back.children.map(k=>e.node(k)!);
    if(extract&&(hasBlockMode(back.payload)||containers.some(n=>n.viewType==='container-block'&&hasBlockMode(n.payload))))throw Error('Extracting this reverse would remove a Block Mode; move its Blocks explicitly instead.');
    const children=containers.flatMap(n=>n.viewType==='container-block'?n.children.map(k=>e.node(k)!):[n]);
    if(extract){let after=surface.placementKey;for(const child of children){
      // Preserve the information Block and its typed resource reference.

      c.move(child.placementKey,{kind:'after',anchorKey:after});after=child.placementKey;
    }}
    c.remove(back.placementKey);
  }
}
