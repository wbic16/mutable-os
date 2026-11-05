import type {ReactiveEditor} from '../../reactive-editor/editor';
import {createSignal, type Accessor,type Setter} from 'solid-js';
import type {RetainedDocumentSession} from '../../application/document-sessions';
import type {TextualGrid} from './grid';

/** Fixed Flint splits only. All origins and extents are main-grid cell indices. */
export function flintPanes(grid:TextualGrid, margin:boolean, secondary:boolean, fullSize=false) {
 const width=Math.max(1,grid.columns-2), split=secondary&&width>=108;
 const right=split?36:0;
 const left=margin&&width-right>=82?(fullSize?24:16):0;
 return {width,right,left,document:width-right-left,secondary:split?right:width,fullscreen:secondary&&!split};
}
export interface TextualDocumentLayout {
 grid:TextualGrid; panes:ReturnType<typeof flintPanes>; fullSize:boolean;
 scrollport:HTMLElement; secondary:HTMLElement;
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
