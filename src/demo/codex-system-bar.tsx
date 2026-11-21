import {featureFlags} from '../configuration';
import {useCurrentCavern} from '../application/cavern-startup';
import {RetrievalControls} from '../application/retrieval-controls';
import type { WorkspaceWindowManager } from "../application/window-manager";
import { WindowList } from "../rendering/window-list";
import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import codexLogo from "../assets/codex-system-logo.png";
import "./codex-system-bar.css";
import { CavernControl } from "../application/cavern-startup";

type MenuName = "codex" | "workspace";
const itemSelector = '[role="menuitem"], [role="menuitemradio"]';
function menuItems(menu: HTMLElement) {
  return [...menu.querySelectorAll<HTMLElement>(itemSelector)].filter(item => item.closest('[role="menu"]') === menu && !(item as HTMLButtonElement).disabled && item.getAttribute("aria-disabled") !== "true");
}

/** Bounded submenu used by Workspace Presentations. No menu registry. */
export function SystemSubmenu(props: { label: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(false);
  let trigger!: HTMLButtonElement, menu!: HTMLDivElement;
  const show = () => { setOpen(true); queueMicrotask(() => menuItems(menu)[0]?.focus()); };
  const hide = () => { setOpen(false); trigger.focus(); };
  return <div class="codex-system-submenu">
    <button ref={trigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open()}
      onClick={() => open() ? hide() : show()} onKeyDown={event => {
        if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); show(); }
      }}>{props.label}<span aria-hidden="true">▸</span></button>
    <Show when={open()}><div ref={menu} role="menu" aria-label={props.label} onKeyDown={event => {
      if (event.key === "Escape" || event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); hide(); }
    }}>{props.children}</div></Show>
  </div>;
}

type BrowserBattery = {
  level: number;
  charging: boolean;
  addEventListener: (type: "levelchange" | "chargingchange", listener: EventListener) => void;
  removeEventListener: (type: "levelchange" | "chargingchange", listener: EventListener) => void;
};

type BatteryNavigator = Navigator & { getBattery?: () => Promise<BrowserBattery> };

export function formatSystemDateTime(date: Date, locales?: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locales, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function CodexSystemBar(props: { children: JSX.Element; manager?: WorkspaceWindowManager; workspaceLauncher?: (open: (() => void) | undefined) => void }) {
  const [open, setOpen] = createSignal<MenuName>();
  const cavern=useCurrentCavern();let launchRetrieval:(()=>void)|undefined;
  const [now, setNow] = createSignal(new Date());
  const [battery, setBattery] = createSignal<{ level: number; charging: boolean }>();
  let root!: HTMLElement;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let batteryManager: BrowserBattery | undefined;
  let mounted = true;

  const syncBattery = () => {
    if (!batteryManager || !mounted) return;
    setBattery({ level: Math.round(Math.max(0, Math.min(1, batteryManager.level)) * 100), charging: batteryManager.charging });
  };
  const close = (restore = false) => {
    const current = open();
    setOpen(undefined);
    if (restore && current) queueMicrotask(() => root.querySelector<HTMLButtonElement>(`[data-system-menu-trigger="${current}"]`)?.focus());
  };
  const toggle = (name: MenuName) => {
    const next = open() === name ? undefined : name;
    setOpen(next);
    if (next) queueMicrotask(() => { const menu = root.querySelector<HTMLElement>(`[data-system-menu="${next}"]`); if (menu) menuItems(menu)[0]?.focus(); });
  };
  onMount(() => {
    props.workspaceLauncher?.(() => { if (open() !== "workspace") toggle("workspace"); });
    onCleanup(() => props.workspaceLauncher?.(undefined));
  });
  const menuKeyDown = (event: KeyboardEvent) => {
    const menu = (event.target as Element).closest<HTMLElement>('[role="menu"]') ?? event.currentTarget as HTMLElement;
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab") { close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = menuItems(menu);
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length;
    items[index].focus();
  };
  const menuClick = (event: MouseEvent) => {
    const item = (event.target as Element).closest<HTMLElement>(itemSelector);
    if (!item || item.getAttribute("aria-disabled") === "true" || (item as HTMLButtonElement).disabled) return;
    if (item.getAttribute("aria-haspopup") === "menu") return;
    close();
  };

  onMount(() => {
    mounted = true;
    clockTimer = setInterval(() => setNow(new Date()), 30_000);
    const outside = (event: PointerEvent) => { if (open() && !root.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside, true);
    const getBattery = (navigator as BatteryNavigator).getBattery;
    if (typeof getBattery === "function") void getBattery.call(navigator).then(manager => {
      if (!mounted) return;
      batteryManager = manager;
      syncBattery();
      manager.addEventListener("levelchange", syncBattery);
      manager.addEventListener("chargingchange", syncBattery);
    }).catch(() => undefined);
    onCleanup(() => document.removeEventListener("pointerdown", outside, true));
  });
  onCleanup(() => {
    mounted = false;
    if (clockTimer) clearInterval(clockTimer);
    batteryManager?.removeEventListener("levelchange", syncBattery);
    batteryManager?.removeEventListener("chargingchange", syncBattery);
  });

  return <nav ref={root} class="codex-system-bar" aria-label="Codex system">
    <div class="codex-system-bar__menus">
      <button type="button" class="codex-system-bar__logo" data-system-menu-trigger="codex" aria-label="Codex menu" aria-haspopup="menu" aria-expanded={open() === "codex"} onClick={() => toggle("codex")}>
        <img src={codexLogo} alt="" />
      </button>
      <button type="button" class="codex-system-bar__trigger" data-system-menu-trigger="workspace" aria-haspopup="menu" aria-expanded={open() === "workspace"} onClick={() => toggle("workspace")}>Workspace</button>
      <CavernControl />
    </div>

    <div class="codex-system-bar__status">
      <button type="button" class="codex-system-bar__search" aria-label="Codex search (coming soon)" title="Codex-wide search is not available yet" disabled>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.25" /><path d="m10.2 10.2 3.1 3.1" /></svg>
      </button>
      <Show when={battery()}>{state => <span class="codex-system-bar__battery-status" role="status" aria-label={`Battery ${state().level}%${state().charging ? ", charging" : ""}`} title={`Battery ${state().level}%${state().charging ? " · charging" : ""}`}>
        <span class="codex-system-bar__battery"><span style={{ width: `${state().level}%` }} /></span>
        <Show when={state().charging}><span aria-hidden="true">⚡</span></Show>
      </span>}</Show>
      <time dateTime={now().toISOString()}>{formatSystemDateTime(now())}</time>
    </div>

    <Show when={open() === "codex"}>
      <div class="codex-system-menu codex-system-menu--codex" data-system-menu="codex" role="menu" aria-label="Codex" onKeyDown={menuKeyDown} onClick={menuClick}>
        <button type="button" role="menuitem" aria-disabled="true">About this Codex</button>
        <button type="button" role="menuitem" aria-disabled="true">System Settings</button>
        <hr role="separator" />
        <button type="button" role="menuitem" aria-disabled="true">Lock Screen</button>
        <hr role="separator" />
        <button type="button" role="menuitem" aria-disabled="true">Quit</button>
      </div>
    </Show>
    <Show when={open() === "workspace"}>
      <div class="codex-system-menu codex-system-menu--workspace" data-system-menu="workspace" role="menu" aria-label="Workspace" onKeyDown={menuKeyDown} onClick={menuClick}>{props.children}<Show when={featureFlags.semanticRetrieval&&cavern}><button role="menuitem" onClick={()=>launchRetrieval?.()}>Index Cavern…</button></Show><Show when={props.manager}>{manager=><WindowList manager={manager()} />}</Show></div>
    </Show>
    <RetrievalControls launcher={open=>{launchRetrieval=open;}}/>
  </nav>;
}
