import {afterEach,describe,expect,it,vi} from 'vitest';
import {runInterchange} from './interchange-worker';

/** Minimal Worker stand-in: replays a scripted sequence of messages when the
 * request is posted, mirroring how a library evaluated inside the real worker
 * can interleave its own protocol messages with the operations reply. */
class ScriptedWorker {
  onmessage:((event:{data:unknown})=>void)|null=null;
  onerror:(()=>void)|null=null;
  constructor(private readonly messages:unknown[]){}
  postMessage(){queueMicrotask(()=>{for(const data of this.messages)this.onmessage?.({data});});}
  terminate(){}
}

const script=(messages:unknown[])=>{vi.stubGlobal('Worker',class extends ScriptedWorker{constructor(){super(messages);}});};
afterEach(()=>vi.unstubAllGlobals());

describe('runInterchange',()=>{
 it('ignores foreign worker messages and resolves the operations reply',async()=>{
  script([{sourceName:'worker',targetName:'main',action:'ready',data:null},{result:{fragment:'ok'}}]);
  const result=await runInterchange({kind:'convert',source:'# hi',format:'markdown'},new AbortController().signal);
  expect(result).toEqual({fragment:'ok'});
 });
 it('ignores foreign worker messages and still surfaces operations errors',async()=>{
  script([{sourceName:'worker',targetName:'main',action:'ready',data:null},{error:'boom'}]);
  await expect(runInterchange({kind:'convert',source:'# hi',format:'markdown'},new AbortController().signal)).rejects.toThrow('boom');
 });
});
