// Original investigation harness. Creates only an isolated Chrome profile and evidence files.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const output = process.env.QUILL_OUTPUT ?? 'experiments/quill/m1-evidence';
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
    await evaluate(`(async()=>{const text=q.sourceNode(),mount=q.editor.mounts.get(text.key);window.typingProof={keyEventTarget:window,editor:q.editor,session:q.session,text,mount,flow:mount.root.querySelector('.reactive-standoff-flow')??mount.root.querySelector('[data-quill-fragment]'),inputElement:mount.focusElement,extraRoots:[...document.querySelectorAll('[data-block-id^="unrelated-"]'),...document.querySelectorAll('.quill-application nav'),...document.querySelectorAll('[data-block-id^=stress-source]')]};window.caretProbe=await import('/experiments/initialis-adapter/browser.js');await caretProbe.setup(typingProof);window.typingBefore=q.text();})()`);
    const handlers = await evaluate('caretProbe.handlers()');
    await evaluate('typingProof.mount.focus();typingProof.mount.restoreInlineSelection({anchor:100,head:100});caretProbe.startCounters()');
    for (let i = 0; i < 20; i++) {
      const key = i % 2 ? 'Backspace' : 'x';
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key === 'x' ? 'KeyX' : key, windowsVirtualKeyCode: key === 'x' ? 88 : 8, ...(type === 'keyDown' && key === 'x' ? { text: key } : {}) }, sessionId);
      await frame();
    }
    const trusted = await evaluate('caretProbe.stopCounters()');
    check('Flint benchmark records all insert and delete samples', handlers.samples.length === 20 && trusted.marks.length === 20 && trusted.marks.filter(m => m.key === 'Backspace').length === 10);
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
  check('real application renders ordinary Blocks beside composition',await evaluate('document.querySelector(".quill-application").innerText.includes("An ordinary native paragraph") && !!document.querySelector(".quill-application .quill-composition .quill-canvas")'));
  await writeFile(path.join(output,'native-foundation.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  await evaluate(`window.wrapperNode=q.port('quill').session().projection.nodeForPlacement([...q.editor.repository.ownedPlacementKeys(q.wrapper().key)][0]);window.c=structuredClone(q.wrapper().payload.quill);c.paths[0]={...c.paths[0],kind:'sine',amplitude:22,cycles:1};q.editor.commands.setPayloadField(wrapperNode.key,'quill',c);window.source=q.sourceNode('quill');window.surface=q.editor.mounts.get(source.key);`);
  await frame();
  const key=async(key,code=key,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,modifiers},sessionId);await frame();};
  const click=async(index)=>{
    const p=await evaluate(`(()=>{const svg=surface.root.querySelector('.quill-canvas'),glyph=[...svg.querySelectorAll('[data-quill-offset]')].find(g=>Number(g.getAttribute('data-quill-offset'))+Number(g.parentElement.getAttribute('data-quill-fragment'))===${index}),m=glyph.getScreenCTM(),p=new DOMPoint(-glyph.getBBox().width/2,-7).matrixTransform(m);return {x:p.x,y:p.y};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},sessionId);await frame();
  };
  await click(10);
  check('trusted click on curved text selects canonical boundary',await evaluate('surface.captureInlineSelection().head===10'),await evaluate('surface.captureInlineSelection()'));
  await evaluate('window.editBefore=q.text()');
  await send('Input.insertText',{text:'NEW '},sessionId);await frame();
  check('trusted input inserts directly on curved SVG',await evaluate('q.text()===editBefore.slice(0,10)+"NEW "+editBefore.slice(10)'));
  await key('Backspace');await key('Delete');
  check('trusted deletion keeps canonical identity',await evaluate('q.record(q.sourcePlacement).key===original.key && q.text()===editBefore.slice(0,10)+"NEW"+editBefore.slice(11)'));
  await key('ArrowRight','ArrowRight',8);await key('ArrowRight','ArrowRight',8);
  await send('Input.insertText',{text:'replacement'},sessionId);await frame();
  check('shift selection and replacement use the native range',await evaluate('q.text().includes("NEWreplacement")'));
  await evaluate('window.edited=q.text()');await key('z','KeyZ',4);check('native keyboard Undo reverses SVG edit',await evaluate('q.text()!==edited'));await key('z','KeyZ',12);check('native keyboard Redo restores SVG edit',await evaluate('q.text()===edited'));
  await writeFile(path.join(output,'direct-editing.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  await evaluate(`c=structuredClone(q.wrapper().payload.quill);c.paths[0].width=400;q.editor.commands.setPayloadField(wrapperNode.key,'quill',c);surface.root.querySelectorAll('button')[2].click();window.geometryBefore=JSON.stringify(q.wrapper().payload.quill);window.textBeforeGeometry=q.text();`);await frame();
  check('three linked sine paths render continuous canonical text',await evaluate('surface.root.querySelectorAll("[data-quill-fragment]").length===3 && q.wrapper().payload.quill.flows[0].pathIds.length===3'),await evaluate('({config:q.wrapper().payload.quill,fragments:surface.root.querySelectorAll("[data-quill-fragment]").length,text:q.text(),buttons:[...surface.root.querySelectorAll("button")].map(b=>b.textContent),status:surface.root.innerText})'));
  const numeric=async(name,value)=>{await evaluate(`(()=>{const field=surface.root.querySelector('input[aria-label="${name}"]');field.value='${value}';field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));})()`);await frame();};
  await numeric('amplitude',35);await numeric('cycles',2);
  check('inspector commits native amplitude and frequency',await evaluate('q.wrapper().payload.quill.paths[0].amplitude===35 && q.wrapper().payload.quill.paths[0].cycles===2 && q.text()===textBeforeGeometry'));
  const handle=await evaluate(`(()=>{const h=surface.root.querySelector('[data-handle="length"]'),p=new DOMPoint(Number(h.getAttribute('cx')),Number(h.getAttribute('cy'))).matrixTransform(h.getScreenCTM());return {x:p.x,y:p.y};})()`);
  await evaluate('window.widthBefore=q.wrapper().payload.quill.paths[0].width;window.revisionBefore=q.editor.repository.state.revision');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...handle,button:'left',clickCount:1},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:handle.x-70,y:handle.y,button:'left',buttons:1},sessionId);await frame();
  check('handle drag previews without canonical mutation',await evaluate('q.editor.repository.state.revision===revisionBefore && q.wrapper().payload.quill.paths[0].width===widthBefore'));
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:handle.x-70,y:handle.y,button:'left',clickCount:1},sessionId);await frame();
  check('handle release commits one undoable geometry edit',await evaluate('q.editor.repository.state.revision===revisionBefore+1 && q.wrapper().payload.quill.paths[0].width<widthBefore'));
  await evaluate('q.editor.repository.undo()');await frame();check('geometry Undo restores original length',await evaluate('q.wrapper().payload.quill.paths[0].width===widthBefore'));await evaluate('q.editor.repository.redo()');await frame();check('geometry Redo restores handle result',await evaluate('q.wrapper().payload.quill.paths[0].width<widthBefore'));
  await writeFile(path.join(output,'path-handles.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  await evaluate(`surface.root.querySelector('button').click();surface.focus();surface.restoreInlineSelection({anchor:0,head:0});window.flowBefore=[...surface.root.querySelectorAll('[data-quill-fragment]')].map(e=>e.textContent);window.textBeforeReflow=q.text();`);
  await send('Input.insertText',{text:'Early words redistribute the paragraph. '},sessionId);await frame();
  check('trusted insertion reflows downstream linked paths',await evaluate('surface.root.querySelectorAll("[data-quill-fragment]")[1].textContent!==flowBefore[1] && q.text().endsWith(textBeforeReflow)'));
  await evaluate('surface.restoreInlineSelection({anchor:0,head:40})');await key('Backspace');
  check('deletion reverses downstream reflow',await evaluate('q.text()===textBeforeReflow && surface.root.querySelectorAll("[data-quill-fragment]")[1].textContent===flowBefore[1]'));
  await writeFile(path.join(output,'linked-reflow.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  // Pointer range selection is exercised with trusted mouse dragging across glyphs.
  const glyphPoint=async(index)=>evaluate(`(()=>{const g=[...surface.root.querySelectorAll('[data-quill-offset]')].find(g=>Number(g.getAttribute('data-quill-offset'))+Number(g.parentElement.getAttribute('data-quill-fragment'))===${index}),p=new DOMPoint(-g.getBBox().width/2,-7).matrixTransform(g.getScreenCTM());return {x:p.x,y:p.y};})()`);
  const from=await glyphPoint(4),to=await glyphPoint(9);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...to,button:'left',buttons:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',clickCount:1},sessionId);await frame();
  check('trusted pointer drag maps the native selected range',await evaluate('surface.captureInlineSelection().anchor===4 && surface.captureInlineSelection().head===9'),await evaluate('surface.captureInlineSelection()'));
  await evaluate(`[...surface.root.querySelectorAll('button')].find(b=>b.textContent==='Italic').click();[...surface.root.querySelectorAll('button')].find(b=>b.textContent==='Gloss').click();`);await frame();
  check('curved range opens the native Gloss editor',await evaluate('!!document.querySelector("textarea[aria-label=Gloss]")'));
  await send('Input.insertText',{text:'note: a curved native range'},sessionId);await key('Enter');
  check('native Gloss commit and overlapping entity annotation display on the curve',await evaluate('q.record(q.sourcePlacement).payload.standoffProperties.filter(p=>p.type==="mutable/gloss").length>=2 && !!surface.root.querySelector(`.quill-range-effects [data-property-type="mutable/gloss"]`) && !!surface.root.querySelector(`.quill-range-effects [data-property-type="codex/entity-reference"]`)'),await evaluate('({properties:q.record(q.sourcePlacement).payload.standoffProperties,dialog:document.querySelector(".gloss-input")?.innerText,notice:q.editor.gloss.notice(),effects:[...surface.root.querySelectorAll(".quill-range-effects [data-property-type]")].map(e=>e.getAttribute("data-property-type"))})'));
  const rects=await evaluate('q.editor.measurements.rangeRects(source.key,4,9,performance.now()).map(r=>({x:r.x,y:r.y,w:r.width,h:r.height}))');check('native popup range geometry follows SVG coordinates',rects.length===5&&rects.every(r=>r.w>0&&r.h>0),rects);
  await evaluate('surface.focus();surface.restoreInlineSelection({anchor:4,head:9});window.clipboardData=new DataTransfer();surface.focusElement.dispatchEvent(new ClipboardEvent("copy",{bubbles:true,cancelable:true,clipboardData:clipboardData}));');
  check('SVG clipboard contains canonical selected text',await evaluate('clipboardData.getData("text/plain")===q.text().slice(4,9)'));
  await evaluate('window.beforeUnsupported=q.native();surface.focusElement.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertText",data:"🙂"}));');check('unsupported Unicode input leaves native bytes intact',await evaluate('q.native()===beforeUnsupported'));
  await evaluate(`window.geometryStable=JSON.stringify(q.wrapper().payload.quill);[...surface.root.querySelectorAll('button')].find(b=>b.textContent==='Paths').click();const field=surface.root.querySelector('input[aria-label=amplitude]');field.focus();field.value='48';field.dispatchEvent(new Event('input',{bubbles:true}));`);await key('Escape');
  check('Escape cancels numeric preview without a geometry commit',await evaluate('JSON.stringify(q.wrapper().payload.quill)===geometryStable && surface.root.querySelector("input[aria-label=amplitude]").value==="35"'));
  await evaluate(`[...surface.root.querySelectorAll('button')].find(b=>b.textContent==='Text').click();surface.root.style.transform='scale(.85)';surface.root.style.transformOrigin='left top';`);await frame();await click(5);
  check('scaled SVG hit testing retains canonical coordinates',await evaluate('surface.captureInlineSelection().head===5'));
  await evaluate(`surface.root.style.transform='';window.scroller=surface.root.closest('.quill-composition');window.scrollStyle=scroller.style.cssText;scroller.style.maxHeight='240px';scroller.style.overflow='auto';scroller.scrollTop=60;`);await frame();await click(5);
  check('scrolling moves text and local range geometry together',await evaluate('scroller.scrollTop>0 && surface.captureInlineSelection().head===5'));
  await evaluate(`scroller.style.cssText=scrollStyle;window.pathBuilds=surface.root.quillDiagnostics().pathBuilds;window.fontReads=surface.root.quillDiagnostics().measurements;surface.root.dispatchEvent(new CustomEvent('mutable:font-layout',{bubbles:true}));`);await frame();
  check('font invalidation refreshes metrics while retaining path geometry',await evaluate('surface.root.quillDiagnostics().measurements>fontReads && surface.root.quillDiagnostics().pathBuilds===pathBuilds'));
  await writeFile(path.join(output,'native-annotations.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  await evaluate('window.beforeReturn=q.native();q.close()');await frame();check('return preserves the original Flint composition position and native state',await evaluate('q.native()===beforeReturn && q.editor.focus.state.focusedKey===q.sourceNode().key && !!q.editor.mounts.get(q.sourceNode().key).root.querySelector(".quill-canvas")'));
  report.typingAfter=await typing();
  await evaluate('q.open()');await frame();check('reopen continues editing the same native source',await evaluate('q.record(q.sourcePlacement).key===original.key && !document.querySelector(".quill-confirm")'));
  await evaluate(`source=q.sourceNode('quill');surface=q.editor.mounts.get(source.key);surface.focus();surface.restoreInlineSelection({anchor:0,head:0});`);await send('Input.insertText',{text:'Again '},sessionId);await frame();check('reopened SVG accepts trusted input',await evaluate('q.text().startsWith("Again ")'));await key('z','KeyZ',4);await key('z','KeyZ',12);
  // Stress: 5k characters, 40 linked paths, mixed/overlapping native ranges,
  // three other compositions and three mounted occurrences of every source.
  await evaluate(`window.longText='The raven follows the winding path through a garden of annotated words. '.repeat(72);q.editor.commands.replaceInlineRange(q.sourcePlacement,0,q.text().length,longText);c=JSON.parse(JSON.stringify(q.wrapper().payload.quill));c.paths=Array.from({length:40},(_,i)=>({id:'long-'+i,kind:'sine',x:20,y:50+i*64,width:720,amplitude:16,cycles:1.5,phase:0}));c.flows[0].pathIds=c.paths.map(p=>p.id);c.viewport.height=2650;q.editor.commands.setPayloadField(wrapperNode.key,'quill',c);window.annotations=Array.from({length:60},(_,i)=>({id:'stress-style-'+i,type:i%2?'style/italics':'style/bold',start:i*65,end:i*65+24}));annotations.push(...Array.from({length:30},(_,i)=>({id:'stress-entity-'+i,type:'codex/entity-reference',value:'entity-raven',start:i*120+4,end:i*120+45})));q.editor.commands.setPayloadField(q.sourcePlacement,'standoffProperties',annotations);`);await frame();
  await evaluate(`for(let i=0;i<3;i++)q.editor.commands.insert({id:'stress-composition-'+i,type:'mutable/svg-text-composition-block',quill:c,blockProperties:[{type:'codex/block-reference',value:'stress-source-'+i,metadata:{quillRole:'body'}}],children:[{id:'stress-source-'+i,type:'standoff-editor-block',text:longText,standoffProperties:annotations}]},{kind:'after',anchorKey:wrapperNode.key});`);await frame();
  await evaluate(`window.decorativeCount=0;for(const svg of document.querySelectorAll('.quill-canvas')){const layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.setAttribute('pointer-events','none');layer.setAttribute('data-quill-stress-decoration','');for(let i=0;i<100;i++){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M0 '+i*20+' Q300 '+(i*20+20)+' 760 '+i*20);p.setAttribute('fill','none');p.setAttribute('stroke','#c9b89a');p.setAttribute('opacity','.12');layer.append(p);decorativeCount++;}svg.prepend(layer);}`);await frame();
  await evaluate('q.close()');await frame();
  report.stress={characters:await evaluate('q.text().length'),paths:40,annotations:90,otherCompositions:3,unrelatedParagraphs:200,decorativePaths:await evaluate('decorativeCount'),mountedOccurrences:await evaluate('document.querySelectorAll("[data-block-id=quill-source] .quill-canvas").length')};
  await evaluate(`for(const root of document.querySelectorAll('[data-block-id="quill-source"]'))[...root.querySelectorAll('button')].find(b=>b.textContent==='Native text')?.click();`);await frame();
  report.typingStressNative=await typing();
  await evaluate(`for(const button of [...document.querySelectorAll('button')].filter(b=>b.textContent==='Return to SVG'))button.click();const layer=document.querySelector('[data-quill-stress-decoration]');if(layer)for(const svg of document.querySelectorAll('[data-block-id=quill-source] .quill-canvas'))svg.prepend(layer.cloneNode(true));`);await frame();
  if(process.env.QUILL_PROFILE){await send('Profiler.enable',{},sessionId);await send('Profiler.setSamplingInterval',{interval:200},sessionId);await send('Profiler.start',{},sessionId);}
  report.typingStress=await typing();
  if(process.env.QUILL_PROFILE){const profile=(await send('Profiler.stop',{},sessionId)).profile;await writeFile(path.join(output,'stress-profile.json'),JSON.stringify(profile));}
  check('stress fixture retains multiple independent SVG compositions',await evaluate('document.querySelectorAll(".quill-canvas").length>=8'));
  await writeFile(path.join(output,'stress-layout.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  report.note='M1 checkpoints 1–3: actual SVG input, linked geometry, native ranges and round-trip. Persistence is independently tested with mounted SVG input against a real temporary native store. Headless Chromium timings are diagnostics, not user-visible latency guarantees.';
} catch (error) { report.error = String(error); throw error; }
finally {
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
  socket?.close();
  if (chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited; }
  await vite.close(); await rm(profile, { recursive: true, force: true });
}
console.log(JSON.stringify({checks:report.checks.length,errors:report.errors.length},null,2));
