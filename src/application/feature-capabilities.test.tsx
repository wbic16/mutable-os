// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEffect } from "solid-js";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { registerCoreViews } from "../rendering/register-core-views";
import { blockFeatureCapabilities } from "./feature-capabilities";
import type { BlockFeatureCapabilities, BlockRuntime } from "../feature-api";

describe("feature and Block runtime adapters", () => {
  it("provides self-bound detached reactive reads and cancels effects/deferred focus on disposal", async () => {
    const editor = new ReactiveEditor({ id: "doc", type: "document-block", children: [{ id: "owned", type: "pilot-block", setting: { count: 1 } }] });
    registerCoreViews(editor);
    const view = editor.createView(), key = Object.values(view.state.nodes).find(node => node.payload.id === "owned")!.key;
    let ports!: BlockFeatureCapabilities, runtime!: BlockRuntime;
    const counts: number[] = [];
    editor.featureHost.activate({ id: "pilot", activate(scope) {
      ports = blockFeatureCapabilities(editor, scope);
      ports.register.block({ type: "pilot-block", create: () => ({ type: "pilot-block" }), capabilities: [], view: props => {
        runtime = props.runtime;
        createEffect(() => counts.push((runtime.field("setting") as { count: number }).count));
        return null;
      } });
    } });
    const host = document.body.appendChild(document.createElement("div"));
    const dispose = render(() => <ReactiveTreeView editor={editor} projection={view} />, host);
    try {
      expect(runtime.nodeKey).toBe(key);
      expect(runtime.authoredStateProtected()).toBe(false);
      const releaseProtection=editor.textProtection.protect(editor.node(key)!.contentKey);
      expect(runtime.authoredStateProtected()).toBe(true);expect(()=>runtime.setField('setting',{count:8},'Protected')).toThrow(/protected/);
      releaseProtection();expect(runtime.authoredStateProtected()).toBe(false);
      const read = runtime.field("setting") as { count: number }; read.count = 100;
      expect(runtime.field("setting")).toEqual({ count: 1 });
      runtime.setField("setting", { count: 2 }, "Update");
      expect(counts).toEqual([1, 2]);
      expect(() => ports.blocks.insert({ type: "foreign-block" }, { kind: "at", parentKey: view.state.rootKey, index: 0 })).toThrow("unowned");
      ports.blocks.focusPlacement(editor.node(key)!.placementKey, view.viewId);
      editor.featureHost.dispose(); await Promise.resolve();
      expect(editor.focus.state.focusedKey).toBeUndefined();
      expect(() => runtime.setField("setting", {}, "After disposal")).toThrow("disposed");
      editor.commands.setPayloadField(key, "setting", { count: 3 });
      expect(counts).toEqual([1, 2]);
    } finally { dispose(); editor.dispose(); host.remove(); }
  });
});

it("owns widget menu callbacks, guards stale actions, and exposes only occurrence scale", async () => {
  const editor = new ReactiveEditor({ type: 'document-block', children: [{ id: 'pilot', type: 'menu-pilot', value: 0 }] });
  registerCoreViews(editor); let runtime!: BlockRuntime;
  editor.featureHost.activate({ id: 'menu-pilot', activate(scope) {
    blockFeatureCapabilities(editor,scope).register.block({ type:'menu-pilot',create:()=>({type:'menu-pilot'}),capabilities:['opaque-widget'],view:props=> {
      runtime=props.runtime;
      const root=document.createElement('div');root.tabIndex=-1;
      runtime.mountWidget(root,{contextActions:()=>[{label:'Increment',run:()=>runtime.setField('value',1,'Increment')}]});
      return root;
    } });
  } });
  const projection=editor.createView(),host=document.body.appendChild(document.createElement('div'));
  const dispose=render(()=><ReactiveTreeView editor={editor} projection={projection} coordinates={{scale:()=>2}}/>,host);
  try {
    expect(runtime.scale()).toBe(2);
    const handle=editor.mounts.get(runtime.nodeKey)!;const action=handle.contextActions!()[0];
    runtime.openContextMenu({x:40,y:50});runtime.openContextMenu({x:40,y:50});expect(editor.overlays.overlays).toHaveLength(1); expect(runtime.contextMenuOpen()).toBe(true);
    action.run!();expect(runtime.field('value')).toBe(1);
    editor.featureHost.dispose();expect(editor.overlays.overlays).toHaveLength(0);
    expect(()=>action.run!()).toThrow('disposed');expect(()=>runtime.openContextMenu()).toThrow('disposed');
  } finally {dispose();editor.dispose();host.remove();}
});
