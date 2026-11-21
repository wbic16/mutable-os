// Original investigation harness. Creates only an isolated Chrome profile and evidence files.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const output = process.env.QUILL_OUTPUT ?? 'experiments/quill/m0-evidence';
await mkdir(output, { recursive: true });
const vite = await createServer({ optimizeDeps: { entries: ['src/features/quill/browser.html'] }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{
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
    await evaluate(`(async()=>{const text=q.sourceNode(),mount=q.editor.mounts.get(text.key);window.typingProof={editor:q.editor,session:q.session,text,mount,flow:mount.root.querySelector('.reactive-standoff-flow')??mount.root,extraRoots:[...document.querySelectorAll('[data-block-id^="unrelated-"]'),...document.querySelectorAll('.quill-application nav')]};window.caretProbe=await import('/experiments/initialis-adapter/browser.js');await caretProbe.setup(typingProof);window.typingBefore=q.text();})()`);
    const handlers = await evaluate('caretProbe.handlers()');
    await evaluate('typingProof.mount.focus();typingProof.mount.restoreInlineSelection({anchor:100,head:100});caretProbe.startCounters()');
    for (let i = 0; i < 20; i++) {
      const key = i % 2 ? 'Backspace' : 'x';
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key === 'x' ? 'KeyX' : key, windowsVirtualKeyCode: key === 'x' ? 88 : 8, ...(type === 'keyDown' && key === 'x' ? { text: key } : {}) }, sessionId);
      await frame();
    }
    const trusted = await evaluate('caretProbe.stopCounters()');
    check('Flint benchmark typing retains text and caret', await evaluate('q.text()===typingBefore && typingProof.mount.captureInlineSelection().head===100'));
    check('Flint benchmark has bounded canonical work', ['fullValidation', 'broadPlanning', 'snapshots', 'requests', 'projectionBuilds', 'paragraphTextWalks', 'unrelatedGeometry', 'unrelatedMutations'].every(k => trusted.counts[k] === 0), trusted.counts);
    return { handlers, trusted };
  };
  report.browser = await send('Browser.getVersion');
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1450, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: `http://127.0.0.1:${vite.httpServer.address().port}/src/features/quill/browser.html` }, sessionId);
  await wait('window.quillProof && quillProof.sourceNode()');
  await evaluate('window.q=quillProof;void 0');
  report.typingBefore = await typing();
  await evaluate('window.original={native:q.native(),key:q.record(q.sourcePlacement).key,properties:JSON.stringify(q.record(q.sourcePlacement).payload.standoffProperties)};q.open()');
  await wait('document.querySelector(".quill-confirm")');
  check('contextual opening preserves the source native Document',await evaluate('q.native()===original.native'));
  check('Flint and Quill coexist with separate commands and managed windows',await evaluate('q.editor.commandRegistry.owner("flint.open")==="flint" && q.editor.commandRegistry.owner("quill.open")==="quill" && q.port("quill").windowId()!==q.port("flint").windowId()'));
  await writeFile(path.join(output,'confirmation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  await evaluate('window.__quillCounters={fullValidation:0,broadPlanning:0};q.confirm()');await frame();
  check('confirmed conversion keeps native identity and annotations',await evaluate('q.wrapper() && q.record(q.sourcePlacement).key===original.key && JSON.stringify(q.record(q.sourcePlacement).payload.standoffProperties)===original.properties'));
  check('conversion uses bounded structural admission',await evaluate('__quillCounters.fullValidation===0 && __quillCounters.broadPlanning===0'),await evaluate('({...__quillCounters})'));
  await evaluate('delete window.__quillCounters');
  check('real application renders ordinary Blocks beside composition',await evaluate('document.querySelector(".quill-application").innerText.includes("An ordinary native paragraph") && !!document.querySelector(".quill-application .quill-composition [contenteditable=true]")'));
  await writeFile(path.join(output,'native-foundation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  await evaluate('q.close()');await frame();
  check('return activates the original managed window and text occurrence',await evaluate('q.editor.windowManager.registry.activeWindowId===q.port("flint").windowId() && q.editor.focus.state.focusedKey===q.sourceNode().key'));
  report.typingAfter = await typing();
  // Trusted paired typing is already restored; use a new edit to verify native annotation/history behavior.
  await evaluate('window.beforeEdit=q.text();q.editor.commands.replaceInlineRange(q.sourcePlacement,0,0,"Listen ")');await frame();
  check('composition text edits rebase native annotations',await evaluate('q.record(q.sourcePlacement).payload.standoffProperties.find(p=>p.id==="entity-raven").start===11'));
  await evaluate('q.editor.repository.undo()');await frame();check('native Undo restores edited text',await evaluate('q.text()===beforeEdit'));
  await evaluate('q.editor.repository.redo()');await frame();check('native Redo restores edit',await evaluate('q.text().startsWith("Listen ")'));
  await evaluate('q.editor.focus.request(q.sourceNode().key);q.open()');await frame();
  check('reopening existing composition does not request another conversion',await evaluate('document.querySelectorAll(".quill-confirm").length===0 && !!q.sourceNode("quill")'));
  await evaluate('window.beforeNew=q.port("quill").application.properties().id;q.newDocument()');await frame();
  check('Quill creates an ordinary native Document and keeps original available',await evaluate('q.port("quill").application.properties().id!==beforeNew && q.port("quill").application.documents().some(d=>d.id===beforeNew)'));
  await evaluate('q.session.selectPresentation("textual")');
  await wait('q.sourceNode() && q.editor.mounts.get(q.sourceNode().key)?.root.closest(".tw-flint")');
  await evaluate('q.editor.focus.request(q.sourceNode().key);window.beforeTextual=q.native();q.open()');await frame();
  check('Textual invocation opens Quill on the visible Desktop',await evaluate('q.session.presentation.active()==="desktop" && q.editor.windowManager.registry.activeWindowId===q.port("quill").windowId()'));
  await evaluate('q.close()');
  await wait('q.session.presentation.active()==="textual" && q.editor.focus.state.focusedKey===q.sourceNode().key && q.editor.mounts.get(q.sourceNode().key)?.root.closest(".tw-flint")');
  check('Return restores Textual and the original retained source occurrence',await evaluate('!q.editor.mounts.get(q.sourceNode().key).root.closest("[hidden],[inert]")'));
  check('presentation handoff leaves source native bytes unchanged',await evaluate('q.native()===beforeTextual'));
  await writeFile(path.join(output,'textual-return.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  report.note='M0 native foundation only. No direct SVG typing or path handles. Real Flint trusted-input probes include 200 unrelated paragraphs; timings are headless diagnostics, not a production latency guarantee. Persistence is tested separately through the real native server.';
} catch (error) { report.error = String(error); throw error; }
finally {
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
  socket?.close();
  if (chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited; }
  await vite.close(); await rm(profile, { recursive: true, force: true });
}
console.log(JSON.stringify({checks:report.checks.length,errors:report.errors.length},null,2));
