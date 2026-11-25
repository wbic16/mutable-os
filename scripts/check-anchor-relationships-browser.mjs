// Anchor Relationships browser qualification; isolated in-memory fixture.
// Node 22+, CHROME_BIN and ANCHOR_URL supported. Isolated Chrome profile,
// in-memory fixture, no document saves. ANCHOR_ARTIFACTS writes review evidence.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-anchor-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timeout: '+method));},20000);pending.set(requestId,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };


 const checks = [];
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };
 const close = (actual, expected, message) => assert.ok(Math.abs(actual-expected)<2, `${message}: ${actual} vs ${expected}`);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.ANCHOR_URL ?? 'http://127.0.0.1:5191/'},sessionId);
 await evaluate('new Promise(resolve => setTimeout(resolve, 1200))');
 await evaluate(`(async () => {
   const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
   const {registerApplicationViews}=await import('/src/application/features.ts');
   const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
   const source=await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const {render,createComponent}=await import(source.split('"').find(part=>part.includes('/solid-js_web.js')));
   window.makeAnchorFixture = (scale=1, enabled=true, saved) => {
     window.anchorCheck?.dispose();window.anchorCheck?.editor.dispose();
     const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:relative;padding:0;height:100vh';document.body.replaceChildren(host);
     const surface=host.appendChild(document.createElement('div'));surface.style.cssText='transform-origin:top left;transform:scale('+scale+');width:1400px;height:950px';
     const editor=new ReactiveEditor(saved ?? {id:'win',type:'document-window-block',metadata:{size:{w:760,h:460},position:{x:120,y:70},state:'normal'},children:[{id:'doc',type:'document-block',children:[{id:'page',type:'page-block',children:[
       {id:'a',type:'standoff-editor-block',text:'Anchor paragraph with ordinary editable text.',standoffProperties:[{id:'effect',type:'style/rainbow',start:0,end:6}]},
       {id:'b',type:'sticky-note-block',metadata:{anchor:{version:1,blockId:'a',offset:{x:-110,y:65}},size:{width:240,height:160}},children:[{id:'note-text',type:'standoff-editor-block',text:'Editable anchored note.',standoffProperties:[{id:'note-effect',type:'style/rainbow',start:0,end:7}]}]},
       {id:'plain',type:'plain-text-block',text:'Plain text proof'},
       {id:'image',type:'image-block',metadata:{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}},
       ...Array.from({length:24},(_,i)=>({id:'f'+i,type:'standoff-editor-block',text:'Paragraph '+i+' provides scrollable content and reflow.'}))
     ]}]}]}, {features:{anchorRelationships:enabled}});
     registerApplicationViews(editor);const projection=editor.createView('anchor-browser');
     const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection,coordinates:{scale:()=>scale}}),surface);editor.installGateway(document);
     const node=id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id);
     const root=id=>editor.mounts.get(node(id).key)?.root;
     window.anchorCheck={editor,projection,host,dispose,node,root,scale,frame:()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,40))))};
   };
 })()`);
 const frame = () => evaluate('anchorCheck.frame()');
 const geometry = () => evaluate(`(()=>{const p=anchorCheck,a=p.root('a').getBoundingClientRect(),b=p.root('b').getBoundingClientRect(),overlay=p.root('b').closest('[data-positioned-block]');return {a:a.toJSON(),b:b.toJSON(),hidden:overlay?.hidden,roots:p.host.querySelectorAll('[data-block-id="b"]').length,anchor:JSON.parse(JSON.stringify(p.node('b').payload.metadata.anchor))}})()`);
 const click = async (x,y) => { await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1},sessionId); };
 if (process.env.ANCHOR_REMOVED === '1') {
   await evaluate('makeAnchorFixture(1,true)');await frame();
   check('physically absent feature keeps B in flow',await evaluate(`!anchorCheck.root('b').closest('[data-positioned-block]')`),true);
   check('physically absent feature retains anchor metadata',await evaluate(`anchorCheck.node('b').payload.metadata.anchor.blockId`),'a');
   await evaluate(`(()=>{const p=anchorCheck,m=p.editor.mounts.get(p.node('note-text').key);m.focus();m.restoreInlineSelection({anchor:0,head:0})})()`);
   await send('Input.insertText',{text:'Removal proof '},sessionId);await frame();
   check('physically absent feature remains editable',await evaluate(`anchorCheck.editor.encodeDocument().children[0].children[0].children.find(n=>n.id==='b').children[0].text.startsWith('Removal proof ')`),true);
   await evaluate(`(()=>{window.anchorSaved=anchorCheck.editor.encodeDocument();makeAnchorFixture(1,true,window.anchorSaved)})()`);await frame();
   check('physically absent feature round-trips unknown record',await evaluate(`JSON.parse(JSON.stringify(anchorCheck.node('b').payload.metadata.anchor))`),{version:1,blockId:'a',offset:{x:-110,y:65}});
 } else {
 // Exercise the actual entry path with Grouping enabled, not just saved fixtures.
 await evaluate('makeAnchorFixture(1)');await frame();
 const menuPoint=await evaluate(`(()=>{const r=anchorCheck.root('a').querySelector('[data-inline-key]:nth-child(2)').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...menuPoint,button:'left',buttons:1,clickCount:1,modifiers:2},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...menuPoint,button:'left',buttons:0,clickCount:1,modifiers:2},sessionId);await frame();
 check('Control-click opens Block menu with Grouping enabled',await evaluate(`document.querySelectorAll('.reactive-block-menu').length`),1);
 await evaluate(`(()=>{const find=label=>[...document.querySelectorAll('.reactive-block-menu button')].find(b=>b.textContent.replace(/[›‹]/g,'').trim()===label);find('Add Block').click();find('Insert Sticky Note Here').click()})()`);await frame();
 check('context menu inserts inline StickyNote',await evaluate(`Object.values(anchorCheck.projection.state.nodes).filter(n=>n.viewType==='sticky-note-block').length`),2);
 await evaluate(`(()=>{const p=anchorCheck,n=Object.values(p.projection.state.nodes).find(n=>n.viewType==='sticky-note-block'&&n.payload.id!=='b');window.createdNoteKey=n.key;const root=p.editor.mounts.get(n.key).root;root.querySelector(':scope > [data-block-selection-handle]').click();const select=document.querySelector('[aria-label="Anchor Block"]');select.value=p.node('a').key;select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await frame();
 check('new note can be anchored through the selection inspector',await evaluate(`anchorCheck.editor.node(createdNoteKey).payload.metadata.anchor.blockId`),'a');
 check('new note has one live portaled view',await evaluate(`!!anchorCheck.editor.mounts.get(createdNoteKey).root.closest('[data-positioned-block]')`),true);
 for (const scale of [.5,1,2]) {
   await evaluate(`makeAnchorFixture(${scale})`);await frame();
   let g=await geometry();
   check('one ordinary live B at '+scale,g.roots,1);check('visible anchor at '+scale,g.hidden,false);
   close(g.b.left-g.a.left,-110*scale,'scaled x');close(g.b.top-g.a.top,65*scale,'scaled y');
   await evaluate(`(()=>{const p=anchorCheck;p.savedRoot=p.root('b');p.scroller=p.host.querySelector('.reactive-window__content');p.scroller.scrollTop=500})()`);await frame();
   check('offscreen anchor hides B at '+scale,(await geometry()).hidden,true);
   check('offscreen keeps single view at '+scale,await evaluate(`anchorCheck.root('b')===anchorCheck.savedRoot`),true);
   await evaluate('anchorCheck.scroller.scrollTop=0');await frame();
   check('return restores B at '+scale,(await geometry()).hidden,false);
   await evaluate(`(()=>{const p=anchorCheck;p.editor.commands.insert({id:'inserted',type:'standoff-editor-block',text:'New paragraph above anchor.'},{kind:'before',anchorKey:p.node('a').key})})()`);await frame();
   g=await geometry();close(g.b.top-g.a.top,65*scale,'reflow y');
   await evaluate(`(()=>{const p=anchorCheck;const meta=JSON.parse(JSON.stringify(p.node('win').payload.metadata));p.editor.commands.setPayloadField(p.node('win').key,'metadata',{...meta,position:{x:170,y:90}})})()`);await frame();
   g=await geometry();close(g.b.left-g.a.left,-110*scale,'window move x');
   await evaluate(`(()=>{const p=anchorCheck;p.editor.blockSelection.select(p.node('b').key);const select=document.querySelector('[aria-label="Anchor Block"]');select.value=p.node('doc').key;select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await frame();
   const docBefore=(await geometry()).b;
   await evaluate('anchorCheck.scroller.scrollTop=500');await frame();
   g=await geometry();check('Document anchor visible during scroll at '+scale,g.hidden,false);close(g.b.top,docBefore.top,'Document stable y');close(g.b.left,docBefore.left,'Document stable x');
   await evaluate(`(()=>{const p=anchorCheck;p.editor.repository.undo()})()`);await frame();
   check('undo reattaches offscreen paragraph at '+scale,(await geometry()).hidden,true);
   await evaluate('anchorCheck.scroller.scrollTop=0');await frame();
 }
 await evaluate('makeAnchorFixture(1)');await frame();
 // Native text entry uses the existing standoff gateway in the portaled note.
 await evaluate(`(()=>{const p=anchorCheck,m=p.editor.mounts.get(p.node('note-text').key);m.focus();m.restoreInlineSelection({anchor:22,head:22});p.beforeTyping=p.root('b')})()`);
 await send('Input.insertText',{text:' Typed.'},sessionId);await frame();
 check('native typing in existing portaled editor',await evaluate(`anchorCheck.editor.encodeDocument().children[0].children[0].children.find(n=>n.id==='b').children[0].text.includes('Typed.')`),true);
 check('typing does not remount B',await evaluate(`anchorCheck.root('b')===anchorCheck.beforeTyping`),true);
 check('portaled standoff SVG effect renders',await evaluate(`!!anchorCheck.root('note-text').querySelector('[data-property-type="style/rainbow"]')`),true);
 await send('Input.imeSetComposition',{text:'語',selectionStart:1,selectionEnd:1},sessionId);
 check('portaled editor enters IME composition',await evaluate(`!!anchorCheck.editor.mounts.get(anchorCheck.node('note-text').key).composing`),true);
 await send('Input.insertText',{text:'語'},sessionId);await frame();
 check('portaled editor commits IME text',await evaluate(`anchorCheck.editor.encodeDocument().children[0].children[0].children.find(n=>n.id==='b').children[0].text.includes('語')`),true);
 await evaluate(`(()=>{const p=anchorCheck,m=p.editor.mounts.get(p.node('note-text').key);m.focus();m.restoreInlineSelection({anchor:0,head:8});window.fetchBeforeAnchor=window.fetch;window.fetch=async url=>String(url).startsWith('/api/')?({ok:true,json:async()=>({Success:true,Results:[],Count:0,Page:1,MaxPage:1})}):fetchBeforeAnchor(url)})()`);
 const key=(key,code,modifiers=0,type='keyDown')=>send('Input.dispatchKeyEvent',{key,code,modifiers,type},sessionId);
 await key(';','Semicolon',2);await key(';','Semicolon',0,'keyUp');await key('r','KeyR');await key('r','KeyR',0,'keyUp');
 await evaluate('new Promise(r=>setTimeout(r,450))');
 check('Entity panel opens from portaled selection',await evaluate(`document.querySelector('.reactive-entity-search input[aria-label="Search entities"]')?.value`),'Editable');
 await key('Escape','Escape');await key('Escape','Escape',0,'keyUp');await frame();
 check('Entity close restores portaled selection',await evaluate('document.getSelection().toString()'),'Editable');
 check('Entity close restores portaled editor focus',await evaluate(`document.activeElement===anchorCheck.editor.mounts.get(anchorCheck.node('note-text').key).focusElement`),true);
 await evaluate('window.fetch=window.fetchBeforeAnchor');
 // Begin a real pointer-capture drag, scroll A out, then complete normally.
 const grip=await evaluate(`(()=>{const r=document.querySelector('.anchor-drag-handle').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...grip,button:'left',buttons:1,clickCount:1},sessionId);
 await evaluate(`anchorCheck.host.querySelector('.reactive-window__content').scrollTop=500`);await frame();
 check('active drag retains offscreen presentation',(await geometry()).hidden,false);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x+30,y:grip.y+20,button:'left',buttons:1},sessionId);await frame();
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:grip.x+30,y:grip.y+20,button:'left',buttons:0,clickCount:1},sessionId);await frame();
 check('completion restores offscreen visibility',(await geometry()).hidden,true);
 check('drag committed anchor-local offset',(await geometry()).anchor.offset.x,-80);
 await evaluate('anchorCheck.editor.repository.undo()');await frame();
 check('one undo restores drag offset',(await geometry()).anchor.offset,{x:-110,y:65});
 await evaluate(`(()=>{const p=anchorCheck;p.saved=p.editor.encodeDocument();window.anchorSaved=p.saved;p.editor.commands.remove(p.node('a').key)})()`);await frame();
 check('deleted anchor falls back to structural rendering',await evaluate(`!anchorCheck.root('b').closest('[data-positioned-block]')`),true);
 await evaluate('anchorCheck.editor.repository.undo()');await frame();
 check('undo resolves anchored presentation',await evaluate(`!!anchorCheck.root('b').closest('[data-positioned-block]')`),true);
 await evaluate('makeAnchorFixture(1,false,window.anchorSaved)');await frame();
 check('feature absent uses ordinary Block view',await evaluate(`!anchorCheck.root('b').closest('[data-positioned-block]')`),true);
 check('feature absent preserves metadata',await evaluate(`anchorCheck.node('b').payload.metadata.anchor.blockId`),'a');
 await evaluate('makeAnchorFixture(1,true,window.anchorSaved)');await frame();
 check('reopen restores anchor',await evaluate(`!!anchorCheck.root('b').closest('[data-positioned-block]')`),true);
 // The same controls and renderer route accept plain text and image Blocks.
 for (const id of ['plain','image']) {
   await evaluate(`(()=>{const p=anchorCheck;p.editor.blockSelection.select(p.node('${id}').key);const select=document.querySelector('[aria-label="Anchor Block"]');select.value=p.node('doc').key;select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await frame();
   check(id+' uses generic presentation',await evaluate(`!!anchorCheck.root('${id}').closest('[data-positioned-block]')`),true);
   check(id+' retains selection controls after attach',await evaluate(`!!document.querySelector('[aria-label="Anchor offset x"]')`),true);
   await evaluate(`(()=>{const input=document.querySelector('[aria-label="Anchor offset x"]');input.value='-90';input.dispatchEvent(new Event('change',{bubbles:true}))})()`);await frame();
   check(id+' numeric offset persisted',await evaluate(`anchorCheck.node('${id}').payload.metadata.anchor.offset.x`),-90);
   if(id==='plain') {
     await evaluate(`(()=>{const m=anchorCheck.editor.mounts.get(anchorCheck.node('plain').key);m.focus();m.focusElement.setSelectionRange(0,0)})()`);
     await send('Input.insertText',{text:'Native '},sessionId);await frame();
     check('anchored native textarea editing',await evaluate(`anchorCheck.node('plain').payload.text.startsWith('Native ')`),true);
   }
 }
 // Numeric movement, native text input and geometry changes do not grow an idle loop.
 await frame();await evaluate(`(()=>{const p=anchorCheck;p.reads=0;const original=p.editor.measurements.blockRect.bind(p.editor.measurements);p.editor.measurements.blockRect=(...args)=>{p.reads++;return original(...args)}})()`);
 await evaluate('new Promise(r=>setTimeout(r,250))');
 check('no geometry polling while idle',await evaluate('anchorCheck.reads'),0);
 await evaluate('makeAnchorFixture(1)');await frame();
 const beginDrag = async () => {
   const point=await evaluate(`(()=>{const r=document.querySelector('.anchor-drag-handle').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+40,y:point.y+20,button:'left',buttons:1},sessionId);await frame();return point;
 };
 let point=await beginDrag();
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+40,y:point.y+20,button:'left',buttons:0,clickCount:1},sessionId);await frame();
 check('Escape cancels drag without saving',(await geometry()).anchor.offset,{x:-110,y:65});
 point=await beginDrag();
 await evaluate(`anchorCheck.editor.commands.remove(anchorCheck.node('a').key)`);await frame();
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+40,y:point.y+20,button:'left',buttons:0,clickCount:1},sessionId);await frame();
 check('target deletion cancels drag without saving',await evaluate(`JSON.parse(JSON.stringify(anchorCheck.node('b').payload.metadata.anchor.offset))`),{x:-110,y:65});
 check('target deletion restores ordinary B',await evaluate(`!anchorCheck.root('b').closest('[data-positioned-block]')`),true);
 await evaluate('anchorCheck.editor.repository.undo()');await frame();
 // Existing Compact and window resize mechanics still update the anchor frame.
 await evaluate(`(()=>{const p=anchorCheck,meta=JSON.parse(JSON.stringify(p.node('win').payload.metadata));p.editor.commands.setPayloadField(p.node('win').key,'metadata',{...meta,size:{w:620,h:420}})})()`);await frame();
 let g=await geometry();close(g.b.left-g.a.left,-110,'resize x');close(g.b.top-g.a.top,65,'resize y');
 await evaluate(`document.querySelector('[aria-label="Compact document"]').click()`);await frame();
 g=await geometry();close(g.b.left-g.a.left,-110,'Compact x');close(g.b.top-g.a.top,65,'Compact y');
 checks.push('resize and Compact preserve anchor-local placement');
 await evaluate(`document.querySelector('[aria-label="Minimize window"]').click()`);await frame();
 check('minimizing Window leaves no anchored overlay',await evaluate(`document.querySelectorAll('[data-positioned-block]').length`),0);
 await evaluate('anchorCheck.editor.repository.undo()');await frame();
 check('restoring Window restores anchored presentation',await evaluate(`!!anchorCheck.root('b')?.closest('[data-positioned-block]')`),true);
 }
 const result={checks,passed:checks.length};
 if(process.env.ANCHOR_ARTIFACTS) {
   await mkdir(process.env.ANCHOR_ARTIFACTS,{recursive:true});
   const name=process.env.ANCHOR_REMOVED==='1'?'removal':'browser';
   await writeFile(path.join(process.env.ANCHOR_ARTIFACTS,name+'-results.json'),JSON.stringify(result,null,2)+'\n');
   const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);
   await writeFile(path.join(process.env.ANCHOR_ARTIFACTS,name+'.png'),Buffer.from(screenshot.data,'base64'));
 }
 console.log(JSON.stringify(result,null,2));
} finally {
  // Finish the CDP close handshake before killing Chrome. Otherwise Node's
  // WebSocket can retain a closing socket after all assertions have finished.
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.close();
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
