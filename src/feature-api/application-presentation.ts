import type {Accessor, Component} from 'solid-js';
import type {PresentationName} from '../reactive-editor/workspace-presentation';
/** Typed keys may be imported by independent presentation features. */
export interface ApplicationKey<I> { readonly id:string; readonly instanceType?: (instance:I)=>I }
export const applicationKey=<I>(id:string):ApplicationKey<I>=>({id});
export interface ApplicationDefinition<I> {
 name:string;
 instances():readonly I[];
 key(instance:I):string;
 windowId?(instance:I):string|undefined;
 open?():unknown|Promise<unknown>;
 ownsNode?(instance:I,nodeKey:string):boolean;
 checkTransition?(instance:I,from:PresentationName,to:PresentationName):string|undefined;
 remember?(instance:I):void;
 resume?(instance:I,navigation:boolean):void;
}
export interface ApplicationPresentationHost {
 active:Accessor<boolean>;
 open(applicationId:string):Promise<void>;
 select(instanceKey:string):void;
 back(destination?:{applicationId:string;instanceKey:string}|true):void;
}
export interface ApplicationPresentation<I> {
 id:string; workspace:PresentationName; default?:boolean;
 /** Optional host entry preference; not a compatibility or admission rule. */
 entryPriority?:number;
 /** Retention is an adapter concern; ordinary Solid components need no DOM lease. */
 view:Component<{instance:I;host:ApplicationPresentationHost}>;
 available?(instance:I):string|undefined;
 admit?(instance:I):string|undefined;
 interaction:'exclusive-session'|'exclusive-instance'|'noninteractive';
}
export type PresentationResolution<I> =
 | {status:'ready';presentation:ApplicationPresentation<I>}
 | {status:'unsupported'|'blocked';reason:string};
