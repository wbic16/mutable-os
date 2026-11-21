// Read-only baseline overrides for regression comparison; never edits the checkout.
import { execFileSync } from 'node:child_process';
import config from '../vite.config';
const files = new Set(['src/block-tree/repository.ts', 'src/persistence/native-resource.ts', 'src/history/stage-c-gates/resource.ts', 'src/runtime/minimap.ts']);
export default { ...config, cacheDir: 'artifacts/tei-performance/native-baseline-cache', plugins: [{
  name: 'native-admission-baseline', enforce: 'pre',
  load(id) { const file = id.replace(process.cwd() + '/', ''); if (files.has(file)) return execFileSync('git', ['show', 'a089fab:' + file], { encoding: 'utf8' }); },
}, ...config.plugins] };
