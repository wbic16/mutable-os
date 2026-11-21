// Original investigation harness. Creates only an isolated Chrome profile and evidence files.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const output = process.env.QUILL_OUTPUT ?? 'experiments/quill/evidence';
await mkdir(output, { recursive: true });
const vite = await createServer({ optimizeDeps: { entries: ['src/qualification/quill/browser.html'] }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{
  name: 'quill-bounded-work-probe',
  transform(code, id) {
    if (!id.endsWith('/src/block-tree/repository.ts')) return;
    return code.replace(/(function (validateRepository|planChangedRecords)\([^)]*\)[^{]*\{)/g, (header, _, name) => header + ` for(const c of [globalThis.__quillCounters,globalThis.__characterProofCounters])if(c)c.${name === 'validateRepository' ? 'fullValidation' : 'broadPlanning'}++;`);
  },
}] });
await vite.listen();
const profile = await mkdtemp(path.join(tmpdir(), 'quill-proof-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
]);
let socket;
const report = { checks: [], errors: [] };
const check = (name, passed, details) => { report.checks.push({ name, passed: !!passed, details }); assert.ok(passed, name); };
try {
  const endpoint = await new Promise((resolve, reject) => { let out = ''; chrome.stderr.on('data', b => { out += b; const match = out.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); }); chrome.once('error', reject); setTimeout(() => reject(Error('Chrome startup timeout')), 15000).unref(); });
  socket = new WebSocket(endpoint); await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.method === 'Runtime.exceptionThrown') report.errors.push(m.params.exceptionDetails); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timer = setTimeout(() => { pending.delete(requestId); reject(Error('CDP timeout: ' + method)); }, 30000); pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const wait = condition => evaluate(`(async()=>{for(let i=0;i<500;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+' body='+document.body.innerText.slice(0,1000))})()`);
  const frame = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const typing = async () => {
    // Reuse the repository's real Flint benchmark probes and trusted CDP key dispatch.
    await evaluate(`(async()=>{const text=q.sourceNode(),mount=q.editor.mounts.get(text.key);window.typingProof={editor:q.editor,session:q.session,text,mount,flow:mount.root.querySelector('.reactive-standoff-flow')??mount.root};window.caretProbe=await import('/experiments/initialis-adapter/browser.js');await caretProbe.setup(typingProof);window.typingBefore=q.text();})()`);
    const handlers = await evaluate('caretProbe.handlers()');
    await evaluate('typingProof.mount.focus();typingProof.mount.restoreInlineSelection({anchor:100,head:100});caretProbe.startCounters()');
    for (let i = 0; i < 20; i++) {
      const key = i % 2 ? 'Backspace' : 'x';
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key === 'x' ? 'KeyX' : key, windowsVirtualKeyCode: key === 'x' ? 88 : 8, ...(type === 'keyDown' && key === 'x' ? { text: key } : {}) }, sessionId);
      await frame();
    }
    const trusted = await evaluate('caretProbe.stopCounters()');
    check('Flint benchmark typing retains text and caret', await evaluate('q.text()===typingBefore && typingProof.mount.captureInlineSelection().head===100'));
    check('Flint benchmark has bounded canonical work', ['fullValidation', 'broadPlanning', 'snapshots', 'requests', 'projectionBuilds', 'paragraphTextWalks'].every(k => trusted.counts[k] === 0), trusted.counts);
    return { handlers, trusted };
  };
  report.browser = await send('Browser.getVersion');
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1450, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: `http://127.0.0.1:${vite.httpServer.address().port}/src/qualification/quill/browser.html` }, sessionId);
  await wait('window.quillProof && quillProof.sourceNode()');
  await evaluate('window.q=quillProof;void 0');
  report.typingBefore = await typing();
  await evaluate('window.original={text:q.text(),key:q.record(q.sourcePlacement).key,properties:JSON.stringify(q.record(q.sourcePlacement).payload.standoffProperties)};q.open()');
  check('invocation leaves source intact before confirmation', await evaluate('q.text()===original.text && q.active().wrapper===undefined'));
  await evaluate('q.confirm()'); await wait('q.layout()?.placements.length>0');
  check('Flint paragraph converted in place with canonical identity and annotations', await evaluate('q.record(q.sourcePlacement).key===original.key && JSON.stringify(q.record(q.sourcePlacement).payload.standoffProperties)===original.properties'));
  check('three paths contain text', await evaluate('new Set(q.layout().placements.map(p=>p.pathId)).size===3'));
  await writeFile(path.join(output, 'flint-composition.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64'));
  await evaluate('window.beforeLayout=JSON.stringify(q.layout());q.editor.commands.replaceInlineRange(q.sourcePlacement,0,0,"Listen to the distant wings. ")'); await frame();
  check('insert displaces words across paths and rebases overlapping annotations', await evaluate('JSON.stringify(q.layout())!==beforeLayout && q.record(q.sourcePlacement).payload.standoffProperties.find(p=>p.id==="entity-raven").start===33'));
  await writeFile(path.join(output, 'reflow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64'));
  await evaluate('q.editor.repository.undo()'); await frame(); check('delete via undo restores layout', await evaluate('JSON.stringify(q.layout())===beforeLayout'));
  await evaluate('window.beforeText=q.text();window.__quillCounters={fullValidation:0,broadPlanning:0};q.update("amplitude",50)'); await frame();
  report.geometryCommitWork = await evaluate('({...__quillCounters})');
  await evaluate('delete window.__quillCounters');
  check('geometry commit avoids broad planning and full validation', Object.values(report.geometryCommitWork).every(n => n === 0), report.geometryCommitWork);
  check('amplitude changes geometry without canonical text mutation', await evaluate('q.text()===beforeText && JSON.stringify(q.layout())!==beforeLayout'));
  await evaluate('window.beforeOpacity=JSON.stringify(q.layout());window.layoutCount=q.counts()[0].layouts;q.update("opacity",.4)'); await frame();
  check('visual-only opacity performs no reflow', await evaluate('JSON.stringify(q.layout())===beforeOpacity && q.counts()[0].layouts===layoutCount'));
  await evaluate('q.update("opacity",1);q.close()'); await frame();
  check('return keeps the same document and editable inline composition in Flint', await evaluate('!!document.querySelector(".flint-application .quill-inline") && q.record(q.sourcePlacement).key===original.key'));
  report.typingAfter = await typing();
  await evaluate('q.setHostMode("native-editor")'); await wait('q.sourceNode() && document.querySelector(".quill-native .quill-inline")');
  await evaluate('q.open()'); check('same command contract reopens from the generic native editor', await evaluate('q.active().invocation.sourceApp==="native-editor" && !!q.active().wrapper'));
  await evaluate('document.documentElement.classList.add("quill-light")'); await frame();
  await writeFile(path.join(output, 'native-light.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64'));
  report.layoutBenchmark = await evaluate('q.benchmark()');
  report.layoutBenchmark.samples.sort((a, b) => a - b);
  const samples = report.layoutBenchmark.samples;
  report.layoutBenchmark.summary = { iterations: samples.length, p50ms: samples[Math.floor(samples.length * .5)], p95ms: samples[Math.floor(samples.length * .95)], maxMs: samples.at(-1) };
  // Canonical text commit probes include mounted native rendering and Quill's derived layout.
  await evaluate(`window.__quillCounters={fullValidation:0,broadPlanning:0,snapshots:0,requests:0};window.originalSnapshot=q.editor.repository.snapshot; q.editor.repository.snapshot=function(...args){__quillCounters.snapshots++;return originalSnapshot.apply(this,args)};window.originalFetch=window.fetch;window.fetch=(...args)=>{__quillCounters.requests++;return originalFetch(...args)};q.editor.commands.replaceInlineRange(q.sourcePlacement,0,0,'x')`);
  await frame(); report.boundedWork = await evaluate('({...__quillCounters})');
  await evaluate('q.editor.repository.snapshot=originalSnapshot;window.fetch=originalFetch;delete window.__quillCounters');
  check('mounted edit performs no full validation, broad planning, snapshot or network request', Object.values(report.boundedWork).every(n => n === 0), report.boundedWork);
  report.note = 'Headless Chromium evidence. Timings exclude presentation paint and do not establish human-visible latency. Full SVG caret/IME and complex shaping are not qualified.';
} catch (error) { report.error = String(error); throw error; }
finally {
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
  socket?.close();
  if (chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited; }
  await vite.close(); await rm(profile, { recursive: true, force: true });
}
console.log(JSON.stringify({ checks: report.checks.length, layout: report.layoutBenchmark.summary, boundedWork: report.boundedWork }, null, 2));
