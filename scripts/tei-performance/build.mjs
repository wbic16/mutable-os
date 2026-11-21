import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'vite';
import solid from 'vite-plugin-solid';

const baseline = process.env.TEI_BASELINE_REF;
// Bounded M5 closure comparison: identical M4 harness in both production builds,
// with every changed application module restored in BOTH main and worker realms.
const comparison = process.env.TEI_M5_COMPARE;
if (comparison && (!['m4', 'm5'].includes(comparison) || baseline)) throw Error('Use TEI_M5_COMPARE=m4|m5 without TEI_BASELINE_REF.');
const git = (...args) => execFileSync('git', args, {encoding:'utf8', maxBuffer:32*1024*1024});
const comparisonHarness = comparison ? git('show', 'f249c72:scripts/tei-performance/main.tsx') : undefined;
const changedSources = comparison ? git('diff', '--name-only', 'f249c72', '--', 'src').trim().split('\n').filter(f=>/\.[cm]?[jt]sx?$/.test(f)) : [];
const baselineFiles = comparison ? new Set(git('ls-tree', '-r', '--name-only', 'f249c72', '--', 'src').trim().split('\n')) : new Set();
const restored = new Map(comparison === 'm4' ? changedSources.filter(f=>baselineFiles.has(f)).map(f=>[f,git('show', 'f249c72:'+f)]) : []);
const comparisonPlugin = () => ({
  name:'m5-matched-qualification', enforce:'pre',
  load(id) {
    const file=id.replace(process.cwd()+'/', '');
    if(file==='scripts/tei-performance/main.tsx')return comparisonHarness;
    if(comparison==='m4' && changedSources.includes(file)) {
      if(!restored.has(file))throw Error('M5-only application module reached the M4 build: '+file);
      return restored.get(file);
    }
  },
});
if (baseline && !execFileSync('git', ['rev-parse', baseline], {encoding:'utf8'}).trim().startsWith('5e2f0f4')) {
  throw Error('The instrumented baseline preparation copy is qualified only for 5e2f0f4.');
}
const originals = new Set([
  'src/history/stage-c-gates/portable.ts',
  'src/persistence/native-session.ts', 'src/persistence/native-resource.ts', 'src/block-tree/resource-identity.ts',
  'src/block-tree/linked-annotations.ts', 'src/block-tree/resource-boundary.ts',
  'src/block-tree/repository.ts', 'src/runtime/linked-annotations.ts',
  'src/reactive-editor/editor.ts',
]);
const baselinePlugin = () => ({
  name: 'qualification-baseline', enforce: 'pre',
  load(id) {
    const file = id.replace(process.cwd() + '/', '');
    if (file === 'src/interchange/tei/native.ts') return readFileSync(new URL('./baseline-native.txt', import.meta.url), 'utf8');
    if (originals.has(file)) return execFileSync('git', ['show', baseline + ':' + file], {encoding:'utf8'});
  },
});
await build({
  configFile: false,
  plugins: [...(baseline ? [baselinePlugin()] : []), ...(comparison ? [comparisonPlugin()] : []), solid()],
  resolve: {alias: {'decode-named-character-reference': createRequire(import.meta.url).resolve('decode-named-character-reference')}},
  // Vite runs a separate plugin pipeline for workers. Both realms must use the
  // baseline; overriding only the main bundle produces a misleading hybrid.
  worker: {format: 'es', plugins: [...(baseline ? [baselinePlugin()] : []), ...(comparison ? [comparisonPlugin()] : [])]},
  build: {target: 'esnext', sourcemap: process.env.TEI_SOURCEMAP !== '0', outDir: comparison ? `artifacts/tei-m5-closure/site-${comparison}` : 'artifacts/tei-performance/site', rollupOptions: {input: 'scripts/tei-performance/index.html'}},
});
if(comparison) {
  mkdirSync('artifacts/tei-m5-closure',{recursive:true});
  writeFileSync(`artifacts/tei-m5-closure/build-${comparison}.json`,JSON.stringify({comparison,baseline:git('rev-parse','f249c72').trim(),current:git('rev-parse','HEAD').trim(),harnessSha256:createHash('sha256').update(comparisonHarness).digest('hex'),changedSources,restored:[...restored.keys()],sourceDiff:git('diff','HEAD','--','src'),fixtures:Object.fromEntries(['A040080.xml','A041209.xml'].map(f=>[f,createHash('sha256').update(readFileSync('src/interchange/tei/fixtures/'+f)).digest('hex')]))},null,2));
}
