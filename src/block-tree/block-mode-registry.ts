export interface BlockModeDefinition {
  readonly mode: string;
  readonly label?: string;
  /** Exact implementation type identifiers. Omitted means no declared restriction. */
  readonly appliesTo?: readonly string[];
}

const identifier = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Partial, descriptive vocabulary. Never a native/clipboard admission gate or
 * a renderer registry. Unknown authored modes work independently of membership. */
export class BlockModeRegistry {
  private entries = new Map<string, { definition: Readonly<BlockModeDefinition>; owner: string }>();
  private disposed = false;

  register(definition: BlockModeDefinition, owner: string): () => void {
    if (this.disposed) throw Error('Block Mode registry is disposed');
    if (!definition || !identifier(definition.mode) || !identifier(owner) ||
      definition.label !== undefined && typeof definition.label !== 'string' ||
      definition.appliesTo !== undefined && (!Array.isArray(definition.appliesTo) || !definition.appliesTo.every(identifier))) {
      throw Error('Invalid Block Mode definition or owner');
    }
    const previous = this.entries.get(definition.mode);
    if (previous) throw Error(`Block Mode ${definition.mode} already belongs to ${previous.owner}; cannot register for ${owner}`);
    const entry = { definition: Object.freeze({ ...definition,
      ...(definition.appliesTo === undefined ? {} : { appliesTo: Object.freeze([...definition.appliesTo]) }),
    }), owner };
    this.entries.set(entry.definition.mode, entry);
    return () => { if (this.entries.get(entry.definition.mode) === entry) this.entries.delete(entry.definition.mode); };
  }
  get(mode: string): Readonly<BlockModeDefinition> | undefined { return this.entries.get(mode)?.definition; }
  owner(mode: string): string | undefined { return this.entries.get(mode)?.owner; }
  list(): readonly Readonly<BlockModeDefinition>[] { return Object.freeze([...this.entries.values()].map(e => e.definition)); }
  dispose(): void { this.disposed = true; this.entries.clear(); }
}

/** Explicit authoring only. Loading never calls this function. Strings are not normalised. */
export function validateModeAssignment(registry: BlockModeRegistry, type: string, mode: string | undefined): void {
  if (mode === undefined) return;
  if (!identifier(mode)) throw Error('A Block Mode must be a nonempty string');
  const definition = registry.get(mode);
  if (definition?.appliesTo && !definition.appliesTo.includes(type)) throw Error(`Block Mode ${mode} does not apply to ${type}`);
}
