/** Existing native Add Image/background URL policy, including local UI references. */
export function mediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  try {
    const url = new URL(text, "https://local.invalid/");
    return ["http:", "https:", "blob:"].includes(url.protocol) ? text : undefined;
  } catch { return undefined; }
}

