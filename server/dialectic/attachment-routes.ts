import multer from 'multer';
import type {Router} from 'express';
import {attachments,attachmentLimits} from '../../src/features/dialectic/attachments-contract.js';
import {retainAttachment,resolveAttachments,type AttachmentContext} from './attachments.js';
export interface AttachmentOptions {attachmentsEnabled?:boolean;artifactsEnabled?:boolean;imageGenerationEnabled?:boolean;attachmentContext?:(session:string)=>AttachmentContext|undefined}
export function requestAttachmentContext(options:AttachmentOptions,session:unknown){
 if(typeof session!=='string'||!session)throw Error('Open a Vault before using attachments');
 const context=options.attachmentContext?.(session);if(!context)throw Error('Attachment storage unavailable');context.check();return context;
}
/** Mounted after the broker's same-origin/session checks. No provider key needed. */
export function attachmentRoutes(router:Router,options:AttachmentOptions){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:attachmentLimits.fileBytes,files:1,fields:1,parts:3}}).single('file');
 let active=0;
 for(const action of ['upload','download'] as const)router.post('/attachments/'+action,async(req,res)=>{
  const abort=new AbortController(),closed=()=>{if(!res.writableEnded)abort.abort();};
  if(active>=2){res.status(429).json({error:'Attachment service busy; retry shortly'});return;}
  active++;res.on('close',closed);const timer=setTimeout(()=>abort.abort(),60000);
  try{
   if(action==='upload'?!options.attachmentsEnabled:!options.attachmentsEnabled&&!options.artifactsEnabled)throw Error('Attachments disabled');
   const context=requestAttachmentContext(options,req.header('X-Mutable-Cavern'));
   if(action==='upload'){
    await new Promise<void>((resolve,reject)=>upload(req,res,error=>error?reject(error):resolve()));
    if(!req.file)throw Error('Choose a file');
    const result=await retainAttachment(context,req.body.name??req.file.originalname,req.file.buffer,'user',abort.signal);
    context.check();abort.signal.throwIfAborted();res.json({attachment:result});
   }else{
    const [input]=await resolveAttachments(context,attachments([req.body.attachment]),abort.signal);
    const name=encodeURIComponent(input.attachment.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
    res.set({'Content-Type':input.attachment.mediaType,'Content-Length':String(input.bytes.length),'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${name}`,'Content-Security-Policy':"default-src 'none'; sandbox"});res.send(Buffer.from(input.bytes));
   }
  }catch(error){if(!res.headersSent&&!res.destroyed)res.status(400).json({error:error instanceof Error?error.message:'Attachment operation failed'});}
  finally{active--;clearTimeout(timer);res.off('close',closed);}
 });
}
