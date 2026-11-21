// No inference, keys, server persistence or user Documents. Actual native UI.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
const directory='artifacts/retrieval-c';await mkdir(directory,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'dcp-stream-proof-'));let server,browser,socket;
try{
 server=await createServer({cacheDir:'node_modules/.cache/dcp-stream-proof',server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-stream-proof',configureServer(s){s.middlewares.use((req,res,next)=>{
  if(req.url==='/__stream-proof'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><script type="module" src="/src/qualification/retrieval-c.browser.tsx"></script></body></html>');return;}
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:false,Error:'Isolated deterministic fixture'}));return;}next();
 });}}]});await server.listen();
 browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[...(process.env.DCP_HEADED==='1'?[]:['--headless=new']),'--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let data='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);browser.stderr.on('data',chunk=>{data+=chunk;const m=data.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});browser.once('error',reject);});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')console.error(JSON.stringify(m.params.exceptionDetails));const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.httpServer.address().port+'/__stream-proof'},sessionId);
 await evaluate(`(async()=>{for(let i=0;i<1600;i++){if(window.proof?.ready)return;await new Promise(r=>setTimeout(r,20));}throw Error('Fixture startup timeout')})()`);
 const result=await evaluate('proof.run()');console.log(JSON.stringify(result,null,2));await writeFile(path.join(directory,'browser.json'),JSON.stringify(result,null,2));
 await writeFile(path.join(directory,'scry.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
}finally{socket?.close();browser?.kill('SIGTERM');await server?.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
