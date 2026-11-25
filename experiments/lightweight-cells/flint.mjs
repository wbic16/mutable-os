// Run from the repo root. Reuse the real Flint runner, its original assertions,
// fixtures, synthetic beforeinput sampling, CDP input/Undo and isolated server.
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const [mode, fixture, trial] = process.argv.slice(2);
assert.ok(['stock', 'cells', 'resident'].includes(mode) && ['native', 'dense'].includes(fixture) && /^\d+$/.test(trial));
const output = path.resolve('artifacts/lightweight-cells', [fixture, mode, trial].join('-'));
mkdirSync(output, {recursive:true});
const original = process.env.BENCHMARK_DOCUMENT_PATH ??
  'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink';
let documentPath = original;
if (fixture === 'dense') {
  const doc = JSON.parse(readFileSync(original));
  const blocks = doc.document.blocks.filter(b => b.inline?.length === 1 && b.inline[0].kind === 'text');
  const block = blocks.sort((a,b) => b.inline[0].text.length - a.inline[0].text.length)[0];
  const length = Array.from(block.inline[0].text).length;
  for (let i = 0; i < 256; i++) {
    const start = (i * 37) % length;
    block.properties.standoffProperties.push({id:'study-' + i, type:'study/range', start, end:Math.min(start+8,length-1)});
  }
  documentPath = path.join(output,'dense.ink');
  writeFileSync(documentPath, JSON.stringify(doc));
}
let runner = readFileSync('scripts/benchmark-flint-typing-browser.mjs','utf8');
function change(from, to) {
  assert.equal(runner.split(from).length,2,'Review fixture adapter: '+from);
  runner = runner.replace(from, () => to);
}
if (mode === 'cells') change('plugins:[{','plugins:[(await import("./experiments/lightweight-cells/flint-plugin.mjs")).cellBridge(),{');
change('const result=await sampleTyping();', `const result=await sampleTyping();
Object.assign(result,await evaluate('({properties:proof.text.payload.standoffProperties.length,bridgeCalls:window.cellBridgeCalls??0,builds:window.cellBridgeBuilds??0})'));
assert.equal(result.bridgeCalls,${mode === 'cells' ? 40 : 0},'Expected mapper on every timed input');`);
const bulk = async () => {
  const {editor,text,mount} = window.proof;
  const {mapStandoffPropertiesForReplacement: map} = await import('/src/interchange/ranges.ts');
  const initial = mount.captureText(), chars = Array.from(initial);
  const read = () => Array.from(text.payload.standoffProperties, p=>({id:p.id,start:p.start,end:p.end}));
  const properties = read(), samples = {};
  for (const [name, start, end, inserted] of [
    ['paste', 100, 100, 'alpha '.repeat(32)],
    ['deleteSelection', 50, 240, ''],
    ['replaceSelection', 50, 240, 'green '.repeat(32)],
  ]) {
    const expected = chars.slice(0,start).join('') + inserted + chars.slice(end).join('');
    const bounds = map(properties,start,end,Array.from(inserted).length,[],chars.length);
    const times = [];
    for (let i=0;i<9;i++) {
      const time = performance.now();
      editor.commands.replaceInlineRange(text.key,start,end,inserted);
      const duration = performance.now()-time;
      await Promise.resolve();
      if (mount.captureText()!==expected || JSON.stringify(read())!==JSON.stringify(bounds)) throw Error(name+' mismatch');
      editor.repository.undo();
      await Promise.resolve();
      if (mount.captureText()!==initial || JSON.stringify(read())!==JSON.stringify(properties)) throw Error('Undo '+name);
      if (i>0) times.push(duration);
      await new Promise(requestAnimationFrame);
    }
    samples[name]=times;
  }
  return samples;
};
change("console.log('Real Chrome character input and undo: passed');", `console.log('Real Chrome character input and undo: passed');
const bulk=await evaluate(${JSON.stringify('('+bulk.toString()+')()')});
await writeFile(path.join(artifacts,'bulk.json'),JSON.stringify(bulk,null,2));`);
const result=spawnSync(process.execPath,['--input-type=module','-e',runner],{stdio:'inherit',
  env:{...process.env,BENCHMARK_COMPACT:'1',BENCHMARK_RESIDENT_CELLS:String(mode==='resident'),BENCHMARK_DOCUMENT_PATH:documentPath,BENCHMARK_OUTPUT:output}});
process.exitCode=result.status??1;
