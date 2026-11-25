// A Vite transform for the disposable Flint harness only. Original files are
// never patched. Keep all existing commit, validation, projection and renderer work.
export function cellBridge() {
  return {
    name: 'lightweight-cell-benchmark', enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/block-tree/inline-sequence.ts')) return;
      const search = 'if(Array.isArray(payload.standoffProperties))payload.standoffProperties=';
      if (source.split(search).length !== 2) throw Error('Review bridge against replaceCompact');
      return "import {bridge} from '/experiments/lightweight-cells/flint-bridge.mjs';\n" +
        source.replace(search, `const derived=bridge(c,start,end,insert,origins);
  if(derived)payload.standoffProperties=derived;
  else ${search}`);
    }
  };
}
