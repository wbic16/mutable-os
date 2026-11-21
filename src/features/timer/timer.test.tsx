// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { ExistingBlockDto } from "../../block-tree/types";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { blockMenuItems } from "../../runtime/block-menu-actions";
import { timerBlockDto } from "./model";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { registerApplicationViews } from "../../application/features";

const cleanup: Array<() => void> = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T12:00:00Z")); });
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function setup(children: ExistingBlockDto[]) {
  const editor = new ReactiveEditor({ id: "document", type: "document-block", children });
  registerApplicationViews(editor); const projection = editor.createView("timer-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(item => item.payload.id === id)!;
  const timers = () => Object.values(projection.state.nodes).filter(item => item.viewType === "timer-block");
  const timerElement = (key: string) => document.querySelector<HTMLElement>(`[data-client-id="${key}"].reactive-timer`)!;
  const trigger = (target: Element) => {
    const prefix = new KeyboardEvent("keydown", { key: ";", ctrlKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(prefix);
    const finish = new KeyboardEvent("keydown", { key: "t", bubbles: true, cancelable: true }); target.dispatchEvent(finish);
    return { prefix, finish };
  };
  return { editor, projection, host, node, timers, timerElement, trigger };
}

describe("TimerBlock", () => {
  it("uses Ctrl+; then T, floats beside focused text without replacing it and appears in Add Block", async () => {
    const { editor, node, timers, timerElement, trigger } = setup([
      { id: "full", type: "standoff-editor-block", text: "Keep this" },
      { id: "empty", type: "standoff-editor-block", text: "" },
    ]);
    editor.crossText.enable(true);
    const full = editor.mounts.get(node("full").key)!.focusElement; full.focus();
    editor.mounts.get(node("full").key)!.root.getBoundingClientRect = () => ({ left: 400, top: 90, right: 700, bottom: 130, width: 300, height: 40, x: 400, y: 90, toJSON: () => ({}) });
    const first = trigger(full); expect(first.prefix.defaultPrevented).toBe(true); expect(first.finish.defaultPrevented).toBe(true); await tick();
    expect(editor.encodeDocument().children?.map(item => item.type)).toEqual(["standoff-editor-block", "timer-block", "standoff-editor-block"]);
    const created = timers()[0];
    expect(timerElement(created.key).querySelector(".reactive-timer__display")?.textContent).toBe("05:00");
    expect(timerElement(created.key).style.cssText).toContain("width: 130px");
    expect(timerElement(created.key).style.cssText).toContain("left: 270px");
    expect(created.payload.blockProperties).toContainEqual(expect.objectContaining({ type: "block/position", metadata: expect.objectContaining({ x: 270, y: 90, position: "fixed" }) }));
    editor.repository.undo(); expect(timers()).toHaveLength(0);

    const empty = editor.mounts.get(node("empty").key)!.focusElement; empty.focus(); trigger(empty); await tick();
    expect(editor.encodeDocument().children?.map(item => item.id)).toEqual(["full", "empty", expect.any(String)]);
    expect(editor.encodeDocument().children?.[2].type).toBe("timer-block");
    editor.repository.undo();
    const add = blockMenuItems(editor, node("full").key).find(item => item.label === "Add Block")!;
    add.children!.find(item => item.label === "Timer")!.run!(); await tick();
    expect(timers()).toHaveLength(1);
    timerElement(timers()[0].key).querySelector<HTMLButtonElement>('[aria-label="Close timer"]')!.click(); await tick();
    expect(timers()).toHaveLength(0);
    editor.repository.undo(); await tick(); expect(timers()).toHaveLength(1);
  });

  it("ticks locally, persists only controls, pauses, changes duration and removes itself when done", async () => {
    const sounded = vi.fn();
    vi.stubGlobal("AudioContext", class {
      currentTime = 0; destination = {};
      resume = vi.fn(); close = vi.fn();
      createOscillator() { return { type: "sine", frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: sounded, stop: vi.fn() }; }
      createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }; }
    });
    const timer = timerBlockDto(); timer.id = "timer";
    const { editor, node, timerElement } = setup([timer]);
    const window = () => timerElement(node("timer").key);
    const display = () => window().querySelector<HTMLOutputElement>(".reactive-timer__display")!;
    expect(display().textContent).toBe("05:00");
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const afterStart = editor.repository.state.revision;
    expect(node("timer").payload.timer).toMatchObject({ durationSeconds: 300, mode: "running", runningUntil: Date.now() + 300000 });
    await vi.advanceTimersByTimeAsync(1000); expect(display().textContent).toBe("04:59"); expect(editor.repository.state.revision).toBe(afterStart);

    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Pause")!.click();
    expect(node("timer").payload.timer).toMatchObject({ mode: "paused", remainingMilliseconds: 299000 });
    const pausedRevision = editor.repository.state.revision;
    await vi.advanceTimersByTimeAsync(10000); expect(display().textContent).toBe("04:59"); expect(editor.repository.state.revision).toBe(pausedRevision);

    const input = window().querySelector<HTMLInputElement>('[aria-label="Timer duration in minutes and seconds"]')!;
    input.value = "00:02"; input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Set")!.click();
    expect(display().textContent).toBe("00:02"); expect(node("timer").payload.timer).toMatchObject({ durationSeconds: 2, mode: "idle" });
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const runningRevision = editor.repository.state.revision;
    await vi.advanceTimersByTimeAsync(2000); expect(display().textContent).toBe("00:00"); expect(window().textContent).toContain("Time’s up");
    expect(editor.repository.state.revision).toBe(runningRevision); expect(sounded).toHaveBeenCalledTimes(1);
    expect(editor.encodeDocument().children?.[0].timer).toMatchObject({ mode: "running", runningUntil: Date.now() });
    await vi.advanceTimersByTimeAsync(5000); expect(sounded).toHaveBeenCalledTimes(1);

    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Done")!.click(); await tick();
    expect(editor.encodeDocument().children).toEqual([]);
    editor.repository.undo(); await tick(); expect(window().textContent).toContain("Time’s up");
  });

  it("reconstructs remaining time after reload and commits move/resize only when each gesture ends", async () => {
    const timer = timerBlockDto(); timer.id = "timer";
    const { editor, node, timerElement } = setup([timer]);
    const window = () => timerElement(node("timer").key);
    [...window().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    const saved = editor.encodeDocument(); await vi.advanceTimersByTimeAsync(60000);
    const loaded = setup(saved.children!); await tick();
    expect(loaded.timerElement(loaded.node("timer").key).querySelector(".reactive-timer__display")?.textContent).toBe("04:00");

    const handle = window().querySelector<HTMLElement>(".reactive-timer__resize")!; handle.setPointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => handle.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    const revision = editor.repository.state.revision;
    pointer("pointerdown", 0, 0); pointer("pointermove", 40, 20);
    expect(editor.repository.state.revision).toBe(revision); expect(window().style.width).toBe("170px");
    pointer("pointerup", 40, 20);
    expect(editor.repository.state.revision).toBe(revision + 1);
    expect(node("timer").payload.blockProperties).toContainEqual(expect.objectContaining({ type: "block/size", metadata: expect.objectContaining({ width: 170, height: 150 }) }));

    const header = window().querySelector<HTMLElement>(".reactive-timer__header")!; header.setPointerCapture = vi.fn();
    const drag = (type: string, x: number, y: number) => header.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    const moveRevision = editor.repository.state.revision;
    drag("pointerdown", 20, 20); drag("pointermove", 50, 70);
    expect(editor.repository.state.revision).toBe(moveRevision); expect(window().style.left).toBe("54px"); expect(window().style.top).toBe("130px");
    drag("pointerup", 50, 70); expect(editor.repository.state.revision).toBe(moveRevision + 1);
    expect(node("timer").payload.blockProperties).toContainEqual(expect.objectContaining({ type: "block/position", metadata: expect.objectContaining({ x: 54, y: 130, position: "fixed" }) }));
  });
});

// Module boundaries use the real core. No implementation imports outside this directory.
describe("Timer feature activation and disposal", () => {
  it("runs three independent Block applications and releases only the unmounted instance", async () => {
    const audioCloses: ReturnType<typeof vi.fn>[] = [];
    vi.stubGlobal("AudioContext", class {
      resume = vi.fn();
      close = vi.fn();
      constructor() { audioCloses.push(this.close); }
    });
    const dtos = ["a", "b", "c"].map(id => ({ ...timerBlockDto(), id }));
    const { editor, node, timerElement } = setup(dtos);
    const keys = dtos.map(dto => node(dto.id).key);
    for (const key of keys) [...timerElement(key).querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start")!.click();
    await tick();
    const revision = editor.repository.state.revision;
    expect(vi.getTimerCount()).toBe(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(editor.repository.state.revision).toBe(revision);
    keys.forEach(key => expect(timerElement(key).querySelector("output")?.textContent).toBe("04:59"));
    editor.commands.remove(keys[0]); await tick();
    expect(timerElement(keys[0])).toBeNull(); expect(editor.mounts.get(keys[0])).toBeUndefined();
    expect(vi.getTimerCount()).toBe(2);
    expect(audioCloses.map(close => close.mock.calls.length)).toEqual([1, 0, 0]);
    await vi.advanceTimersByTimeAsync(1000);
    keys.slice(1).forEach(key => expect(timerElement(key).querySelector("output")?.textContent).toBe("04:58"));
    const saved = editor.encodeDocument();
    expect(saved.children).toHaveLength(2);
    saved.children!.forEach(dto => expect(dto.timer).toEqual({ durationSeconds: 300, mode: "running", runningUntil: Date.now() + 298000 }));
    editor.dispose(); await tick();
    expect(vi.getTimerCount()).toBe(0);
    expect(audioCloses.map(close => close.mock.calls.length)).toEqual([1, 1, 1]);
    keys.slice(1).forEach(key => expect(editor.mounts.get(key)?.root.classList.contains("reactive-timer")).not.toBe(true));
  });

  it("owns all registrations and releases mounted resources on repeated editor teardown", async () => {
    for (let round = 0; round < 3; round++) {
      const dto = timerBlockDto(); dto.id = "running";
      dto.timer = { durationSeconds: 300, mode: "running", runningUntil: Date.now() + 300000 };
      const { editor, node, timerElement } = setup([dto]);
      const key = node("running").key;
      expect(editor.featureHost.list()).toContain("timer");
      expect(editor.registry.owner("timer-block")).toBe("timer");
      expect(editor.commandRegistry.owner("timer.create")).toBe("timer");
      expect(editor.bindings.owner("timer.create")).toBe("timer");
      expect(editor.bindings.owner("cross.timerCreate")).toBe("timer");
      expect(editor.featureActions.list("document-actions").find(action=>action.id==="timer.toolbar")?.owner).toBe("timer");
      expect(timerElement(key)).toBeTruthy();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      const revision = editor.repository.state.revision;
      editor.dispose(); await tick();
      expect(editor.featureHost.list()).toEqual([]);
      expect(editor.registry.resolve("timer-block")).toBeUndefined();
      expect(editor.commandRegistry.list().some(command => command.id.startsWith("timer."))).toBe(false);
      expect(editor.bindings.get("timer.create")).toBeUndefined();
      expect(editor.bindings.get("cross.timerCreate")).toBeUndefined();
      expect(editor.mounts.get(key)?.root.classList.contains("reactive-timer")).not.toBe(true);
      expect(editor.featureActions.list("document-actions")).toEqual([]);
      expect(editor.featureActions.list("add-block-menu")).toEqual([]);
      expect(timerElement(key)).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(600000);
      expect(editor.repository.state.revision).toBe(revision);
    }
  });

  it("keeps authored data intact with the module enabled and disabled", async () => {
    const { unknownFeatureDocument } = await import("../../block-tree/test-support/unknown-feature-document");
    const { encodeDocument } = await import("../../block-tree/codecs");
    for (const enabled of [true, false]) {
      const editor = new ReactiveEditor(structuredClone(unknownFeatureDocument), { features: { timer: enabled } });
      registerApplicationViews(editor);
      const projection = editor.createView(), host = document.body.appendChild(document.createElement("div"));
      const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
      try {
        expect(!!editor.registry.resolve("timer-block")).toBe(enabled);
        expect(encodeDocument(editor.repository.readState())).toEqual(unknownFeatureDocument);
        expect(!!document.querySelector(".reactive-timer")).toBe(enabled);
        expect(editor.featureActions.list("document-actions").filter(action=>action.owner==="timer")).toHaveLength(enabled ? 1 : 0);
      } finally { dispose(); editor.dispose(); host.remove(); }
    }
  });
});

it('keeps submitted timer operations local, protects settings and clears operational state on remount',async()=>{
 const dto={...timerBlockDto(undefined,2),id:'protected-timer'},f=setup([dto]),n=f.node(dto.id),e=f.editor;
 const release=e.textProtection.protect(n.contentKey);await tick();
 const root=()=>f.timerElement(n.key),button=(name:string)=>[...root().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===name)!;
 const before=e.encodeDocument(),revision=e.repository.state.revision,snapshot=vi.spyOn(e.repository,'snapshot');
 expect(root().querySelector<HTMLInputElement>('input')!.disabled).toBe(true);expect(root().querySelector<HTMLButtonElement>('[aria-label="Close timer"]')!.disabled).toBe(true);expect(root().querySelector('.reactive-timer__resize')).toBeNull();
 const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});button('Start').dispatchEvent(enter);expect(enter.defaultPrevented).toBe(false);
 button('Start').click();const unrelated=e.textProtection.register(()=>false);await tick();expect(button('Pause')).toBeTruthy();unrelated();await vi.advanceTimersByTimeAsync(1000);expect(root().querySelector('output')!.textContent).toBe('00:01');button('Pause').click();await vi.advanceTimersByTimeAsync(3000);expect(root().querySelector('output')!.textContent).toBe('00:01');button('Resume').click();await vi.advanceTimersByTimeAsync(1000);expect(root().textContent).toContain('Time’s up');button('Reset').click();expect(root().querySelector('output')!.textContent).toBe('00:02');
 expect(e.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();expect(e.encodeDocument()).toEqual(before);
 expect(()=>e.commands.setPayloadField(n.key,'timer',{durationSeconds:9,mode:'idle'})).toThrow(/protected/);
 button('Start').click();const loaded=setup(before.children!);expect(loaded.timerElement(loaded.node(dto.id).key).querySelector('output')!.textContent).toBe('00:02');
 release();await tick();expect(root().querySelector<HTMLInputElement>('input')!.disabled).toBe(false);expect(root().querySelector('output')!.textContent).toBe('00:02');
});
