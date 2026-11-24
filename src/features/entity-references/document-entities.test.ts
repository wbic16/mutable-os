import { entityTestApi, entityTestList, registerEntityTestViews } from "./test-support";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { collectDocumentEntities } from "./document-entities";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach(dispose => dispose()));

describe("document entity inventory", () => {
  it.each(['mutable/citation-block','mutable/web-article-block'])('does not freeze live %s properties when opening the Entity inventory', type => {
    const editor = new ReactiveEditor({type:'document-block',children:[
      {id:'text',type:'standoff-editor-block',text:'Mention'},
      {id:'resource',type,blockProperties:[{id:'ref',type:'codex/entity-reference',value:'entity',metadata:{entityName:'Entity'}}]},
    ]});
    const view=editor.createView('block-property-inventory');cleanup.push(()=>editor.dispose());
    const node=Object.values(view.state.nodes).find(n=>n.payload.id==='resource')!;
    const api=entityTestApi(editor), snapshot=vi.spyOn(editor.repository,'snapshot'),revision=editor.repository.state.revision;
    const inventory=collectDocumentEntities(api,view.state.rootKey);
    expect(inventory.rows).toEqual([expect.objectContaining({id:'entity',fallbackName:'Entity',documentMentions:1})]);
    const properties=node.payload.blockProperties as any[];
    expect(properties[0].metadata.entityName).toBe('Entity');
    expect(Object.isFrozen(properties)).toBe(false);expect(Object.isFrozen(properties[0])).toBe(false);
    const detached=api.documentAnnotations(view.state.rootKey).blockReferences![0].properties;
    expect(Object.isFrozen(detached)).toBe(true);expect(Object.isFrozen(detached[0])).toBe(true);
    expect(detached).not.toBe(properties);expect(detached[0]).not.toBe(properties[0]);
    expect(snapshot).not.toHaveBeenCalled();expect(editor.repository.state.revision).toBe(revision);
    editor.commands.setPayloadField(node.key,'blockProperties',[{id:'ref',type:'codex/entity-reference',value:'updated'}]);
    expect(collectDocumentEntities(api,view.state.rootKey).rows[0].id).toBe('updated');
  });
  it("reads annotation metadata without visiting character cells or making text snapshots", () => {
    const editor = new ReactiveEditor({ type: 'document-block', children: [{ id: 'letter', type: 'standoff-editor-block', text: 'Michelangelo '.repeat(500),
      standoffProperties: [{ id: 'artist', type: 'codex/entity-reference', value: 'artist', start: 0, end: 11 }] }] });
    const view = editor.createView('inventory-cost'); cleanup.push(() => editor.dispose());
    const api = entityTestApi(editor), read = editor.node.bind(editor);
    const node = vi.spyOn(editor, 'node').mockImplementation(key => {
      const result = read(key);
      if (result?.viewType === 'text-cell') throw Error('Inventory must not read character payloads');
      return result;
    });
    const text = vi.spyOn(api, 'documentTexts');
    try {
      const result = collectDocumentEntities(api, view.state.rootKey);
      expect(result.rows[0]).toMatchObject({ id: 'artist', documentMentions: 1, ranges: [{ start: 0, end: 12 }] });
      expect(text).not.toHaveBeenCalled();
    } finally { node.mockRestore(); text.mockRestore(); }
  });
  it("counts linked segments once, ordinary properties separately and excludes nested Documents", () => {
    const editor = new ReactiveEditor({
      type: "document-block",
      linkedAnnotations: { shared: { id: "shared", type: "codex/entity-reference", value: "blake", metadata: { entityName: "Vernon Blake" } } },
      children: [
        { id: "a", type: "standoff-editor-block", text: "Vernon", standoffProperties: [
          { id: "a-linked", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 5 },
          { id: "a-local", type: "codex/entity-reference", value: "blake", metadata: { entityName: "Vernon Blake" }, start: 0, end: 5 },
          { id: "deleted", type: "codex/entity-reference", value: "other", isDeleted: true, start: 0, end: 1 },
        ] },
        { id: "b", type: "standoff-editor-block", text: "Blake", standoffProperties: [{ id: "b-linked", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 4 }] },
        { type: "document-block", children: [{ id: "nested", type: "standoff-editor-block", text: "Other", standoffProperties: [{ id: "nested-ref", type: "codex/entity-reference", value: "other", start: 0, end: 4 }] }] },
      ],
    });
    const view = editor.createView("entities"), node = (id: string) => Object.values(view.state.nodes).find(node => node.payload.id === id)!;
    cleanup.push(() => editor.dispose());
    const result = collectDocumentEntities(entityTestApi(editor), node("a").key);
    expect(result.rows).toEqual([expect.objectContaining({ id: "blake", fallbackName: "Vernon Blake", documentMentions: 2 })]);
    expect(result.rows[0].ranges).toHaveLength(3);
    expect(result.rows[0].ranges.map(range => range.nodeKey)).toEqual([node("a").key, node("a").key, node("b").key]);
  });

  it("does not inflate counts for transcluded occurrences but previews both", () => {
    const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "page", type: "page-block", children: [{ id: "a", type: "standoff-editor-block", text: "Entity", standoffProperties: [{ id: "ref", type: "codex/entity-reference", value: "entity", start: 0, end: 5 }] }] }] });
    const view = editor.createView("entities-repeat"), node = (id: string) => Object.values(view.state.nodes).find(node => node.payload.id === id)!;
    editor.commands.transclude(node("a").key, { kind: "at", parentKey: node("page").key, index: 1 }); cleanup.push(() => editor.dispose());
    const result = collectDocumentEntities(entityTestApi(editor), node("a").key);
    expect(result.rows[0].documentMentions).toBe(1); expect(result.rows[0].ranges).toHaveLength(2);
    expect(new Set(result.rows[0].ranges.map(range => range.nodeKey)).size).toBe(2);
  });
});
it('includes native source mentions with explicit UTF16 navigation ranges and no fake Cells',()=>{
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'code',type:'standoff-code-mirror-block',text:'A😀bc',standoffProperties:[{id:'entity',type:'codex/entity-reference',start:1,end:2,value:'ada'}]}]});cleanup.push(()=>editor.dispose());const view=editor.createView('native-inventory'),key=view.state.nodes[view.state.rootKey].children[0],api=entityTestApi(editor);
 expect(api.text(key)).toBeUndefined();expect(collectDocumentEntities(api,key).rows).toMatchObject([{id:'ada',documentMentions:1,ranges:[{coordinate:'utf16',start:1,end:4}]}]);expect(editor.node(key)!.inlineContent).toEqual([]);
});
