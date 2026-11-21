// @vitest-environment jsdom
// Read-only qualification of the existing case study; never edits its file/session.
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ReactiveEditor} from '../../../../src/reactive-editor/editor';
import {registerApplicationViews} from '../../../../src/application/features';
import {admitNative,decodeNative} from '../../../../src/persistence/native-resource';
import {DialecticReferences} from '../../../../src/features/dialectic/references';
import {DcpSources} from '../../../../src/features/dialectic/dcp/sources';
import {semanticWorkspace} from '../../../../src/features/dialectic/dcp/workspace';
it.skipIf(process.env.DCP_WORKSPACE_AUTHENTICITY!=='1')('projects only real committed semantics from the authenticity Symposium',async()=>{
 const path='vaults/imported/Conversation on November 11, 2026.ink',bytes=readFileSync(path),native=decodeNative(bytes);
 const editor=new ReactiveEditor({id:'read-only-bank',type:'workspace-object-bank-block',children:[]},{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,dialecticConversationUpdates:false,dialecticAutomaticTitles:false}});registerApplicationViews(editor);
 const state=editor.repository.readState();admitNative(editor.repository,bytes,state.placements[state.rootPlacementKey].contentKey);const view=editor.createView('authenticity-read-only'),root=view.node(view.node(view.state.rootKey)!.children[0])!,refs=new DialecticReferences(editor,view,root.key);
 const sources=new DcpSources(editor,native.resourceId,()=>root.children.map(k=>view.node(k)!),k=>view.node(k),k=>view.parentOf(k),t=>refs.resolve(t),new AbortController().signal,id=>refs.relationsFor(id),120000,id=>refs.argumentsFor(id),{profile:'research'},refs);
 try{const revision=editor.repository.state.revision,workspace=await semanticWorkspace(sources,'qualification-agent');expect(workspace.entities).toHaveLength(0);expect(workspace.classifications.some((c:any)=>c.type==='dialectic/claim')).toBe(true);expect(editor.repository.state.revision).toBe(revision);expect(readFileSync(path)).toEqual(bytes);writeFileSync('docs/development/evidence/dcp-semantic-workspace/authenticity-workspace.json',JSON.stringify({source:path,sha256:createHash('sha256').update(bytes).digest('hex'),workspace,diagnostics:sources.diagnostics},null,2));}finally{sources.dispose();refs.dispose();editor.dispose();}
});
