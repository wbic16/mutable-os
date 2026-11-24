import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { CodeAnnotationUI } from './ui';
/** Occurrence adapters only; MountRegistry remains the authority for input. */
export const codeSurfaces=new WeakMap<ReactiveEditor,Map<string,CodeAnnotationUI>>();
export function codeSurface(editor:ReactiveEditor,key:string){return codeSurfaces.get(editor)?.get(key);}
