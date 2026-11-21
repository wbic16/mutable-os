/** Required native features, independent of authoring policy and source format. */
export const INLINE_ALTERNATIVES_CAPABILITY = 'mutable/inline-alternatives/v1';
export const NATIVE_CAPABILITIES = new Set([INLINE_ALTERNATIVES_CAPABILITY]);
export function validateCapabilities(value: unknown, supported: ReadonlySet<string> = NATIVE_CAPABILITIES): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string') || new Set(value).size !== value.length) throw Error('Invalid required native capabilities.');
  for (const capability of value) if (!supported.has(capability)) throw Error(`Unsupported native capability: ${capability}. Use a compatible Mutable implementation; nothing was imported.`);
}
