import {it,expect,vi} from 'vitest';
import express from 'express';
import {imageReferenceRouter} from './image-reference';
it('returns metadata without acquisition and falls back to unknown when HEAD is rejected',async()=>{
 const inspect=vi.fn().mockResolvedValueOnce({byteLength:107119245}).mockRejectedValueOnce(Error('HTTP 405')),app=express();app.use(imageReferenceRouter(inspect));const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{
  const url=`http://127.0.0.1:${(server.address() as any).port}/inspect`,call=(body:any)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  expect(await(await call({url:'https://example.org/a.jpg'})).json()).toEqual({Success:true,Data:{byteLength:107119245}});
  expect(await(await call({url:'https://example.org/b.jpg'})).json()).toEqual({Success:true,Data:{byteLength:null}});
  expect((await call({url:'https://example.org/a',headers:{Authorization:'bad'}})).status).toBe(400);expect(inspect).toHaveBeenCalledTimes(2);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
