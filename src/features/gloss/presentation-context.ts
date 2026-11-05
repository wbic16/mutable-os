import {createContext,useContext,type Accessor} from 'solid-js';
export interface GlossPresentationControls {active:Accessor<boolean>;narrow:Accessor<boolean>;references:Accessor<boolean>;toggle():void;toggleReferences():void}
export const GlossPresentationContext=createContext<GlossPresentationControls>();
export const useGlossPresentation=()=>useContext(GlossPresentationContext);

import type {RetainedDocumentSession} from '../../application/document-sessions';
const presentations=new WeakMap<RetainedDocumentSession,GlossPresentationControls>();
export const glossPresentationControls=(session:RetainedDocumentSession)=>presentations.get(session);
export function ownGlossPresentation(session:RetainedDocumentSession,controls:GlossPresentationControls){presentations.set(session,controls);return()=>presentations.delete(session);}
