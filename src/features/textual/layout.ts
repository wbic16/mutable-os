import type {ReactiveEditor} from '../../reactive-editor/editor';
import {createSignal, createContext, useContext, type Accessor,type Setter} from 'solid-js';
import type {RetainedDocumentSession} from '../../application/document-sessions';
import type {TextualGrid,TextualPreferences} from './grid';

/** Fixed Flint splits only. All origins and extents are main-grid cell indices. */
export function flintPanes(grid:TextualGrid, margin:boolean, secondary:boolean, fullSize=false,readingWidth=88,vaultVisible=false) {
 const width=Math.max(1,grid.columns-2),vaultWidth=vaultVisible?Math.min(28,width):0,vault=vaultVisible&&width>=80?vaultWidth:0,available=width-vault,split=secondary&&available>=108;
 let right=split?36:0;
 let left=margin&&available-right>=82?(fullSize?24:16):0;
 if(readingWidth){let extra=Math.max(0,available-right-left-readingWidth-4);if(right){const n=Math.min(extra,52-right);right+=n;extra-=n;}if(left)left+=Math.min(extra,24-left);}
 return {width,right,left,vault,vaultWidth,vaultOverlay:vaultVisible&&!vault,document:available-right-left,secondary:split?right:available,fullscreen:secondary&&!split};
}
export interface TextualDocumentLayout {
 grid:TextualGrid; panes:ReturnType<typeof flintPanes>; fullSize:boolean;
 scrollport:HTMLElement; secondary:HTMLElement; showGloss():void;
}
const layouts=new WeakMap<RetainedDocumentSession,[Accessor<TextualDocumentLayout|undefined>,Setter<TextualDocumentLayout|undefined>]>();
function signal(session:RetainedDocumentSession) {
 let value=layouts.get(session);if(!value){value=createSignal<TextualDocumentLayout>();layouts.set(session,value);}return value;
}
export const textualDocumentLayout=(session:RetainedDocumentSession):Accessor<TextualDocumentLayout|undefined>=>signal(session)[0];
export function setTextualDocumentLayout(session:RetainedDocumentSession,value:TextualDocumentLayout|undefined){signal(session)[1](value);}

/** Release the existing focus owner as well as its DOM filter, so its next update cannot restore the filter. */
export function showFullDocument(editor:ReactiveEditor) {
 editor.concertina.claim('textual/source-navigation');editor.concertina.clearAll();
}

export const TextualWorkspaceContext=createContext<{preferences:Accessor<TextualPreferences>;status:Accessor<HTMLElement|undefined>}>();
export const useTextualWorkspace=()=>useContext(TextualWorkspaceContext);
