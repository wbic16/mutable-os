/** Pure metadata for a qualified type; importing it does not activate a view. */
export interface BlockTypeDeclaration {
  readonly type: string;
  readonly capabilities: readonly string[];
  readonly aliases?: readonly string[];
}

/** Detached discovery snapshot of one active primary Block registration. */
export interface BlockRegistrationInfo {
  readonly type: string;
  readonly capabilities: readonly string[];
  readonly aliases: readonly string[];
  readonly owner: string;
}
