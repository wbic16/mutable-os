import { chord, keyboard, type BlockApplicationDefinition, type BlockFeatureCapabilities, type CodexFeature, type FeatureScope } from "../../feature-api";
import {timerBlockDto} from "./model";
import {createTimerBlock} from "./commands";
import { TimerBlockView } from "./view";

/** Dependencies are constructed for this activation's owner, not globally shared. */
export function createTimerFeature(capabilities: (scope: FeatureScope) => BlockFeatureCapabilities): CodexFeature {
  return {
    id: "timer",
    activate(scope) {
      const { blocks, register } = capabilities(scope);
      const timerType: BlockApplicationDefinition = { type: "timer-block", create: timerBlockDto, view: TimerBlockView, capabilities: ["control", "opaque-widget", "selectable"] };
      register.block(timerType);
      register.command({ id: "timer.create", label: "Add timer", canExecute: ({ targetKey }) => !!blocks.get(targetKey), execute: ({ targetKey }) => { createTimerBlock(blocks, targetKey); } });
      // Context-menu insertion keeps its existing default position and destination.
      register.command({ id: "timer.insert", label: "Insert timer", canExecute: ({ targetKey }) => !!blocks.get(targetKey), execute: ({ targetKey }) => {
        const node = blocks.get(targetKey)!;
        const placement = blocks.insert(timerType.create(), node.isRoot || node.type === "document-block"
          ? { kind: "at", parentKey: targetKey, index: node.children.length }
          : { kind: "after", anchorKey: targetKey });
        blocks.focusPlacement(placement, node.viewId);
      } });
      register.binding({ id: "timer.create", name: "Add timer", description: "Insert a floating timer beside the focused Block without replacing its text.", category: "Blocks & Margins", scope: "editor", tags: ["timer", "pomodoro"], defaults: [chord(keyboard(";", "Ctrl"), keyboard("t"))], handler: context => context.run("timer.create") });
      register.binding({ id: "cross.timerCreate", name: "Add timer from cross-Block selection", description: "Insert a floating timer beside the selection's origin.", category: "Blocks & Margins", scope: "cross-text", tags: ["timer"], defaults: [chord(keyboard(";", "Ctrl"), keyboard("t"))], handler: context => context.run("timer.create") });
      register.action({ id: "timer.toolbar", slot: "document-actions", label: "Timer", title: "Add timer", binding: "timer.create", command: "timer.create" });
      register.action({ id: "timer.menu", slot: "add-block-menu", label: "Timer", command: "timer.insert" });
    },
  };
}
