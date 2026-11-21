import {Router,json} from 'express';
import {inspectImageReference} from './asset-remote.mjs';
/** Read-only metadata behind the existing Cavern/session gate; no import,
 * publication, provider inference or body proxy. */
export function imageReferenceRouter(inspect=inspectImageReference){
 const router=Router();let active=0;
 router.use(json({limit:'8kb'}));
 router.post('/inspect',async(req,res)=>{
  if(!req.body||Object.keys(req.body).length!==1||typeof req.body.url!=='string'||req.body.url.length>4096){res.status(400).json({Success:false});return;}
  if(active>=8){res.status(429).json({Success:false});return;}
  active++;const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort();};res.once('close',cancel);
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  try{const result=await inspect(req.body.url,controller.signal);if(!controller.signal.aborted)res.json({Success:true,Data:result});}
  catch{if(!controller.signal.aborted)res.json({Success:true,Data:{byteLength:null}});}
  finally{active--;res.off('close',cancel);}
 });
 return router;
}
