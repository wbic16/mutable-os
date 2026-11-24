import { createSignal, type Signal } from "solid-js";

export type Modifier = "Ctrl" | "Meta" | "Alt" | "Shift";
export type KeyboardTrigger = { kind: "keyboard"; key: string; modifiers: Modifier[] };
export type Trigger =
  | KeyboardTrigger
  | { kind: "chord"; steps: KeyboardTrigger[] }
  | { kind: "mouse"; button: number; gesture: "click" | "dblclick" | "contextmenu"; modifiers: Modifier[] }
  | { kind: "custom"; name: string };
export interface BindingContext { event?: Event; payload?: unknown; run(id: string): boolean | void }
export interface BindingAction {
  id: string; name: string; description: string; category: string; tags: string[];
  scope: string; defaults: Trigger[]; handler(context: BindingContext): boolean | void;
}
export const CUSTOM_INPUTS = ["inspect-annotation", "save-document", "toggle-bindings"] as const;
export const STORAGE_KEY = "speedy.input-bindings.v1";
const modifiers: Modifier[] = ["Ctrl", "Meta", "Alt", "Shift"];
export const keyboard = (key: string, ...mods: Modifier[]): KeyboardTrigger => ({ kind: "keyboard", key, modifiers: mods });
export const chord = (...steps: KeyboardTrigger[]): Trigger => ({ kind: "chord", steps });
export const mouse = (button: number, gesture: "click" | "dblclick" | "contextmenu", ...mods: Modifier[]): Extract<Trigger, { kind: "mouse" }> => ({ kind: "mouse", button, gesture, modifiers: mods });
export function captureTrigger(event: KeyboardEvent | MouseEvent): Exclude<Trigger, { kind: "chord" }> {
  const mods = modifiers.filter((_, i) => [event.ctrlKey, event.metaKey, event.altKey, event.shiftKey][i]);
  return event instanceof KeyboardEvent ? keyboard(event.key, ...mods) : mouse(event.button, event.type === "contextmenu" ? "contextmenu" : event.type === "dblclick" ? "dblclick" : "click", ...mods);
}
const normalKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
export function triggerKey(trigger: Trigger): string {
  if (trigger.kind === "chord") return `chord:${trigger.steps.map(triggerKey).join(">")}`;
  if (trigger.kind === "custom") return `custom:${trigger.name}`;
  const mods = modifiers.filter(mod => trigger.modifiers.includes(mod)).join("+");
  return trigger.kind === "keyboard" ? `key:${mods}:${normalKey(trigger.key)}` : `mouse:${mods}:${trigger.gesture}:${trigger.button}`;
}
export function triggerLabel(trigger: Trigger): string {
  if (trigger.kind === "chord") return trigger.steps.map(triggerLabel).join(", then ");
  if (trigger.kind === "custom") return `Event: ${trigger.name}`;
  const mods = modifiers.filter(mod => trigger.modifiers.includes(mod));
  const keys: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", " ": "Space", Meta: "Cmd" };
  const label = trigger.kind === "keyboard" ? keys[trigger.key] ?? trigger.key : `${["Primary", "Middle", "Secondary"][trigger.button] ?? `Button ${trigger.button}`} ${trigger.gesture}`;
  return [...mods.map(mod => mod === "Meta" ? "Cmd" : mod === "Alt" ? "Alt/Option" : mod), label].join("+");
}
export function scopesOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/") || a === "workspace" || b === "workspace";
}
function validateTrigger(input: unknown): Trigger {
  if (!input || typeof input !== "object") throw new Error("Invalid trigger");
  const t = input as Record<string, unknown>;
  if (t.kind === "custom") {
    if (!CUSTOM_INPUTS.includes(t.name as any)) throw new Error("Unknown custom input event");
    return { kind: "custom", name: String(t.name) };
  }
  if (t.kind === "chord") {
    if (!Array.isArray(t.steps) || t.steps.length < 2 || t.steps.length > 4) throw new Error("A chord requires two to four keyboard strokes");
    const steps = t.steps.map(step => validateTrigger(step));
    if (steps.some(step => step.kind !== "keyboard")) throw new Error("Chord steps must be keyboard strokes");
    return chord(...steps as KeyboardTrigger[]);
  }
  if (!Array.isArray(t.modifiers) || t.modifiers.some(m => !modifiers.includes(m)) || new Set(t.modifiers).size !== t.modifiers.length) throw new Error("Invalid modifiers");
  const mods = t.modifiers as Modifier[];
  if (t.kind === "keyboard" && typeof t.key === "string" && t.key.length > 0 && t.key.length <= 40 && !["Control", "Meta", "Alt", "Shift", "Dead", "Unidentified", "Process"].includes(t.key)) return keyboard(t.key, ...mods);
  if (t.kind === "mouse" && Number.isInteger(t.button) && Number(t.button) >= 0 && Number(t.button) <= 4 && ["click", "dblclick", "contextmenu"].includes(String(t.gesture))) return mouse(Number(t.button), t.gesture as any, ...mods);
  throw new Error("Invalid key or mouse trigger");
}

/** Data-only preferences; handlers always come from application registration. */
export class BindingRegistry {
  private actions = new Map<string, BindingAction>();
  private owners = new Map<string, string>();
  private overrides: Record<string, Trigger[]> = Object.create(null);
  private index = new Map<string, BindingAction[]>();
  private chordStarts = new Map<string, Array<{ action: BindingAction; trigger: Extract<Trigger, { kind: "chord" }> }>>();
  private pending?: { candidates: Array<{ action: BindingAction; trigger: Extract<Trigger, { kind: "chord" }> }>; step: number };
  private chordTimer?: ReturnType<typeof setTimeout>;
  private revision = createSignal(0);
  private labels = new Map<string, Signal<string>>();
  private problem = createSignal("");
  private chordStatus = createSignal("");
  private paused = 0;
  private storage?: Storage;
  private sync = () => this.restoreStorage();
  constructor(storage?: Storage) {
    try { this.storage = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined); this.restoreStorage(); }
    catch { this.problem[1]("Binding preferences are session-only: browser storage is unavailable."); }
    if (typeof window !== "undefined") { window.addEventListener("speedy-bindings-changed", this.sync); window.addEventListener("storage", this.sync); }
  }
  dispose() { this.cancelChord(); if (typeof window !== "undefined") { window.removeEventListener("speedy-bindings-changed", this.sync); window.removeEventListener("storage", this.sync); } }
  warning = () => this.problem[0]();
  pendingHint = () => this.chordStatus[0]();
  list = () => { this.revision[0](); return [...this.actions.values()]; };
  get(id: string) { return this.actions.get(id); }
  owner(id: string): string | undefined { return this.owners.get(id); }
  register(action: BindingAction, owner = "legacy") {
    if (this.actions.has(action.id)) throw new Error(`Duplicate binding action ${action.id} owned by ${this.owner(action.id)}; cannot register for ${owner}`);
    this.actions.set(action.id, action); this.owners.set(action.id, owner); this.rebuild();
    let active = true;
    return () => { if (!active) return; active = false; this.actions.delete(action.id); this.owners.delete(action.id); this.rebuild(); };
  }
  effective(id: string): Trigger[] { this.revision[0](); return this.overrides[id] ?? this.actions.get(id)?.defaults ?? []; }
  private labelValue(id: string) { return (this.overrides[id] ?? this.actions.get(id)?.defaults ?? []).map(triggerLabel).join(" / ") || "Unassigned"; }
  label(id: string) {
    // Occurrence-scoped completion leases must not refresh every Block handle.
    // Share the derivation and notify only when this action's visible label changes.
    let label = this.labels.get(id);
    if (!label) { label = createSignal(this.labelValue(id)); this.labels.set(id, label); }
    return label[0]();
  }
  modified(id: string) { this.revision[0](); return Object.hasOwn(this.overrides, id); }
  suspend() { this.cancelChord(); this.paused++; return () => { this.paused = Math.max(0, this.paused - 1); }; }
  matches(id: string, event: KeyboardEvent | MouseEvent) { return !this.paused && this.effective(id).some(t => t.kind !== "chord" && triggerKey(t) === triggerKey(captureTrigger(event))); }
  /** Complete host reservations only. Prefixes/continuations remain with one native dispatch. */
  dispatchReserved(event: KeyboardEvent, scopes: string[], run: BindingContext["run"], eligible: (action: BindingAction) => boolean): boolean {
    if (this.paused || event.defaultPrevented || event.isComposing || this.pending) return false;
    const trigger = captureTrigger(event);
    if (this.chordStarts.has(triggerKey(trigger))) return false;
    return this.invoke(trigger, scopes, {event, run}, eligible);
  }
  hasPendingChord(): boolean { return !!this.pending; }
  dispatch(event: KeyboardEvent | MouseEvent, scopes: string[], run: BindingContext["run"], eligible?: (action: BindingAction) => boolean): boolean {
    if (this.paused || event.defaultPrevented) return false;
    if (event instanceof KeyboardEvent && event.isComposing) { this.cancelChord(); return false; }
    if (event instanceof KeyboardEvent) {
      if (eligible && this.pending && !this.pending.candidates.some(c => scopes.includes(c.action.scope) && eligible(c.action))) this.cancelChord();
      if (this.pending && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.cancelChord(); return true; }
      const stroke = captureTrigger(event);
      if (stroke.kind === "keyboard" && this.pending) {
        const relevant = this.pending.candidates.filter(candidate => scopes.includes(candidate.action.scope) && (!eligible || eligible(candidate.action)));
        if (!relevant.length && eligible) this.cancelChord();
        if (relevant.length) {
          if (event.repeat) { event.preventDefault(); event.stopPropagation(); return true; }
          const candidates = relevant.filter(candidate => triggerKey(candidate.trigger.steps[this.pending!.step]) === triggerKey(stroke));
          if (candidates.length) {
            const step = this.pending.step + 1, complete = candidates.find(candidate => candidate.trigger.steps.length === step);
            if (complete) { this.cancelChord(); return this.invokeAction(complete.action, { event, run }); }
            const continuing = candidates.filter(candidate => candidate.trigger.steps.length > step);
            if (continuing.length) { this.pending = { candidates: continuing, step }; this.armChord(); this.updateChordHint(); event.preventDefault(); event.stopPropagation(); return true; }
          }
          this.cancelChord();
        }
      }
      if (stroke.kind === "keyboard") {
        const starts = (this.chordStarts.get(triggerKey(stroke)) ?? []).filter(candidate => scopes.includes(candidate.action.scope) && (!eligible || eligible(candidate.action)));
        if (starts.length) {
          if (event.repeat) { event.preventDefault(); event.stopPropagation(); return true; }
          this.pending = { candidates: starts, step: 1 }; this.armChord(); this.updateChordHint(); event.preventDefault(); event.stopPropagation(); return true;
        }
      }
    } else if (this.pending) this.cancelChord();
    return this.invoke(captureTrigger(event), scopes, { event, run }, eligible);
  }
  dispatchCustom(name: string, scopes: string[], run: BindingContext["run"], payload?: unknown) {
    this.cancelChord();
    return this.invoke({ kind: "custom", name }, scopes, { payload, run });
  }
  private invoke(trigger: Trigger, scopes: string[], context: BindingContext, eligible: (action: BindingAction) => boolean = () => true) {
    if (this.paused) return false;
    const candidates = this.index.get(triggerKey(trigger)) ?? [];
    for (const scope of scopes) for (const action of candidates) {
      if (action.scope !== scope || !eligible(action)) continue;
      if (this.invokeAction(action, context)) return true;
    }
    return false;
  }
  private invokeAction(action: BindingAction, context: BindingContext) {
    if (action.handler(context) === false) return false;
    context.event?.preventDefault(); context.event?.stopPropagation(); return true;
  }
  private armChord() { clearTimeout(this.chordTimer); this.chordTimer = setTimeout(() => this.cancelChord(), 1500); }
  private updateChordHint() {
    if (!this.pending) { this.chordStatus[1](""); return; }
    const choices = this.pending.candidates.map(candidate => {
      const label = triggerLabel(candidate.trigger.steps[this.pending!.step]);
      return `${label.length === 1 ? label.toUpperCase() : label} ${candidate.action.name}`;
    });
    this.chordStatus[1](`Chord: ${[...new Set(choices)].join(" · ")} · Esc Cancel`);
  }
  cancelChord() { clearTimeout(this.chordTimer); this.chordTimer = undefined; this.pending = undefined; this.chordStatus[1](""); }
  conflicts(id: string, triggers: Trigger[]) {
    const action = this.actions.get(id); if (!action) throw new Error("Unknown action");
    return this.list().filter(other => other.id !== id && scopesOverlap(action.scope, other.scope) && this.effective(other.id).some(existing => triggers.some(candidate => this.triggerConflict(existing, candidate))));
  }
  private triggerConflict(a: Trigger, b: Trigger) {
    const steps = (trigger: Trigger) => trigger.kind === "chord" ? trigger.steps.map(triggerKey) : [triggerKey(trigger)];
    const left = steps(a), right = steps(b), length = Math.min(left.length, right.length);
    return left.slice(0, length).every((key, index) => key === right[index]);
  }
  private assertDistinctTriggers(triggers: Trigger[]) {
    for (let i = 0; i < triggers.length; i++) for (let j = i + 1; j < triggers.length; j++) {
      if (this.triggerConflict(triggers[i], triggers[j])) throw new Error("Duplicate or ambiguous combination");
    }
  }
  assign(id: string, triggers: Trigger[], reassign = false) {
    const validated = triggers.map(validateTrigger);
    this.assertDistinctTriggers(validated);
    const conflicts = this.conflicts(id, validated);
    if (conflicts.length && !reassign) throw new Error(`Already assigned to: ${conflicts.map(a => a.name).join(", ")}`);
    const next = { ...this.overrides, [id]: validated };
    for (const conflict of conflicts) next[conflict.id] = this.effective(conflict.id).filter(existing => !validated.some(candidate => this.triggerConflict(existing, candidate)));
    this.commit(next);
  }
  reset(id?: string) {
    if (!id) { this.commit(Object.create(null)); return; }
    const action = this.get(id); if (!action) throw new Error("Unknown action");
    if (this.conflicts(id, action.defaults).length) throw new Error("Default combination is in use. Remove the conflicting assignment first.");
    const next = { ...this.overrides }; delete next[id]; this.commit(next);
  }
  export() { return JSON.stringify({ version: 2, overrides: this.overrides }, null, 2); }
  import(text: string) {
    const next = this.parse(text);
    for (const id of Object.keys(next)) if (!this.actions.has(id)) throw new Error(`Unknown action: ${id}`);
    const actions = this.list();
    for (let i = 0; i < actions.length; i++) for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i], b = actions[j];
      if (scopesOverlap(a.scope, b.scope) && (next[a.id] ?? a.defaults).some(t => (next[b.id] ?? b.defaults).some(u => this.triggerConflict(t, u)))) throw new Error(`Conflicting imported bindings: ${a.name} / ${b.name}`);
    }
    this.commit(next);
  }
  private parse(text: string): Record<string, Trigger[]> {
    if (text.length > 250000) throw new Error("Binding settings are too large");
    const data = JSON.parse(text);
    if (![1, 2].includes(data?.version) || !data.overrides || typeof data.overrides !== "object" || Array.isArray(data.overrides)) throw new Error("Expected version 1 or 2 binding settings");
    const next: Record<string, Trigger[]> = Object.create(null);
    for (const [id, value] of Object.entries(data.overrides)) {
      if (!/^[a-zA-Z][\w.-]{0,100}$/.test(id) || !Array.isArray(value) || value.length > 20) throw new Error("Invalid binding override");
      next[id] = value.map(validateTrigger);
      this.assertDistinctTriggers(next[id]);
    }
    return next;
  }
  private restoreStorage() {
    try { const text = this.storage?.getItem(STORAGE_KEY); if (text) { this.overrides = this.parse(text); this.rebuild(); } }
    catch { this.problem[1]("Saved binding preferences could not be read; defaults/current settings are retained."); }
  }
  private commit(next: Record<string, Trigger[]>) {
    this.overrides = next; this.rebuild();
    try {
      if (!this.storage) throw new Error();
      this.storage.setItem(STORAGE_KEY, this.export()); this.problem[1]("");
      if (typeof window !== "undefined") window.dispatchEvent(new Event("speedy-bindings-changed"));
    } catch { this.problem[1]("Changes work for this session but could not be saved to browser storage. Export JSON to keep them."); }
  }
  private rebuild() {
    this.cancelChord(); this.index.clear(); this.chordStarts.clear();
    for (const action of this.actions.values()) for (const trigger of this.overrides[action.id] ?? action.defaults) {
      if (trigger.kind === "chord") {
        const key = triggerKey(trigger.steps[0]); this.chordStarts.set(key, [...(this.chordStarts.get(key) ?? []), { action, trigger }]);
      } else {
        const key = triggerKey(trigger); this.index.set(key, [...(this.index.get(key) ?? []), action]);
      }
    }
    this.revision[1](n => n + 1);
    for (const [id, label] of this.labels) label[1](this.labelValue(id));
  }
}
