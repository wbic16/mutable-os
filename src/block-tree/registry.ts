import type { BlockTypeRegistration, CommandDefinition, CommandContext } from "./types";
import type { BlockRegistrationInfo } from "./type-declarations";

export class BlockRegistry {
  private registrations = new Map<string, BlockTypeRegistration>();
  private owners = new Map<string, string>();
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  typesWithCapability(capability: string): string[] {
    return [...this.registrations.keys(), ...this.aliases.keys()].filter(type => this.hasCapability(type, capability));
  }
  private notify() { for (const listener of this.listeners) listener(); }
  private aliases = new Map<string, string>();

  /** Active registrations only; aliases stay with their primary registration.
   * No views, factories or document state are evaluated during discovery. */
  list(): readonly BlockRegistrationInfo[] {
    return Object.freeze([...this.registrations].map(([type, registration]) => Object.freeze({
      type,
      capabilities: Object.freeze([...registration.capabilities]),
      aliases: Object.freeze([...(registration.aliases ?? [])]),
      owner: this.owners.get(type)!,
    })));
  }

  register(registration: BlockTypeRegistration, owner = "legacy"): () => void {
    const names = [registration.type, ...(registration.aliases ?? [])];
    if (new Set(names).size !== names.length) throw new Error(`Duplicate Block alias in ${registration.type} (${owner})`);
    for (const name of names) {
      if (this.registrations.has(name) || this.aliases.has(name)) throw new Error(`Block type/alias ${name} already belongs to ${this.owner(name)}; cannot register for ${owner}`);
    }
    this.registrations.set(registration.type, registration);
    this.owners.set(registration.type, owner);
    for (const alias of registration.aliases ?? []) this.aliases.set(alias, registration.type);
    this.notify();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.registrations.delete(registration.type);
      this.owners.delete(registration.type);
      for (const alias of registration.aliases ?? []) this.aliases.delete(alias);
      this.notify();
    };
  }

  owner(type: string): string | undefined { return this.owners.get(this.aliases.get(type) ?? type); }

  resolve(type: string): BlockTypeRegistration | undefined {
    return this.registrations.get(this.aliases.get(type) ?? type);
  }

  hasCapability(type: string, capability: string): boolean {
    return this.resolve(type)?.capabilities.includes(capability) ?? false;
  }
}

export class CommandRegistry {
  permit?: (targetKey:string,commandId:string)=>boolean;
  /** Independent of the owning window lifecycle permit. */
  authoringAllowed?: (targetKey:string,commandId:string)=>boolean;
  private commands = new Map<string, CommandDefinition<any>>();
  private owners = new Map<string, string>();

  register<TArgs>(command: CommandDefinition<TArgs>, owner = "legacy"): () => void {
    if (this.commands.has(command.id)) throw new Error(`Command ${command.id} is already registered by ${this.owner(command.id)}; cannot register for ${owner}`);
    this.commands.set(command.id, command);
    this.owners.set(command.id, owner);
    let active = true;
    return () => { if (!active) return; active = false; this.commands.delete(command.id); this.owners.delete(command.id); };
  }

  owner(id: string): string | undefined { return this.owners.get(id); }

  canExecute<TArgs>(id: string, context: CommandContext<TArgs>): boolean {
    return this.authoringAllowed?.(context.targetKey,id) !== false && this.permit?.(context.targetKey,id) !== false && (this.commands.get(id)?.canExecute(context) ?? false);
  }

  execute<TArgs>(id: string, context: CommandContext<TArgs>): void | Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown command ${id}`);
    if (!this.canExecute(id, context)) throw new Error(`Command ${id} is not available for this target`);
    return command.execute(context);
  }

  list(): CommandDefinition<any>[] {
    return [...this.commands.values()];
  }
}
