import { encodeTeiNative } from './compact-native';
import { convertTei } from './convert';
import { teiLimits, type TeiLimits } from './model';
import type { SuppliedFile } from '../file-input';

/** Internally generated native data, never the external clipboard allowlist. */
export async function prepareTeiDocument(file: SuppliedFile, options: Partial<TeiLimits> = {}, profile = false, semanticSublimation = true, operationalSemantics = true, inlineAlternatives = true) {
  const timings: Record<string, number> | undefined = profile ? {} : undefined;
  let last = profile ? performance.now() : 0;
  const stage = (name: string) => { if (timings) { const now = performance.now(); timings[name] = now - last; last = now; } };
  const limits = teiLimits(options);
  if (file.blob.size > limits.bytes) throw Error(`TEI input exceeds the configured ${limits.bytes}-byte limit. Nothing was imported.`);
  const input = new Uint8Array(await file.blob.arrayBuffer());
  stage('fileRead');
  const result = convertTei(input, limits, file.name, timings, { semanticSublimation, operationalSemantics, inlineAlternatives });
  stage('conversionTotal');
  const { bytes, counts } = encodeTeiNative(result.document);
  stage('compactNativeEncodingAndWireValidation');
  return { ...(profile ? { timings, counts } : {}), bytes, id: result.document.id, diagnostics: result.diagnostics, truncated: result.truncated, stats: result.stats };
}
