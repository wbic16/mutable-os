/** Shared native URL/ID validation; no acquisition or renderer dependencies. */
export function youtubeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.username || url.password || url.port || !["http:", "https:"].includes(url.protocol)) return undefined;
    const host = url.hostname.replace(/^www\./, "");
    let id: string | null | undefined;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(embed|shorts|live)\//.test(url.pathname) ? url.pathname.split("/")[2] : undefined;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}

