// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV } from "solid-js";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { DirectCharacterCells } from "./direct-character-cells";

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); vi.restoreAllMocks(); });

function mount(text = "A😀é<&B", directDomCharacterCells = true) {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "a", type: "standoff-editor-block", text },
    { id: "b", type: "standoff-editor-block", text: "Other paragraph" },
  ] }, { features: { directDomCharacterCells } });
  registerCoreViews(editor);
  const projection = editor.createView("direct-test");
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  const gateway = editor.installGateway(document);
  cleanup.push(() => { gateway(); dispose(); editor.dispose(); });
  const owner = projection.node(projection.node(projection.state.rootKey)!.children[0])!;
  const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
  return { editor, projection, host, owner, flow, dispose };
}

describe.each([true, false])("character renderer compatibility (direct=%s)", direct => {
  it("renders code points safely and preserves spans and selection on style changes", () => {
    const { editor, owner, flow } = mount(undefined, direct);
    expect([...flow.children].map(cell => cell.textContent)).toEqual([..."A😀é<&B"]);
    expect(flow.querySelector("script")).toBeNull();
    const spans = [...flow.children], text = spans[1].firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    editor.commands.setPayloadField(owner.key, "standoffProperties", [{ type: "style/bold", start: 1, end: 3 }]);
    expect([...flow.children]).toEqual(spans);
    expect(spans[1].firstChild).toBe(text);
    expect(document.getSelection()!.toString()).toBe("😀");
    expect((spans[1] as HTMLElement).style.fontWeight).toBe("600");
    editor.repository.undo();
    expect((spans[1] as HTMLElement).style.fontWeight).toBe("");
    expect(document.getSelection()!.toString()).toBe("😀");
  });

  it("keeps surviving DOM cells stable through insertion, reordering, deletion and history", () => {
    const { editor, owner, flow, host } = mount("ABCD", direct);
    const other = host.querySelectorAll(".reactive-standoff-flow")[1];
    const observer = new MutationObserver(() => {}); observer.observe(other, { subtree: true, childList: true, attributes: true, characterData: true });
    cleanup.push(() => observer.disconnect());
    const [a, b, c, d] = [...flow.children];
    editor.commands.replaceInlineRange(owner.key, 1, 1, "😀<&");
    expect(flow.textContent).toBe("A😀<&BCD");
    expect(flow.children[4]).toBe(b);
    editor.commands.replaceInlineRange(owner.key, 1, 4, "");
    expect([...flow.children]).toEqual([a, b, c, d]);
    editor.commands.moveInline(owner.key, 3, 0);
    expect([...flow.children]).toEqual([d, a, b, c]);
    editor.repository.undo(); expect([...flow.children]).toEqual([a, b, c, d]);
    editor.repository.redo(); expect([...flow.children]).toEqual([d, a, b, c]);
    expect(observer.takeRecords()).toHaveLength(0);
  });

  it("updates inline image attributes, handles load/failure, and ignores events after disposal", () => {
    const { editor, projection, owner, flow, dispose } = mount("AB", direct);
    const placement = editor.commands.insertInlineImage(owner.key, 1, { assetId: "example", src: "data:image/png;base64,", alt: "example", width: 12, height: 14, status: "pending" });
    const imageKey = projection.nodeForPlacement(placement as string)!.key;
    const span = flow.children[1] as HTMLElement, image = span.firstChild as HTMLImageElement;
    expect(span.className).toBe("reactive-inline-image");
    expect(span.getAttribute("aria-label")).toBe("example");
    expect(image.width).toBe(12); expect(image.height).toBe(14);
    editor.commands.updateInlineImage(imageKey, { alt: "changed", width: undefined, height: 20 });
    expect(flow.children[1]).toBe(span); expect(span.firstChild).toBe(image);
    expect(image.alt).toBe("changed"); expect(image.hasAttribute("width")).toBe(false); expect(image.height).toBe(20);
    image.dispatchEvent(new Event("load")); expect(editor.node(imageKey)!.payload.status).toBe("ready");
    image.dispatchEvent(new Event("error")); expect(editor.node(imageKey)!.payload.status).toBe("failed");
    dispose(); const revision = editor.repository.state.revision;
    image.dispatchEvent(new Event("load")); expect(editor.repository.state.revision).toBe(revision);
  });

  it("updates cell payloads in two mounted projections without replacing unaffected spans", () => {
    const { editor, owner, flow } = mount("AB", direct);
    const second = editor.createView("second");
    const host = document.body.appendChild(document.createElement("div"));
    cleanup.push(render(() => <ReactiveTreeView editor={editor} projection={second} />, host));
    const other = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
    const a = flow.firstChild, otherA = other.firstChild;
    editor.commands.setPayloadField(owner.inlineContent[0], "text", "Z");
    expect(flow.textContent).toBe("ZB"); expect(other.textContent).toBe("ZB");
    expect(flow.firstChild).toBe(a); expect(other.firstChild).toBe(otherA);
    editor.repository.undo(); expect(flow.textContent).toBe("AB"); expect(other.textContent).toBe("AB");
  });

  it("keeps source-less image cells visible without adding authored text or fetching", () => {
    const { editor, projection, owner, flow } = mount("", direct);
    const placement = editor.commands.insertInlineImage(owner.key, 0, { assetId: "inert", src: "", alt: "", status: "failed" });
    const key = projection.nodeForPlacement(placement as string)!.key;
    const cell = flow.firstElementChild!;
    const image = cell.firstElementChild!;
    expect(cell.getAttribute('data-image-placeholder')).toBe('Image not loaded');
    expect(cell.getAttribute('aria-label')).toBe('Image not loaded');
    expect(image.hasAttribute('src')).toBe(false);
    expect(flow.textContent).toBe('');
    expect(editor.mounts.get(owner.key)!.captureText!()).toBe('');
    const commit = vi.spyOn(editor.repository, 'commit');
    image.dispatchEvent(new Event('error'));
    expect(commit).not.toHaveBeenCalled();
    editor.commands.updateInlineImage(key, { src: 'data:image/png;base64,', alt: 'available' });
    expect(flow.firstElementChild).toBe(cell);
    expect(cell.hasAttribute('data-image-placeholder')).toBe(false);
    expect(cell.getAttribute('aria-label')).toBe('available');
    editor.repository.undo();
    expect(cell.getAttribute('data-image-placeholder')).toBe('Image not loaded');
  });
});

it("does not allocate reactive computations per character in the default renderer", () => {
  const editor = new ReactiveEditor({ type: "document-block" });
  expect(editor.features.directDomCharacterCells).toBe(true); editor.dispose();
  const hooks = DEV!.hooks, previous = hooks.afterCreateOwner;
  let count = 0;
  hooks.afterCreateOwner = owner => { if ("fn" in owner) count++; previous?.(owner); };
  try {
    mount("x".repeat(10)); const small = count; count = 0;
    mount("x".repeat(1000)); expect(count).toBe(small);
  } finally { hooks.afterCreateOwner = previous; }
});

it("batches initial characters and consecutive inserted characters into single DOM insertions", () => {
  const flow = document.body.appendChild(document.createElement("div"));
  const cells = new DirectCharacterCells(flow);
  const observer = new MutationObserver(() => {});
  observer.observe(flow, { childList: true });
  cleanup.push(() => { observer.disconnect(); cells.dispose(); });
  const source = Array.from({ length: 1000 }, (_, index) => ({ key: String(index), index, text: "x" }));
  cells.update(source);
  let records = observer.takeRecords();
  expect(records).toHaveLength(1); expect(records[0].addedNodes).toHaveLength(1000);
  const first = flow.firstChild, last = flow.lastChild;
  cells.update([...source.slice(0, 500), ...[..."ABC"].map(text => ({ key: text, text })), ...source.slice(500)]);
  records = observer.takeRecords();
  expect(records).toHaveLength(1); expect(records[0].addedNodes).toHaveLength(3);
  expect(flow.firstChild).toBe(first); expect(flow.lastChild).toBe(last);
});

it("preserves in-progress IME text during annotation updates and normalizes it once on commit", async () => {
  const { editor, owner, flow } = mount("AB");
  flow.focus(); const a = flow.firstChild!, b = flow.lastChild!;
  flow.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  a.firstChild!.nodeValue = "A中文"; // Browser composition, not a canonical edit yet.
  document.getSelection()!.setBaseAndExtent(a.firstChild!, 3, a.firstChild!, 3);
  editor.commands.setPayloadField(owner.key, "standoffProperties", [{ type: "style/bold", start: 0, end: 0 }]);
  expect(flow.textContent).toBe("A中文B");
  expect(editor.encodeDocument().children![0].text).toBe("AB");
  expect(document.getSelection()!.anchorNode).toBe(a.firstChild);
  const revision = editor.repository.state.revision;
  flow.dispatchEvent(new CompositionEvent("compositionend", { data: "中文", bubbles: true }));
  await Promise.resolve();
  expect(editor.encodeDocument().children![0].text).toBe("A中文B");
  expect(flow.textContent).toBe("A中文B");
  expect([...flow.children].map(cell => cell.textContent)).toEqual(["A", "中", "文", "B"]);
  expect(flow.firstChild).toBe(a); expect(flow.lastChild).toBe(b);
  expect(editor.repository.state.revision).toBe(revision + 1);
  editor.repository.undo(); expect(flow.textContent).toBe("AB");
});
