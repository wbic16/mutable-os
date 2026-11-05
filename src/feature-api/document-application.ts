import type {SavedProviderCoverage} from './backlinks';
import type { Component } from "solid-js";
import type { DocumentFormat } from "../features/document-formats/model";
import type { ExistingBlockDto } from "./index";

export interface ApplicationDocument { id: string; title: string }
export interface RecentApplicationDocument extends ApplicationDocument { location?: {folder: string; filename: string} }
/** The first composite Document application: core owns the rendered tabs/editors. */
export interface DocumentApplicationInstance {
  publish?:()=>void;
  documents(): readonly ApplicationDocument[];
  openDocument(id: string): void;
  recentDocuments?: { items(): readonly RecentApplicationDocument[]; open(id: string): Promise<void>; remove(id: string): void };
  renameDocument(id: string, title: string): void;
  closeActiveTab(): void;
  tabs: Component;
  vault?: ApplicationVault;
  knowledge?: ApplicationKnowledge;
  /** Entity-reference inventory in the active Document occurrence. */
  entityBacklinks?: Component;
  entities?: {
    rows(): readonly { id: string; name: string; documentMentions: number }[];
    pending(): boolean;
    refresh(): void;
    focus(id: string): void;
  };
  properties(): ApplicationDocumentProperties | undefined;
  setProperties(id: string, value: {title: string; tags: readonly string[]}): void;
  interchange?: {
    importCollection():void;
    exportCollection():void;
    importFiles():void;
    importPackage():void;
    exportPackage():void;
    exportPortable(format:'html'|'markdown',standalone?:boolean):void;
    inspectPackage():void;
    downloadViewer():void;
    exportDocument(format:'html'|'markdown'|'text'):void;
    suggestedFilename():string|undefined;
    drag(event:DragEvent,drop?:boolean):void;
    clearDrop():void;
  };
  files?: {
    list(folder: string): Promise<string[]>;
    open(location: {folder: string; filename: string}, importMarkdown?: boolean): Promise<void>;
    /** Omit location to use the current binding or a first-save filename in the active Vault. */
    save(location?: {folder: string; filename: string}): Promise<void>;
    recover(location: {folder: string; filename: string}): Promise<void>;
    compare(): Promise<{external: string; generated: string}>;
    keepMutable(): Promise<void>;
    status(): string;
    location(): {folder: string; filename: string} | undefined;
  };
}
export interface DocumentApplicationCapabilities {
  register(definition: {
    applicationId?: string;
    type: string;
    create(documents: readonly ApplicationDocument[]): ExistingBlockDto;
    view: Component<{ application: DocumentApplicationInstance; initialView?: "document" | "graph" }>;
  }): void;
}

export interface ApplicationDocumentProperties {
  id: string; title: string; tags: readonly string[]; tagsValid: boolean;
  format: string; location?: {folder: string; filename: string}; status: string; unsaved: boolean;
}
export interface ApplicationVaultDocument {
  id: string; title: string; location: {folder: string; filename: string};
  state: string; loaded: boolean; tags: readonly string[];
}
export interface ApplicationVaultState {
  root: string; folders: readonly string[]; documents: readonly ApplicationVaultDocument[];
  markdown: readonly string[]; diagnostics: readonly string[];
  /** Physical candidates, not recognized identities or native persistence bindings. */
  candidates?: readonly string[];
  documentSaves?: readonly {resourceId:string;generation:string;path:string}[];
  operations: readonly {operationId: string; phase: string}[];
  readOnly: boolean; complete: boolean; busy: boolean; notice: string;
  checking?: boolean; cached?: boolean;
}
export interface ApplicationVault {
  documentFormats?: readonly { id: DocumentFormat; label: string }[];
  /** Host-owned, confined server directory chooser. Selection still requires native discovery. */
  choose?(): void;
  state(): ApplicationVaultState | undefined;
  loading?(): boolean;
  error?(): string;
  retry?(): Promise<void>;
  open(root: string): Promise<void>;
  close(): void;
  refresh(): Promise<void>;
  verify?(): Promise<void>;
  openFile(location: {folder: string; filename: string}): Promise<void>;
  openCandidate?(location: {folder: string; filename: string}): Promise<void>;
  createDocument(folder: string, filename: string, title: string, format?: DocumentFormat): Promise<void>;
  importMarkdown(source: {folder: string; filename: string}, destination: {folder: string; filename: string}): Promise<void>;
  createDirectory(parent: string, name: string): Promise<void>;
  relocateDocument(source: {folder: string; filename: string}, destination: {folder: string; filename: string}): Promise<void>;
  relocateDirectory(source: string, destination: string): Promise<void>;
  recoverDocumentSave?(resourceId:string,generation:string):Promise<void>;
  recoverOperation(operationId: string): Promise<void>;
  recoverNative(location: {folder: string; filename: string}): Promise<void>;
}


export interface DocumentTarget { documentId: string; blockId: string; title: string; location: string }
export interface VaultSearchHit extends DocumentTarget { id: string; kind: 'title' | 'text'; snippet: string; start: number; end: number }
export interface VaultSearchResults { savedProvider?:SavedProviderCoverage; coverageMode?: 'loaded'|'saved-and-live'; token: string; hits: readonly VaultSearchHit[]; diagnostics: readonly string[]; available: number; discovered: number; complete: boolean }
export interface NativeReferenceItem { id: string; label: string; target?: DocumentTarget; diagnostic?: string; removable: boolean }
export interface ApplicationKnowledge {
  prepareReferences?(): Promise<void>;
  search(query: string): Promise<VaultSearchResults>;
  cancel(): void;
  current(token: string): boolean;
  activate(hitId: string): Promise<void>;
  selection(): string;
  cancelPicker(): void;
  picker(selection: string): Promise<{targets: readonly DocumentTarget[]; diagnostics: readonly string[]}>;
  createReference(selection: string, target: DocumentTarget): Promise<void>;
  references(): Promise<{token: string; items: readonly NativeReferenceItem[]; diagnostics: readonly string[]}>;
  followReference(id: string): Promise<void>;
  removeReference(id: string): void;
}
