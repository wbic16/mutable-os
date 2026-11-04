import { existingNativeDocumentSession } from '../persistence/native-session';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { RetainedDocumentSession } from './document-sessions';
import type { DocumentHostPort } from './document-host-transfers';

type Bookmark = { version?:number;selectionRevision?:number;top:number; left:number; key?:string; inline?:{anchor:number;head:number}; native?:{start:number;end:number;direction:'forward'|'backward'|'none'}; anchor?:{key:string;index:number;delta:number;cellKey?:string;version:number} };
/** Same-owner DOM presentation lease. Cross-window transfer and persistence topology
 * stay unchanged. Only the retained session store owns/disposes the editor. */
export class DocumentHostPresentations {
  private bookmarks = new Map<string, Bookmark>();
  private leases = new Map<string, { restore():void }>();
  constructor(private editor: ReactiveEditor) {}
  private scroller(session:RetainedDocumentSession) { return session.host.port?.scrollport ?? session.element; }
  remember(session:RetainedDocumentSession) {
    const host=this.scroller(session), previous=this.bookmarks.get(session.id);
    if(!session.current() || !host.isConnected || host.closest('[hidden],[inert]'))return;
    const key=[this.editor.focus.state.focusedKey,this.editor.focus.state.lastFocusedKey,previous?.key].find(k=>k&&session.projection.node(k));
    const mount=key?this.editor.mounts.get(key):undefined;
    const inline=mount?.captureInlineSelection?.() ?? (key?this.editor.mounts.inlineSelection(key):undefined) ?? (key===previous?.key?previous?.inline:undefined);
    const node=key?session.projection.node(key):undefined;
    if(node&&inline)this.editor.selections.setPrimary(node.key,node.contentKey,node.viewId,inline.anchor,inline.head);
    const bookmark:Bookmark={version:node?this.editor.repository.state.contents[node.contentKey]?.revision:undefined,selectionRevision:key?this.editor.selections.sets[key]?.revision:undefined,top:host.scrollTop,left:host.scrollLeft,key,inline,native:mount?.captureSelection?.()??previous?.native};
    const box=host.getBoundingClientRect();
    const doc=host.ownerDocument as Document & {caretRangeFromPoint?(x:number,y:number):Range|null};
    const range=box.width&&box.height?doc.caretRangeFromPoint?.(box.left+Math.min(16,box.width/2),box.top+Math.min(8,box.height/2)):undefined;
    const element=range?.startContainer instanceof Element?range.startContainer:range?.startContainer.parentElement;
    const hit=element&&host.contains(element)?this.editor.mounts.resolveElement(element):undefined;
    const index=range&&hit?.handle.inlinePoint?.(range.startContainer,range.startOffset);
    if(hit&&session.projection.node(hit.nodeKey)&&index!=null){
      const rect=range?.getBoundingClientRect();if(rect?.height)bookmark.anchor={key:hit.nodeKey,index,delta:rect.top-box.top,cellKey:session.projection.node(hit.nodeKey)?.inlineContent[index],version:this.editor.repository.state.contents[session.projection.node(hit.nodeKey)!.contentKey].revision};
    }
    this.bookmarks.set(session.id,bookmark);
  }
  restorePosition(session:RetainedDocumentSession,focus=false) {
    const b=this.bookmarks.get(session.id),host=this.scroller(session);
    if(!b||!session.current()||!host.isConnected||host.closest('[hidden],[inert]'))return;
    const node=b.key?session.projection.node(b.key):undefined;
    const content=node?this.editor.repository.state.contents[node.contentKey]:undefined;
    if(node&&content&&content.revision!==b.version){
      // Same rule as TransientDocumentView: use a canonically rebased selection,
      // never resurrect an unverified offset after an edit in another occurrence.
      const selections=this.editor.selections.sets[node.key],primary=selections?.items.find(item=>item.id===selections.primaryId);
      b.inline=primary&&selections.revision!==b.selectionRevision?{anchor:primary.anchor.boundary.index,head:primary.head.boundary.index}:{anchor:0,head:0};
      b.native=undefined;b.version=content.revision;b.selectionRevision=selections?.revision;
    }
    if(b.anchor){
      const anchor=session.projection.node(b.anchor.key),version=anchor?this.editor.repository.state.contents[anchor.contentKey]?.revision:undefined;
      if(version!==b.anchor.version){
        const index=b.anchor.cellKey?anchor?.inlineContent.indexOf(b.anchor.cellKey)??-1:-1;
        if(index<0||version===undefined)b.anchor=undefined;else{b.anchor.index=index;b.anchor.version=version;}
      }
    }
    host.scrollTop=b.top;host.scrollLeft=b.left;
    if(b.anchor){
      const point=this.editor.mounts.get(b.anchor.key)?.inlineBoundary?.(b.anchor.index);
      if(point?.node.isConnected){try{const range=host.ownerDocument.createRange();range.setStart(point.node,point.offset);range.collapse(true);const r=range.getBoundingClientRect();if(r.height)host.scrollTop+=r.top-host.getBoundingClientRect().top-b.anchor.delta;}catch{/* Edited/removed anchor: retain bounded pixel fallback. */}}
    }
    if(focus&&b.key){const mount=this.editor.mounts.get(b.key);if(mount?.root.isConnected){this.editor.focus.request(b.key,{reason:'document-presentation',caret:b.native});if(b.inline)mount.restoreInlineSelection?.(b.inline);}}
  }
  check(session:RetainedDocumentSession) {
    const source=session.host.port;
    if(!source||!session.current()||!this.editor.windowManager?.lifecycle.canTransfer(source.windowId)||this.editor.selectionGestures.owner())throw Error('Finish composition, gestures or the pending window operation first');
    const root=session.projection.node(session.rootKey),id=(root?.payload.metadata as {documentId?:string}|undefined)?.documentId??root?.payload.id;
    if(typeof id==='string'&&existingNativeDocumentSession(this.editor)?.knowledgeEvidence(id).pending)throw Error('Finish the Document Save or recovery before switching presentation');
    if(this.editor.interchange.busy()||this.editor.interchange.picker()||this.editor.interchange.question())throw Error('Finish the current import/export or resource picker before switching presentation');
    if(this.editor.viewCloseGuards.has(source.slotKey))throw Error('Finish the Document close operation first');
    const key=this.editor.focus.state.focusedKey??this.editor.focus.state.lastFocusedKey;
    if(key&&session.projection.node(key)&&this.editor.currentTextOperation.active()?.owns(key))throw Error('Finish the current text operation first');
  }
  present(session:RetainedDocumentSession,port:Pick<DocumentHostPort,'container'|'scrollport'|'activity'|'surfaceContainer'>) {
    const source=session.host.port;
    if(!source||!session.current()||this.leases.has(session.id)||!this.editor.documentSessions?.transfers.atOrigin(session))throw Error('Document already hosted elsewhere');
    if(!source.selected()||!source.container.contains(session.element)||!source.container.isConnected||!port.container.isConnected||port.container.ownerDocument!==session.element.ownerDocument)throw Error('Document host is unavailable');
    this.check(session);
    // No ownership, resource, projection or content transformation takes place.
    const next:DocumentHostPort={...source,...port,coordinates:{scale:()=>1}};
    let restored=false;
    const restore=()=>{
      if(restored)return;restored=true;
      this.leases.delete(session.id);
      if(!session.current())return;
      this.remember(session);
      source.container.append(session.element);session.host.bind(source);
      this.restorePosition(session);
    };
    try {port.container.append(session.element);session.host.bind(next);this.leases.set(session.id,{restore});this.restorePosition(session);}
    catch(error){source.container.append(session.element);session.host.bind(source);throw error;}
    return restore;
  }
  forget(session:RetainedDocumentSession) { this.leases.get(session.id)?.restore();this.bookmarks.delete(session.id); }
  dispose() { for(const lease of [...this.leases.values()])lease.restore();this.bookmarks.clear(); }
}
