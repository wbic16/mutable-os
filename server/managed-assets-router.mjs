import {sanitiseSvg} from '../src/features/quill/svg-sanitize.mjs';
import {validateStructuredOriginal} from './structured-original.mjs';
import { Router } from 'express';
import multer from 'multer';
import { ManagedAssetStore } from './managed-assets.mjs';
import { IMAGE_LIMITS, validateImportedImage } from './asset-image-validation.mjs';
import { acquireRemoteAsset, acquireRemoteText, textPolicy, remoteAssetUrl } from './asset-remote.mjs';
/** Approved PNG/JPEG admission and explicitly consented text acquisition share Cavern leases. */
export function createManagedAssetService(options) {
  const store = new ManagedAssetStore(options), router = Router();
  const upload = multer({ storage:multer.memoryStorage(),limits:{fileSize:IMAGE_LIMITS.bytes,files:1,fields:2,parts:3} }).single('asset');
  const originalUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1,fields:1,parts:2}}).single('asset');
  let recovery = { diagnostics: [] };
  let work = 0; const controllers = new Set();
  const route = (method,name,action) => router[method](name,async(req,res)=>{
    const controller=new AbortController();controllers.add(controller);
    const cancel=()=>{if(!res.writableEnded)controller.abort();};res.once('close',cancel);
    try {
      if(work>=2)throw Error('Asset service is busy; retry.');work++;
      try{const value=await action(req,res,controller.signal);if(!res.headersSent)res.json({Success:true,Data:value});}finally{work--;}
    }catch(error){if(!res.headersSent)res.status(409).json({Success:false,Error:error.message});}
    finally{controllers.delete(controller);res.off('close',cancel);}
  });
  const lease=req=>({id:req.params.operation,token:req.header('X-Mutable-Asset-Lease')});
  route('get','/recovery-status',async()=>recovery);
  route('post','/begin',async req=>{
    const consent=req.body?.remoteConsent??[];
    if(!Array.isArray(consent)||consent.length>IMAGE_LIMITS.count||consent.some(v=>typeof v!=='string'))throw Error('Invalid remote-image consent.');
    return store.begin(consent.map(v=>remoteAssetUrl(v).href));
  });
  route('post','/begin-text',async req=>{
    const url=remoteAssetUrl(req.body?.url).href,format=req.body?.format;textPolicy(format);
    return store.begin([],[{url,format}]);
  });
  route('post','/:operation/text/remote',async(req,_res,signal)=>{
    const url=remoteAssetUrl(req.body?.url).href,format=req.body?.format;textPolicy(format);
    await store.authorizeAcquisition(lease(req),url,format);
    const result=await acquireRemoteText(url,format,signal,options.remoteTextDependencies);
    signal.throwIfAborted();await store.authorizeAcquisition(lease(req),url,format);
    return result;
  });
  route('post','/:operation/images/stage',async(req,_res,signal)=>{
    await store.status(lease(req));
    await new Promise((resolve,reject)=>upload(req,_res,error=>error?reject(error):resolve()));
    signal.throwIfAborted();if(!req.file)throw Error('No image supplied.');
    const metadata=await validateImportedImage(req.file.buffer,signal);signal.throwIfAborted();
    return store.stage(lease(req),req.file.buffer,metadata);
  });
  route('post','/:operation/originals/stage',async(req,res,signal)=>{
    if(!options.crossResourceEnabled&&!options.structuredEnabled&&!options.deterministicEnabled&&!options.webEnabled)throw Error('Resource original admission disabled');
    await store.status(lease(req));await new Promise((resolve,reject)=>originalUpload(req,res,e=>e?reject(e):resolve()));signal.throwIfAborted();if(!req.file)throw Error('No original supplied');
    const mediaType=req.file.mimetype;if(['application/xml','application/epub+zip','application/x-bibtex','application/x-research-info-systems'].includes(mediaType)){if(!options.deterministicEnabled||!options.inspectOriginal)throw Error('Academic original admission disabled');await options.inspectOriginal(new Uint8Array(req.file.buffer),mediaType,signal);signal.throwIfAborted();return store.stage(lease(req),req.file.buffer,{mediaType});}if(mediaType==='text/plain'){if(!options.structuredEnabled)throw Error('Read-only resources disabled');validateStructuredOriginal(req.file.buffer);return store.stage(lease(req),req.file.buffer,{mediaType});}
    if((mediaType==='application/json'?!options.crossResourceEnabled&&!options.deterministicEnabled&&!options.webEnabled:!options.crossResourceEnabled)||!options.inspectOriginal)throw Error('Resource original admission disabled');if(!['application/pdf','application/json'].includes(mediaType))throw Error('Use image admission for image originals');
    await options.inspectOriginal(new Uint8Array(req.file.buffer),mediaType,signal);signal.throwIfAborted();return store.stage(lease(req),req.file.buffer,{mediaType});
  });
  route('post','/:operation/images/svg',async(req,res,signal)=>{
    if(!options.quillEnabled)throw Error('SVG composition asset admission disabled');await store.status(lease(req));await new Promise((resolve,reject)=>upload(req,res,e=>e?reject(e):resolve()));signal.throwIfAborted();if(!req.file)throw Error('No SVG supplied.');
    const {svg}=sanitiseSvg(new TextDecoder('utf-8',{fatal:true}).decode(req.file.buffer));return store.stage(lease(req),Buffer.from(svg),{mediaType:'image/svg+xml'});
  });
  route('post','/:operation/images/remote',async(req,_res,signal)=>{
    const url=remoteAssetUrl(req.body.url).href;
    await store.authorizeRemote(lease(req),url);
    const bytes=await acquireRemoteAsset(url,signal),metadata=await validateImportedImage(bytes,signal);
    signal.throwIfAborted();return store.stage(lease(req),bytes,metadata);
  });
  for(const action of ['publish','status','renew','abort'])route('post',`/:operation/${action}`,req=>store[action](lease(req)));
  route('post','/:operation/finish',req=>store.finish(lease(req),req.body?.commitId));
  route('get','/:assetId/content',async(req,res)=>{
    const {bytes,manifest}=await store.get(req.params.assetId,req.query.cavernId);
    res.set({'Content-Type':manifest.mediaType,'Content-Length':String(bytes.length),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});res.send(bytes);
  });
  route('post','/verify',async req=>{const {manifest}=await store.get(req.body.assetId,req.body.cavernId);return manifest;});
  return {router,store,recover:async()=>{recovery=await store.recover();return recovery;},async close(){for(const c of controllers)c.abort();await store.close();}};
}
