import { For, Show } from "solid-js";
import type { WorkspaceSession } from "../application/workspace-session";
import { SystemSubmenu } from "./codex-system-bar";

export function WorkspacePresentations(props: { session: WorkspaceSession; menu?: boolean; busy?: boolean }) {
  const choose = (name: "desktop" | "canvas" | "spatial" | "textual") => props.session.editor.commandRegistry.execute(`workspace.presentation.${name}`, { targetKey: props.session.projection.state.rootKey, args: undefined });
  const names = () => (["desktop", "canvas", "spatial", "textual"] as const).filter(name => props.session.presentation.available(name));
  const label = (name: "desktop" | "canvas" | "spatial" | "textual") => name === "desktop" ? "Desktop" : name === "canvas" ? "Canvas" : name === "textual" ? "Textual" : props.session.presentation.read()?.presentations.spatial === undefined ? "Create Spatial" : "Spatial";
  const missingDesktop = () => props.session.canCreateDesktop();
  const createDesktop = () => props.session.editor.commandRegistry.execute("workspace.presentation.createDesktop", { targetKey: props.session.projection.state.rootKey, args: undefined });
  const disabled = () => props.busy || !props.session.presentation.editable();
  return props.menu ? <SystemSubmenu label="Presentations"><For each={names()}>{name =>
    <button type="button" role="menuitemradio" aria-checked={props.session.presentation.active() === name} disabled={disabled() || name === "desktop" && missingDesktop()} onClick={() => choose(name)}>{label(name)}<span aria-hidden="true">{props.session.presentation.active() === name ? "✓" : ""}</span></button>
  }</For><Show when={missingDesktop()}><button type="button" role="menuitem" disabled={disabled()} onClick={createDesktop}>Create Desktop from Canvas</button></Show></SystemSubmenu> : <span class="workspace-presentations" role="group" aria-label="Presentations"><For each={names()}>{name =>
    <button type="button" aria-pressed={props.session.presentation.active() === name} disabled={disabled() || name === "desktop" && missingDesktop()} onClick={() => choose(name)}>{label(name)}</button>
  }</For><Show when={missingDesktop()}><button type="button" disabled={disabled()} onClick={createDesktop}>Create Desktop from Canvas</button></Show></span>;
}
