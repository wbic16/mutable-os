// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceDemo } from "./workspace-demo";
import { backgroundImages } from "../rendering/backgrounds";
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function click(label: string, selector = "button") {
  const button = [...document.querySelectorAll<HTMLButtonElement>(selector)].find(button => button.textContent?.replace(/[›‹]/g, "").trim() === label);
  if (!button) throw new Error(`Missing button ${label}`); button.click();
}
it("keeps the document, caret and file actions across background changes and document-session reset", async () => {
  const host = document.body.appendChild(document.createElement("div")); cleanup.push(render(() => <WorkspaceDemo configuration={{ features: { codexSystemBar: false } }} />, host));
  const flow = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
  const original = flow.textContent;
  flow.focus();
  const range = document.createRange(); range.selectNodeContents(flow.querySelector('[data-inline-key]:nth-child(3)')!); const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  const selectionText = selection.toString();
  click("Background…"); await tick(); click("Background", ".reactive-block-menu button"); click("Image", ".reactive-block-menu button"); click("Desktop", ".reactive-block-menu button"); await tick();
  expect(host.querySelector("[contenteditable=true]")).toBe(flow); expect(flow.textContent).toBe(original); expect(document.activeElement).toBe(flow); expect(selection.toString()).toBe(selectionText);
  expect(host.querySelector(".workspace-stage__background img")?.getAttribute("src")).toBe(backgroundImages[1].url); expect(host.querySelector("[data-save-state]")?.getAttribute("data-save-state")).toBe("saved");
  click("Background…"); await tick(); click("Undo", ".reactive-block-menu button"); await tick(); expect(host.querySelector(".workspace-stage__background img")?.getAttribute("src")).toBe(backgroundImages[0].url);
  click("Background…"); await tick(); click("Redo", ".reactive-block-menu button"); await tick(); click("Reset demo"); await tick(); expect(host.querySelector(".workspace-stage__background img")?.getAttribute("src")).toBe(backgroundImages[1].url);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ Success: true, Data: { folders: [], files: [] } }) } as Response);
  click("Background…"); await tick(); click("Document", ".reactive-block-menu button"); expect([...document.querySelectorAll<HTMLButtonElement>(".reactive-block-menu button")].find(button => button.textContent?.trim() === "Open…")?.disabled).toBe(false); click("Open…", ".reactive-block-menu button"); await tick();
  expect(document.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull(); expect(fetchMock).toHaveBeenCalled();
});
