export interface BlockPropertyDefinition {
  readonly type: string;
  readonly label?: string;
  /** Describes an existing consumer; never resolves or executes an interpreter. */
  readonly interpretedBy?: string;
  /** Explicit caller use only; registration and discovery never validate data. */
  readonly validate?: (property: Readonly<Record<string, unknown>>) => void;
}

/** Partial index for newly declared types, NOT a catalogue or admission gate for
 * historical Block Properties. Existing interpretation and persistence remain
 * independent of membership. This index never touches authored property arrays. */
export class BlockPropertyDefinitionIndex {
  private entries = new Map<string, { definition: Readonly<BlockPropertyDefinition>; owner: string }>();
  private disposed = false;

  register(definition: BlockPropertyDefinition, owner: string): () => void {
    if (this.disposed) throw new Error("Block Property definition index is disposed");
    if (!definition || typeof definition.type !== "string" || !definition.type.trim() ||
      typeof owner !== "string" || !owner.trim() ||
      definition.label !== undefined && typeof definition.label !== "string" ||
      definition.interpretedBy !== undefined && typeof definition.interpretedBy !== "string" ||
      definition.validate !== undefined && typeof definition.validate !== "function") {
      throw new Error("Invalid Block Property definition or owner");
    }
    const previous = this.entries.get(definition.type);
    if (previous) throw new Error(`Block Property ${definition.type} already belongs to ${previous.owner}; cannot register for ${owner}`);
    const entry = { definition: Object.freeze({ ...definition }), owner };
    this.entries.set(entry.definition.type, entry);
    return () => {
      if (this.entries.get(entry.definition.type) === entry) this.entries.delete(entry.definition.type);
    };
  }

  get(type: string): Readonly<BlockPropertyDefinition> | undefined { return this.entries.get(type)?.definition; }
  owner(type: string): string | undefined { return this.entries.get(type)?.owner; }
  list(): readonly Readonly<BlockPropertyDefinition>[] {
    return Object.freeze([...this.entries.values()].map(entry => entry.definition));
  }
  dispose(): void { this.disposed = true; this.entries.clear(); }
}
