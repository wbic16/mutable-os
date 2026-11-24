import type { ReactiveEditor } from '../../reactive-editor/editor';
import { isTabCommandQuery, tabCommandCandidates } from '../../runtime/tab-commands';
import { parseTableCommand, tableCommandCandidates } from '../../runtime/table-commands';
import { surfaceCommands } from '../../runtime/block-surfaces';
import { flintCommand } from './flint-command';
export function scryCommands(editor: ReactiveEditor, nodeKey: string, query = '', eligible = (id:string) => editor.commandRegistry.canExecute(id,{targetKey:nodeKey,args:undefined})) {
     const flint=editor.features.flintSlashCommands&&editor.features.flint?flintCommand(query):undefined;
     if(flint)return [{id:'flint.open',name:'flint open',reason:flint.kind==='open'?'Open or activate Flint · add --doc to choose a Document':'Use /flint open or /flint open --doc <Document name>',disabled:flint.kind!=='open'}];
     const tables=tableCommandCandidates(editor,nodeKey,query);
     const tabs=tabCommandCandidates(editor,nodeKey,query);
     if(editor.features.verticalTabs&&isTabCommandQuery(query))return tabs;
     // An unavailable exact /c stays literal; do not fall through to /col or container.
     if(editor.features.tableLayouts&&parseTableCommand(query))return tables;
     return [...tables, ...tabs, ...[
     ...(editor.features.reversibleBlocks?surfaceCommands:[]),
     ...(editor.features.glossMode?[{id:'gloss.create',name:'gloss',reason:'Write a Document-local Gloss'}]:[]),
     {id:'entity',name:'entity',reason:'Resolve an Entity or create explicitly'},
     {id:'link',name:'link',reason:'Reference an available native Document'},
     ...(editor.features.flintSlashCommands&&editor.features.flint?[{id:'flint.open',name:'flint open',reason:'Open or activate Flint · add --doc to choose a Document'}]:[]),
     ...(editor.features.semanticRetrieval?[{id:'search',name:'search',reason:'Scry: search saved passages, lexical first then semantic'}]:[]),
     {id:'entity.list.open',name:'backlinks',reason:'Open the current Document Entity references'},
     {id:'thesis.createProposition',name:'proposition',reason:'Open a Thesis draft'},
     ...(editor.features.standoffCodeMirror&&editor.features.editorInputOwnership?[{id:'code.standoff.create',name:'code',reason:'Insert annotated CodeMirror block'}]:[]),
     {id:'date',name:'date',reason:'Insert today’s local ISO date'},
    ].filter(r=>['entity','link','date','search'].includes(r.id)||eligible(r.id)).filter(r=>!query||r.name.toLowerCase().includes(query.toLowerCase()))];}
