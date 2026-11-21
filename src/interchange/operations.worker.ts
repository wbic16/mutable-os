import { prepareInterchange, type InterchangeRequest } from './operations';
self.onmessage=async(event:MessageEvent<InterchangeRequest>)=>{
 try{const start=performance.now();const result=await prepareInterchange(event.data);
 if(event.data.kind==='tei-document'&&event.data.profile)Object.assign(result,{workerMs:performance.now()-start,sentAt:performance.timeOrigin+performance.now()});
 self.postMessage({result});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
