/**
 * Application feature switches.
 *
 * `compactEditorChrome` defaults on; set false to use the previous wrapping toolbar.
 * `compactDocumentMode` defaults on; set false to hide the laptop-density
 * presentation and per-window Compact Document control.
 * `codexSystemBar` defaults on; set false to use the previous workspace toolbar.
 * `directDomCharacterCells` defaults on; set false to use Solid's per-cell renderer.
 *
 * Block history is deliberately opt-in while the feature is being introduced.
 * Set `blockHistory` to `true` to expose the History/Restore UI and allow a
 * ReactiveEditor to start session or persistent history recording.
 *
 * `textSuperposition` is an experimental projected-reading feature and remains
 * disabled unless a host or dedicated demo explicitly enables it.
 */
export type FeatureFlags = Readonly<{
  /** Presentation orientation on existing TabRows. */
  verticalTabs: boolean;
  /** Atlas artwork and application shortcuts on the workspace Desktop. */
  desktopApplicationIcons: boolean;
  /** Structural containers and retained front/back surfaces. */
  reversibleBlocks: boolean;
  /** Native task items and automatic task prefixes. Legacy data remains readable. */
  taskLists: boolean;
  /** Canonical table layout operations; legacy tables remain readable. */
  tableLayouts: boolean;
  /** Canonical workspace A0 ordering and owner-scoped surface layers. Session-fixed. */
  mutableWindowManager: boolean;
  /** Occurrence-scoped, local-first annotation and reference completion. */
  autocompleteWorkstation: boolean;
  /** Provisional, occurrence-local Scry character presentation and history. */
  scryProvisionalCells: boolean;
  /** Workspace-owned retained Document render sessions. Session-fixed; no transfer UI. */
  retainedDocumentSessions: boolean;
  /** Internal E1.2 host transfer coordinator; product Detach UI remains a later milestone. */
  documentSessionHostTransfer: boolean;
  /** Experimental product Detach/Return; runtime topology is not persisted. */
  documentDetachment: boolean;
  /** Shared native clipboard. Disable to restore all legacy clipboard routes together. */
  mutableClipboard: boolean;
  /** Explicit file import, source conversion and semantic export. */
  documentInterchange: boolean;
  /** Cavern application services, durable preparation jobs and bounded host execution. */
  applicationServices: boolean;
  /** Explicit reviewed static publication; independent of ordinary editing. */
  webPublishing: boolean;
  /** Semantic external HTML through the shared Mutable clipboard pipeline. */
  externalHtmlClipboard: boolean;
  /** Explicit Markdown command and Markdown MIME through the shared clipboard. */
  markdownClipboard: boolean;
  /** Managed PNG/JPEG clipboard import through the Cavern immutable asset facility. */
  managedAssetClipboard: boolean;
  /** A user paste authorises acquisition of its remote images; failures remain recoverable. */
  automaticClipboardImages: boolean;
  /** Primary-Shift-V turns a single HTTP(S) URL into its resource Block. */
  resourceUrlPaste: boolean;
  academicResourceLoaders: boolean;
  crossResourceLoaders: boolean;
  structuredResources: boolean;
  webResourceViewers: boolean;
  everydayWebResources: boolean;
  deterministicAcademicResources: boolean;
  iiifResourceLoaders: boolean;
  /** Explicit global Cavern setup and startup lifecycle. */
  cavernStartup: boolean;
  /** Generic Desktop Window maximize/restore; normal geometry is retained. */
  windowMaximize: boolean;
  /** Composite Document application; transient tabs share canonical content. */
  flint: boolean;
  /** Compact HTML shell, resizable panels and local editor-density preferences. */
  flintCompactShell: boolean;
  /** Vault-scoped list of the ten most recently opened Documents. */
  flintRecentDocuments: boolean;
  /** Ink-native character screen and amber material presentation. */
  phosphor: boolean;
  /** Physical Phosphor emblem with a local, slowly migrating discharge. */
  phosphorNixie: boolean;
  /** Occasional light movement across Phosphor's Nixie logo. */
  phosphorStudioDrift: boolean;
  /** Manual controls for Phosphor's logo lighting. */
  phosphorLightingControls: boolean;
  /** Lighting and material controls for Flint graph views and the logo. */
  flintMaterialChrome: boolean;
  /** Retired prototype flag; application chrome is always HTML. */
  flintSceneChrome: boolean;
  /** Small independently rendered Three.js mask in the application header. */
  flintLogo: boolean;
  /** Application-wide stone pointer; Alt + wheel rotates it. */
  flintProbe: boolean;
  /** Shared Probe cursor in Spatial and Infinite Canvas presentations. */
  presentationProbe: boolean;
  /** Live sculptural entity graph in the normal Flint application. */
  flintSpatialGraph: boolean;
  /** Per-resource native/Markdown persistence through the managed server store. */
  nativeDocumentPersistence: boolean;
  /** Persistent Library listings with background filesystem reconciliation. */
  vaultDiscoveryCache: boolean;
  /** Accepted loaded-resource provider; false retains the legacy rollback. */
  nativeKnowledge: boolean;
  /** P5 saved coverage qualification; rollout remains separately reviewed. */
  nativeKnowledgeSaved: boolean;
  /** Vault-owned saved SQLite lifecycle only; does not change query/Entity providers. */
  sqliteKnowledge: boolean;
  /** Canonical vault Entity resolver. Disabling never resumes legacy writes. */
  sqliteEntities: boolean;
  /** Typed canonical temporal, assertion and observation services. */
  sqliteSemanticServices: boolean;
  /** Native Proposition authoring with vault-scoped canonical SQLite persistence. */
  thesis: boolean;
  /** Cardex shell and local Entity Card authoring. */
  cardex: boolean;
  cardexIncrement2: boolean;
  /** Source-preserving Codex migration into explicitly selected disposable vaults. */
  legacyCodexImport: boolean;
  /** Initial Document format arrangements and creation menu. */
  documentFormats: boolean;
  threeDObjects: boolean;
  /** Block-relative presentation; disable to retain data with ordinary rendering. */
  anchorRelationships: boolean;
  /** Canonical Desktop/Canvas presentation. The main application enables it;
   * other editor hosts opt in explicitly. */
  canvasWorkspace: boolean;
  /** Dedicated measured character-cell Workspace presentation. */
  applicationPresentations: boolean;
  textualWorkspace: boolean;
  /** Experimental study presentation; explicitly opt in at application assembly. */
  spatialWorkspace: boolean;
  /** Lift and arrange all desk objects, including the study props. */
  spatialDeskObjects: boolean;
  /** Existing Timer capability remains on; activation is decided by application composition. */
  timer: boolean;
  /** Existing retained selection behavior, activated only by application composition. */
  grouping: boolean;
  /** Existing Entity References, activated by application composition. */
  entityReferences: boolean;
  blockHistory: boolean;
  codexSystemBar: boolean;
  compactDocumentMode: boolean;
  compactEditorChrome: boolean;
  textSuperposition: boolean;
  /** Direct DOM character cells, updated by one reactive effect per paragraph. */
  directDomCharacterCells: boolean;
  /** Native-layout, single-Cell static character surfaces. */
  inlineCharacterSurfaces: boolean;
  /** Bundled asynchronous Initialis still-image renderer and direct activation. */
  glossMode: boolean;
  glossPresentation: boolean;
  glossRelationships: boolean;
  glossRelationshipAuthoring: boolean;
  glossMermaidGraph: boolean;
  glossArgumentExplorer: boolean;
  glossGraphNavigation: boolean;
  initialisCharacterRenderer: boolean;
  /** Transient caret enter/leave events and SVG emphasis for opted-in annotations. */
  annotationRangeEvents: boolean;
  /** Session-only focus effects; Normal is the initial mode. */
  caretModes: boolean;
  /** Viewport-geometry Reading Spotlight mode. */
  readingSpotlight: boolean;
  /** Optional mouse-controlled document lighting; initially switched off. */
  pointerSpotlight: boolean;
  /** Shared renderer registry and transient range rendering. */
  standoffPropertyRendering: boolean;
}>;

export const featureFlags: FeatureFlags = Object.freeze({
  verticalTabs: true,
  desktopApplicationIcons: true,
  reversibleBlocks: true,
  taskLists: true,
  tableLayouts: true,
  mutableWindowManager: true,
  autocompleteWorkstation: true,
  scryProvisionalCells: true,
  retainedDocumentSessions: true,
  documentSessionHostTransfer: true,
  documentDetachment: true,
  mutableClipboard: true,
  documentInterchange: true,
  applicationServices: true,
  webPublishing: true,
  externalHtmlClipboard: true,
  markdownClipboard: true,
  managedAssetClipboard: true,
  automaticClipboardImages: true,
  resourceUrlPaste: true,
  academicResourceLoaders: true,
  crossResourceLoaders: true,
  structuredResources: true,
  webResourceViewers: true,
  everydayWebResources: true,
  deterministicAcademicResources: true,
  iiifResourceLoaders: true,
  cavernStartup: true,
  windowMaximize: true,
  flint: true,
  flintCompactShell: true,
  flintRecentDocuments: true,
  phosphor: true,
  phosphorNixie: true,
  phosphorStudioDrift: true,
  phosphorLightingControls: true,
  flintMaterialChrome: true,
  flintSceneChrome: false,
  flintLogo: true,
  flintProbe: false,
  presentationProbe: false,
  flintSpatialGraph: true,
  nativeDocumentPersistence: true,
  vaultDiscoveryCache: true,
  nativeKnowledge: true,
  nativeKnowledgeSaved: false,
  sqliteKnowledge: true,
  sqliteEntities: true,
  sqliteSemanticServices: true,
  thesis: true,
  cardex: true,
  cardexIncrement2: true,
  legacyCodexImport: true,
  documentFormats: true,
  threeDObjects: true,
  anchorRelationships: true,
  canvasWorkspace: false,
  applicationPresentations: true,
  textualWorkspace: true,
  spatialWorkspace: false,
  spatialDeskObjects: true,
  timer: true,
  grouping: true,
  entityReferences: true,
  blockHistory: false,
  codexSystemBar: true,
  compactDocumentMode: true,
  compactEditorChrome: true,
  textSuperposition: false,
  directDomCharacterCells: true,
  inlineCharacterSurfaces: true,
  glossMode: true,
  glossPresentation: true,
  glossRelationships: true,
  glossRelationshipAuthoring: true,
  glossMermaidGraph: true,
  glossArgumentExplorer: true,
  glossGraphNavigation: true,
  initialisCharacterRenderer: true,
  annotationRangeEvents: true,
  caretModes: true,
  readingSpotlight: true,
  pointerSpotlight: true,
  standoffPropertyRendering: true,
});

export type ReactiveEditorConfiguration = {
  features?: Partial<FeatureFlags>;
};

export function resolveFeatureFlags(configuration: ReactiveEditorConfiguration = {}): FeatureFlags {
  return Object.freeze({ ...featureFlags, ...configuration.features });
}
