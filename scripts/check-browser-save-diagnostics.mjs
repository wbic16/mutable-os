// Uses real IndexedDB in an isolated Chrome profile. Document navigation is
// intercepted: this never mounts the application or calls its storage APIs.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(path.join(tmpdir(), 'mutable-diagnostics-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.once('error', reject); setTimeout(() => reject(Error('Chrome startup timeout')), 15000).unref();
  });
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id, timeout = setTimeout(() => { pending.delete(requestId); reject(Error('Timed out: ' + method)); }, 30000);
    pending.set(requestId, { resolve: result => { clearTimeout(timeout); resolve(result); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    if (response.method === 'Fetch.requestPaused') {
      void send('Fetch.fulfillRequest', { requestId: response.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<!doctype html><title>Diagnostic proof</title>').toString('base64') }, response.sessionId);
      return;
    }
    const task = pending.get(response.id); if (!task) return; pending.delete(response.id);
    response.error ? task.reject(Error(JSON.stringify(response.error))) : task.resolve(response.result);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Fetch.enable', { patterns: [{ resourceType: 'Document', requestStage: 'Request' }] }, sessionId);
  const navigate = async () => {
    await send('Page.navigate', { url: (process.env.BENCHMARK_URL ?? 'http://localhost:3000') + '/diagnostic-proof.html' }, sessionId);
    for (let i = 0; i < 100; i++) {
      try { if (await evaluate('document.title === "Diagnostic proof"')) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Fixture navigation failed');
  };
  const load = `window.module = await import('/src/persistence/browser-save-diagnostics.ts');`;
  await navigate();
  const first = await evaluate(`(async()=>{${load}
    window.log = new module.BrowserSaveDiagnostics();
    log.record('native.network-failure',{filename:'test6.ink',error:module.diagnosticError(new TypeError('Failed to fetch')),native:'SECRET DOCUMENT',token:'SECRET TOKEN'});
    return await log.read();
  })()`);
  assert.equal(first.events.length, 1); assert.equal(first.events[0].error, 'network-request-failed');
  assert(!JSON.stringify(first).includes('SECRET'));
  await navigate();
  const retained = await evaluate(`(async()=>{${load}window.log=new module.BrowserSaveDiagnostics();return await log.read();})()`);
  assert.deepEqual(retained.events, first.events);
  const capped = await evaluate(`(async()=>{
    for(let i=0;i<250;i++){log.record('proof.event',{requestId:String(i)});if(i%25===0)await log.read();}
    return await log.read();
  })()`);
  assert.equal(capped.events.length, 200); assert.equal(capped.events.at(-1).requestId, '249');
  const expired = await evaluate(`(async()=>{
    const future=new module.BrowserSaveDiagnostics(()=>true,()=>Date.now()+8*24*60*60*1000);
    await future.read(); return await log.read();
  })()`);
  assert.equal(expired.events.length, 0);
  const disabled = await evaluate(`(async()=>{
    const off=new module.BrowserSaveDiagnostics(()=>false);off.record('disabled');await off.read();return await log.read();
  })()`);
  assert.equal(disabled.events.length, 0);
  // Storage failures are contained; only bounded in-session evidence remains.
  const failed = await evaluate(`(async()=>{
    Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){throw Error('PRIVATE STORAGE ERROR');}}});
    const broken=new module.BrowserSaveDiagnostics();broken.record('storage.failure');return await broken.read();
  })()`);
  assert.equal(failed.events.length, 1); assert.match(failed.storageError, /unavailable/); assert(!JSON.stringify(failed).includes('PRIVATE'));
  console.log(JSON.stringify({ reloadPersistence: true, metadataOnly: true, countCap: 200, expiryDays: 7, disabledWrites: 0, storageFailureContained: true }));
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGKILL'); await exited; }
  chrome.stdin?.destroy(); chrome.stdout?.destroy(); chrome.stderr?.destroy();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
