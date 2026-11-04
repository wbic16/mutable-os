import type {WorkspaceWindowManager} from '../application/window-manager';
/** Optional application-level modal parent. Graphical presentations retain body portals. */
const surfaces=new WeakMap<WorkspaceWindowManager,HTMLElement>();
export const applicationPresentationSurface=(manager?:WorkspaceWindowManager)=>manager&&surfaces.get(manager);
export function ownApplicationPresentationSurface(manager:WorkspaceWindowManager,element:HTMLElement){
 const previous=surfaces.get(manager);surfaces.set(manager,element);
 return()=>{if(surfaces.get(manager)!==element)return;if(previous?.isConnected)surfaces.set(manager,previous);else surfaces.delete(manager);};
}
