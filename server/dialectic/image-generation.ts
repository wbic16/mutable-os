import {attachmentName} from '../../src/features/dialectic/attachments-contract.js';
import {imageGenerationLimits,imageGenerationModel,generateImageTool} from '../../src/features/dialectic/image-generation-contract.js';
import {retainAttachment,type AttachmentContext} from './attachments.js';

export async function generateImage(context:AttachmentContext,args:Record<string,unknown>,key:string,signal:AbortSignal,fetcher:typeof fetch=fetch){
 context.check();signal.throwIfAborted();
 const name=attachmentName(args.filename),p=generateImageTool.parameters.properties;
 if(Object.keys(args).sort().join(',')!=='filename,prompt,quality,size'||!name.toLowerCase().endsWith('.png')||typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>imageGenerationLimits.promptCharacters||!p.size.enum.includes(String(args.size))||!p.quality.enum.includes(String(args.quality)))throw Error('Choose a PNG filename, image prompt, size and quality.');
 let response:Response;
 try{response=await fetcher('https://api.openai.com/v1/images/generations',{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify({model:imageGenerationModel,prompt:args.prompt,size:args.size,quality:args.quality,n:1,output_format:'png'})});}
 catch{throw Error(signal.aborted?'Image generation cancelled.':'Could not reach OpenAI image generation. Please try again.');}
 if(!response.body)throw Error('OpenAI returned no image response.');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>(response.ok?imageGenerationLimits.wireBytes:16384))throw Error('OpenAI image response exceeded its size limit.');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 let data:any;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('OpenAI returned an unreadable image response.');}
 if(!response.ok){const raw=data?.error?.code??data?.error?.type,code=typeof raw==='string'&&/^[a-z_0-9]{1,80}$/.test(raw)?`, ${raw}`:'';throw Error(`OpenAI image generation failed (HTTP ${response.status}${code}). ${response.status===401||response.status===403?'Check your OpenAI key and image-model access.':response.status===429?'Check your OpenAI quota or try again later.':'Please revise the request or try again.'}`);}
 const encoded=data?.data?.[0]?.b64_json;
 if(data?.data?.length!==1||typeof encoded!=='string'||!encoded.length||encoded.length>4*Math.ceil(imageGenerationLimits.bytes/3)||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('OpenAI did not return a complete PNG image.');
 const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw Error('OpenAI returned incomplete image data.');
 context.check();signal.throwIfAborted();
 return retainAttachment(context,name,bytes,'agent',signal);
}
