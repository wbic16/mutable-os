import type { Composition, Wave } from './model';
/** Derived experiment, not a shaper. Grapheme ranges are Unicode code-point offsets,
 * matching native inline boundaries; they are never claimed to be glyph clusters. */
export interface Cluster { text: string; start: number; end: number }
export interface Placement extends Cluster { pathId: string; x: number; y: number; angle: number; size: number; advance: number }
export interface Layout { placements: Placement[]; overflow: Cluster[]; diagnostics: string[] }
export function clusters(text: string): Cluster[] {
  let position = 0;
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment }) => {
    const start = position; position += [...segment].length; return { text: segment, start, end: position };
  });
}
interface Sample { x: number; y: number; distance: number }
export class WaveGeometry {
  readonly samples: Sample[] = []; readonly length: number;
  constructor(readonly wave: Wave) {
    let distance = 0;
    for (let i = 0; i <= 512; i++) {
      const x = wave.width * i / 512, y = wave.baseline + wave.amplitude * Math.sin(i / 512 * 2 * Math.PI * wave.cycles);
      const previous = this.samples.at(-1);
      if (previous) distance += Math.hypot(x - previous.x, y - previous.y);
      this.samples.push({ x, y, distance });
    }
    this.length = distance;
  }
  at(distance: number) {
    let lo = 1, hi = this.samples.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.samples[mid].distance < distance) lo = mid + 1; else hi = mid; }
    const a = this.samples[lo - 1], b = this.samples[lo], t = Math.max(0, Math.min(1, (distance - a.distance) / (b.distance - a.distance)));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  }
  path() { return this.samples.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }
}
export class FlowLayout {
  private widths = new Map<string, number>();
  private geometry = new Map<string, WaveGeometry>();
  readonly counts = { measurements: 0, geometryBuilds: 0, layouts: 0 };
  constructor(private measure: (text: string) => number) {}
  /** Measurement uses a fixed 100px font; linear scaling is a limited Latin proof.
   * Invalidate on font readiness/family changes. Production optical-size axes need reshaping. */
  invalidateFont() { this.widths.clear(); }
  wave(wave: Wave) {
    const key = JSON.stringify(wave);
    let geometry = this.geometry.get(key);
    if (!geometry) { geometry = new WaveGeometry(wave); this.geometry.set(key, geometry); this.counts.geometryBuilds++; }
    if (this.geometry.size > 24) this.geometry.delete(this.geometry.keys().next().value!);
    return geometry;
  }
  layout(text: string, config: Composition): Layout {
    this.counts.layouts++;
    const all = clusters(text), placements: Placement[] = [], diagnostics: string[] = [];
    // Do not silently render scripts requiring contextual shaping as isolated characters.
    if (/[^\p{Script=Latin}\p{Mark}\p{Number}\p{Punctuation}\p{Separator}\n\r]/u.test(text))
      return { placements, overflow: all, diagnostics: ['Unsupported shaping in this experiment; edit the intact native source below.'] };
    if (/fi|fl|ff/i.test(text)) diagnostics.push('Ligature formation and kerning across graphemes are not qualified.');
    let cursor = 0;
    for (const wave of config.paths) {
      const geometry = this.wave(wave); let distance = 0;
      while (cursor < all.length) {
        if (all[cursor].text === '\n' || all[cursor].text === '\r\n') { cursor++; break; }
        // Fit a complete word, including its position-dependent size envelope.
        let end = cursor + 1;
        if (!/^\s$/u.test(all[cursor].text)) while (end < all.length && !/^\s$/u.test(all[end].text)) end++;
        const fit = (from: number, to: number, start: number) => {
          const out: Placement[] = []; let d = start;
          for (let i = from; i < to; i++) {
            const c = all[i]; let width = this.widths.get(c.text);
            if (width === undefined) { width = this.measure(c.text); this.counts.measurements++; this.widths.set(c.text, width); }
            const size = config.fontSize * (1 + config.swell * Math.sin(Math.PI * Math.min(1, d / geometry.length)) ** 2);
            const advance = width * size / 100;
            if (d + advance > geometry.length) return { out, distance: d, complete: false };
            out.push({ ...c, pathId: wave.id, ...geometry.at(d + advance / 2), size, advance }); d += advance;
          }
          return { out, distance: d, complete: true };
        };
        const result = fit(cursor, end, distance);
        if (!result.complete && distance > 0) break;
        // An overlong word can split only at grapheme boundaries, with an explicit warning.
        if (!result.complete) diagnostics.push('Overlong word split at a grapheme boundary.');
        placements.push(...result.out); distance = result.distance; cursor += result.out.length;
        if (!result.complete) break;
      }
    }
    return { placements, overflow: all.slice(cursor), diagnostics };
  }
}
