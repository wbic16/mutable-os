export interface StandoffPropertyDefinition {
  readonly type: string;
  readonly label?: string;
  /** Explicit caller use only; registration and discovery never validate ranges. */
  readonly validate?: (property: Readonly<Record<string, unknown>>) => void;
}

/** Partial index for newly declared types, NOT an exhaustive catalogue of
 * supported annotations. Historical types work independently of membership.
 * Definitions do not register visual effects, activate features or edit ranges. */
export class StandoffPropertyDefinitionIndex {
  private entries = new Map<string, { definition: Readonly<StandoffPropertyDefinition>; owner: string }>();
  private disposed = false;

  register(definition: StandoffPropertyDefinition, owner: string): () => void {
    if (this.disposed) throw new Error("Standoff Property definition index is disposed");
    if (!definition || typeof definition.type !== "string" || !definition.type.trim() ||
      typeof owner !== "string" || !owner.trim() ||
      definition.label !== undefined && typeof definition.label !== "string" ||
      definition.validate !== undefined && typeof definition.validate !== "function") {
      throw new Error("Invalid Standoff Property definition or owner");
    }
    const previous = this.entries.get(definition.type);
    if (previous) throw new Error(`Standoff Property ${definition.type} already belongs to ${previous.owner}; cannot register for ${owner}`);
    const entry = { definition: Object.freeze({ ...definition }), owner };
    this.entries.set(entry.definition.type, entry);
    return () => {
      if (this.entries.get(entry.definition.type) === entry) this.entries.delete(entry.definition.type);
    };
  }

  get(type: string): Readonly<StandoffPropertyDefinition> | undefined { return this.entries.get(type)?.definition; }
  owner(type: string): string | undefined { return this.entries.get(type)?.owner; }
  list(): readonly Readonly<StandoffPropertyDefinition>[] {
    return Object.freeze([...this.entries.values()].map(entry => entry.definition));
  }
  dispose(): void { this.disposed = true; this.entries.clear(); }
}
