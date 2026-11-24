import type { PropertyTypeDefinition, VisualRenderer, AnnotationHandler } from "../runtime/visual-effect-registry";
import type { AnnotationRangeEvent, RangeTransitionEvent } from "../runtime/annotation-range-events";
import type { JsonObject, CommandDefinition } from "../block-tree/types";
import type { BindingAction, BindingRegistry } from "../input/bindings";
import type { FeatureAction, Disposer } from "../runtime/features";
import type { SearchMatch, SearchRange, SearchScope, ScopeKind, TextSearch } from "../runtime/text-search";
import type { SearchRunner } from "../runtime/search-worker";
import type { SessionDecorations } from "../runtime/session-decorations";
type DecorationStyle = NonNullable<Parameters<SessionDecorations["attachMatches"]>[2]>;
import type { AnnotationContribution, AnnotationTarget } from "../runtime/annotation-contributions";
import type { PanelDefinition, PanelSession } from "../runtime/panel-contributions";
import type { EffectDefinition } from "../runtime/effect-contributions";
import type { DocumentPositionMarker } from "../runtime/document-position-markers";

export interface AnnotationText {
  readonly key: string; readonly contentKey: string; readonly placementKey: string; readonly version: number;
  readonly coordinate?: "cell" | "utf16";
  readonly cells: readonly { readonly text: string; readonly plain: boolean }[];
  readonly properties: readonly JsonObject[];
}
export interface AnnotationCapabilities {
  codeAnnotations?: { supports(key:string):boolean; open(key:string,type:string):void };
  liveDocumentEntities?(owner: string): import('./live-entities').LiveDocumentEntities;
  /** Validate snapshots without copying paragraph text. Used only before mutation. */
  validateRanges?(ranges: readonly SearchRange[]): void;
  /** Changed content identities; no text snapshots or document traversal. */
  watchContent?(listener: (change: {keys: ReadonlySet<string>; revision: number; structural: boolean}) => void): Disposer;
  readonly caretEvents?:boolean;
  temporaryRanges?(owner:string): import("../runtime/session-decorations").TemporaryRangeCollection;
  entities?(owner:string):import('./entities').EntityService;
  replaceAndAnnotate?(range:SearchRange,text:string,type:string,value:string,metadata:JsonObject,revision:number):void;
  focusRange?(range:SearchRange,revision:number):void;
  recoverySelection?(owner:string):AnnotationTarget[];
  revision(): number;
  text(key: string): AnnotationText | undefined;
  path(key: string): { key: string; label: string }[];
  scope(key: string, kind?: ScopeKind): SearchScope;
  documentTexts(key: string): { scope: SearchScope; texts: AnnotationText[] };
  /** Annotation inventory without materialising every character's text. */
  documentAnnotations(key: string): { scope: SearchScope; texts: (Omit<AnnotationText, 'cells'> & { readonly cellCount: number })[]; blockReferences?: {contentKey:string;properties:readonly JsonObject[]}[] };
  /** Source-scoped reference/structure changes, excluding ordinary text edits
   * and automatic offset rebasing. A stable signature permits summary reuse;
   * resolve current occurrence ranges on demand before preview/navigation. */
  watchDocumentEntities(key: string, listener: (change: { signature: string; removed: boolean }) => void): {
    readonly key: string; readonly signature: string; dispose(): void;
  };
  selection(key: string): AnnotationTarget[];
  /** Target-local validation; unrelated commits advance only the revision fence. */
  watchTarget?(owner: string, ranges: readonly SearchRange[], listener: (change: {valid: boolean; revision: number}) => void): Disposer;
  beforeChange(listener: () => void): Disposer;
  afterChange(listener: () => void): Disposer;
  search(runner?: SearchRunner): Pick<TextSearch, "searchText" | "dispose">;
  annotate(groups: readonly (readonly SearchRange[])[], type: string, value: string, metadata: JsonObject, revision: number, label: string): string[];
  openPanel(type: string, owner: string, data: unknown, selection?: readonly AnnotationTarget[]): PanelSession;
  decorations(owner: string): {
    ranges(ranges: SearchRange[], style: DecorationStyle): void;
    matches(set: Parameters<SessionDecorations["attachMatches"]>[1], style: DecorationStyle): void;
    visible(visible: boolean): void; active(id: string): void; clear(): void; dispose(): void;
  };
  reveal(match: SearchMatch, valid: () => boolean): Promise<boolean>;
  revealMarker(marker: DocumentPositionMarker, valid: () => boolean): Promise<boolean>;
  currentPage(scope: SearchScope, key: string): string | undefined;
  pageKeys(key: string): ReadonlySet<string>;
  concertina: {
    activate(owner: string, scope: SearchScope, markers: DocumentPositionMarker[], active: string | undefined, replaced: () => void): void;
    clear(owner: string): void; active(id: string): void;
  };
  bindings: Pick<BindingRegistry, "dispatch" | "label">;
  register: {
    caretMode?(definition: import("../runtime/caret-modes").CaretModeDefinition): void;
    focusProvider?(definition: import("../runtime/focus-region").FocusProvider): void;
    rangeEvent?(listener:(event:RangeTransitionEvent)=>void):void;
    propertyType?(definition: PropertyTypeDefinition): void;
    renderer?(definition: VisualRenderer): void;
    handler?(name: string, handler: AnnotationHandler): void;
    panel(definition: PanelDefinition): void;
    effect(definition: EffectDefinition): void;
    /** Occurrence-local enter/leave events for opted-in SVG effects; disposed with the feature scope. */
    annotationEvent(listener: (event: AnnotationRangeEvent) => void): void;
    annotation(definition: AnnotationContribution): void;
    command(definition: CommandDefinition<void>): void;
    binding(definition: BindingAction): void;
    action(definition: FeatureAction): void;
  };
}
