import { afterEach, expect, it } from "vitest";
import { MountRegistry } from "../runtime/mounts";
import { ownSelectionToolbar, selectionInputTarget } from "./selection-target";
afterEach(() => document.body.replaceChildren());
it("scopes standalone toolbars and cross-input proxies to the correct editor", () => {
  const first = new MountRegistry(), second = new MountRegistry();
  const toolbar = document.body.appendChild(document.createElement("nav")); toolbar.className = "document-style-bar";
  const release = ownSelectionToolbar(toolbar, first);
  const event = new Event("keydown", { bubbles: true }); toolbar.dispatchEvent(event);
  expect(selectionInputTarget(event, first, () => undefined).toolbar).toBe(true);
  expect(selectionInputTarget(event, second, () => undefined).toolbar).toBe(false);
  release(); expect(selectionInputTarget(event, first, () => undefined).toolbar).toBe(false);
  const input = document.body.appendChild(document.createElement("textarea")); input.dataset.crossTextInput = "true";
  const proxyEvent = new Event("keydown"); input.dispatchEvent(proxyEvent);
  expect(selectionInputTarget(proxyEvent, first, target => target === input ? "owned" : undefined).key).toBe("owned");
  expect(selectionInputTarget(proxyEvent, second, () => undefined).key).toBeUndefined();
});
it.each(['input', 'textarea', 'select', 'div[role="dialog"]', 'div[role="menu"]'])("excludes %s even inside an owned toolbar", selector => {
  const mounts = new MountRegistry(), toolbar = document.body.appendChild(document.createElement("nav")); toolbar.className = "document-style-bar";
  ownSelectionToolbar(toolbar, mounts);
  const element = document.createElement(selector.split('[')[0]);
  if (selector.includes('role=')) element.setAttribute("role", selector.includes('dialog') ? 'dialog' : 'menu');
  toolbar.append(element); const event = new Event("keydown", { bubbles: true }); element.dispatchEvent(event);
  expect(selectionInputTarget(event, mounts, () => undefined)).toEqual({ excluded: true });
});

it('recognises an explicitly owned presentation toolbar without classifying its sibling editor as a toolbar',()=>{
 const mounts=new MountRegistry(),root=document.body.appendChild(document.createElement('div')),toolbar=root.appendChild(document.createElement('nav')),text=root.appendChild(document.createElement('div'));
 toolbar.dataset.selectionToolbar='';const release=ownSelectionToolbar(toolbar,mounts);
 const event=new Event('pointerdown',{bubbles:true});toolbar.dispatchEvent(event);expect(selectionInputTarget(event,mounts,()=>undefined).toolbar).toBe(true);
 const native=new Event('pointerdown',{bubbles:true});text.dispatchEvent(native);expect(selectionInputTarget(native,mounts,()=>undefined).toolbar).toBe(false);release();
});
