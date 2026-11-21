import { RetainedBlockOutlets } from '../rendering/retained-block-outlets';
import { createContext, useContext, onCleanup, type ParentComponent } from "solid-js";
import type { BlockTreeProjection } from "../block-tree/projection";
import type { ReactiveEditor } from "./editor";
import type { NodeKey } from "../block-tree/types";
import { identityCoordinates, type LocalCoordinates } from "../runtime/local-coordinates";
import type { WindowGeometryHost } from "../rendering/window-geometry";

interface ReactiveViewContextValue {
  passive?: boolean;
  openSource?: () => void;
  retainedBlocks?: RetainedBlockOutlets;
  editor: ReactiveEditor;
  projection: BlockTreeProjection;
  coordinates?: LocalCoordinates;
  windowGeometry?: (key: NodeKey) => WindowGeometryHost | undefined;
  activity?: () => import("../application/document-sessions").DocumentActivity;
}

const ReactiveViewContext = createContext<ReactiveViewContextValue>();

export const ReactiveViewProvider: ParentComponent<ReactiveViewContextValue> = (props) => {
  const retainedBlocks = props.editor.features.reversibleBlocks ? new RetainedBlockOutlets() : undefined;
  onCleanup(() => retainedBlocks?.dispose());
  return <ReactiveViewContext.Provider value={{ passive: props.passive, openSource: props.openSource, retainedBlocks, editor: props.editor, projection: props.projection, coordinates: props.coordinates ?? identityCoordinates, windowGeometry: props.windowGeometry, activity: props.activity }}>
    {props.children}
  </ReactiveViewContext.Provider>;
};

export function useReactiveView(): ReactiveViewContextValue {
  const context = useContext(ReactiveViewContext);
  if (!context) throw new Error("Block views require a ReactiveViewProvider");
  return context;
}
