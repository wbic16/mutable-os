import {createContext,type Accessor,type Setter} from 'solid-js';
/** Selected source occurrence in this artboard, not a second text selection. */
export const QuillCompositionContext=createContext<{active:Accessor<string|undefined>;setActive:Setter<string|undefined>}>();
