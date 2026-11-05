import {createContext,useContext,type Accessor,type Component} from 'solid-js';
import type {LerModel} from '../features/entity-references/ler-view';
import type {CompletionModel} from '../features/autocomplete/view';
import type {GlossViewModel} from '../features/gloss/presentation';
/** Optional views at the Workspace composition boundary. Controllers retain ownership. */
export interface InstrumentPresentations {
 entityEntry?:'query'|'command';
 ler?:Component<{model:LerModel}>;
 completion?:Component<{model:CompletionModel}>;
 gloss?:Component<{model:GlossViewModel}>;
}
export const InstrumentPresentationContext=createContext<Accessor<InstrumentPresentations|undefined>>();
export const useInstrumentPresentations=()=>useContext(InstrumentPresentationContext);
