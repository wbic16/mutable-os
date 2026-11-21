import { createContext } from 'solid-js';
/** The enclosing paragraph is a real reflow dependency of inline reading text. */
export const InlineReadingLayout = createContext<() => void>();
