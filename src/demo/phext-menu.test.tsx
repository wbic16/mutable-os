// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceDemo } from "./workspace-demo";

const disposers: Array<() => void> = [];
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.replaceChildren();
});

function mount(phextDocuments = true) {
  const host = document.body.appendChild(document.createElement("div"));
  disposers.push(
    render(
      () => (
        <WorkspaceDemo
          configuration={{ features: { codexSystemBar: false, phextDocuments } }}
        />
      ),
      host,
    ),
  );
  return host;
}

function button(label: string, root: ParentNode): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label,
  );
}

describe("phext Workspace menu entries", () => {
  it("offers Open Phext… and Export Phext… in the Local files group by default", () => {
    const host = mount();
    const local = host.querySelector('[aria-label="Local files"]')!;
    expect(local).not.toBeNull();
    expect(button("Open Phext…", local)).not.toBeUndefined();
    expect(button("Export Phext…", local)).not.toBeUndefined();
  });

  it("hides both entries when the phextDocuments flag is off", () => {
    const host = mount(false);
    const local = host.querySelector('[aria-label="Local files"]')!;
    expect(button("Open Phext…", local)).toBeUndefined();
    expect(button("Export Phext…", local)).toBeUndefined();
  });
});
