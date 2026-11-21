import type { BlockMenuItem } from "../../feature-api";
import { definitionFor } from "./definition";
import { angles, defaults, presets, type ObjectState, type Lighting, type ViewAngles } from "./model";
export function objectMenu(state: ObjectState | undefined, change: (patch: Partial<ObjectState>, label: string) => void, fit: () => void, currentView: () => ViewAngles = () => state!.view, protectedState=false): BlockMenuItem[] {
  if (!state) return [];
  const protect=(item:BlockMenuItem):BlockMenuItem=>protectedState?{...item,disabled:true,reason:"Authored configuration is protected",run:undefined,children:undefined}:item;
  return [{ label: "3D Object", children: [
    { label: "View", children: [ ...Object.entries(presets).map(([label, view]) => ({ label, run: () => change({ view, autoRotate: false }, `3D View: ${label}`) })),
      { label: "Reset View", run: () => change({ view: presets["Three-quarter"], autoRotate: false }, "Reset 3D View") } ] },
    { label: `Auto Rotate: ${state.autoRotate ? "On" : "Off"}`, run: () => change({ autoRotate: !state.autoRotate, ...(state.autoRotate ? { view: angles(currentView()) } : {}) }, "Toggle Auto Rotate") },
    ...(definitionFor(state.scene)?.actions(state, change) ?? []).map(protect),
    protect({ label: "Lighting", children: (["neutral", "warm", "dramatic"] as Lighting[]).map(lighting => ({ label: `${lighting[0].toUpperCase()}${lighting.slice(1)}${lighting === state.lighting ? " ✓" : ""}`, run: () => change({ lighting }, "3D Lighting") })) }),
    { label: "Fit to Object", run: fit },
    protect({ label: "Reset Object", run: () => change(defaults(), "Reset 3D Object") }),
  ] }];
}
