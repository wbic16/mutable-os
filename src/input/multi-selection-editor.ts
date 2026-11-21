import type { TreeCommands } from "../block-tree/commands";
import type { BlockNode, NodeKey, SelectionSet, TextSelectionItem } from "../block-tree/types";
import type { SelectionService } from "../runtime/selections";

export interface SelectionReplacement {
  item: TextSelectionItem;
  start: number;
  end: number;
  text: string;
}

export class MultiSelectionEditor {
  constructor(
    private readonly commands: TreeCommands,
    private readonly selections: SelectionService,
    private readonly node: (nodeKey: NodeKey) => BlockNode | undefined,
  ) {}

  replace(occurrenceKey: NodeKey, replacements: SelectionReplacement[]): void {
    if(this.commands.isCompactText(occurrenceKey))throw Error('Multiple-caret editing is not yet qualified for compact text');
    const node = this.node(occurrenceKey);
    const current = this.selections.sets[occurrenceKey];
    if (!node || !current) throw new Error("The editing occurrence or selection no longer exists");
    if (!replacements.length) return;
    if (replacements.some((replacement) => replacement.item.anchor.contentKey !== node.contentKey)) {
      throw new Error("Cross-content multi-editing requires a structural operation map");
    }

    const unique = new Map<string, SelectionReplacement>();
    for (const replacement of replacements) {
      if (replacement.start < 0 || replacement.end < replacement.start || replacement.end > node.inlineContent.length) {
        throw new Error(`Invalid selection range ${replacement.start}..${replacement.end}`);
      }
      const key = `${replacement.start}:${replacement.end}:${replacement.text}`;
      const existing = unique.get(key);
      if (!existing || replacement.item.id === current.primaryId) unique.set(key, replacement);
    }
    const normalized = [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < normalized.length; index += 1) {
      const previous = normalized[index - 1];
      const candidate = normalized[index];
      if (candidate.start < previous.end) {
        throw new Error("Overlapping multi-selections must be normalized before editing");
      }
    }

    this.commands.transaction("Edit multiple selections", () => {
      [...normalized]
        .sort((a, b) => b.start - a.start || b.end - a.end)
        .forEach((replacement) =>
          this.commands.replaceInlineRange(
            occurrenceKey,
            replacement.start,
            replacement.end,
            replacement.text,
          ),
        );
    });

    [...normalized]
      .sort((a, b) => b.start - a.start || b.end - a.end)
      .forEach((replacement) =>
        this.selections.mapContentEdit(
          node.contentKey,
          replacement.start,
          replacement.end,
          [...replacement.text].length,
        ),
      );

    let accumulatedDelta = 0;
    const resultingItems = normalized.map((replacement) => {
      const caret = replacement.start + accumulatedDelta + [...replacement.text].length;
      accumulatedDelta += [...replacement.text].length - (replacement.end - replacement.start);
      return {
        ...replacement.item,
        anchor: {
          ...replacement.item.anchor,
          occurrenceKey,
          boundary: { index: caret, affinity: "after" as const },
        },
        head: {
          ...replacement.item.head,
          occurrenceKey,
          boundary: { index: caret, affinity: "after" as const },
        },
      };
    });
    const primaryId = resultingItems.some((item) => item.id === current.primaryId)
      ? current.primaryId
      : resultingItems[0].id;
    const next: SelectionSet = {
      ...current,
      primaryId,
      items: resultingItems,
    };
    this.selections.setSelectionSet(occurrenceKey, next);
  }
}
