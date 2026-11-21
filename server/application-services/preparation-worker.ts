import {attachmentLimits} from '../../src/features/dialectic/attachments-contract';
import {xml} from '../../src/academic/xml';
import {attachmentPdf} from './attachment-pdf';
import {inspectPdf} from './pdf-inspection';
import {normalizeIIIF} from '../../src/iiif/model';
import {articleProjection,wikidataProjection} from '../../src/interchange/encyclopedia-projection';
import {normalizeScholarly} from '../../src/interchange/scholarly';
import {createHash} from 'node:crypto';
import {publicRoute} from '../../src/publication/directory';
import {readerArtifact} from '../../src/publication/shell';
import {inspectResearch} from '../../src/publication/inspect-research';
import {parentPort} from 'node:worker_threads';
import {convertSource} from '../../src/interchange/document-import';
import {createPackage,nativeInventory} from '../../src/interchange/package/format';
import {decodeNative} from '../../src/persistence/native-resource';
import type {ExecutionTask} from '../../src/application-services/capabilities';
import {publicProjection} from '../../src/publication/projection';
import {zipSync} from 'fflate';
parentPort!.once('message',async(task:ExecutionTask)=>{
 try {
  const value=task.kind==='attachment-pdf-inspect'?await inspectPdf(task.bytes,{bytes:attachmentLimits.fileBytes,pages:attachmentLimits.pdfPages}):task.kind==='attachment-pdf'?await attachmentPdf(task.text,task.title):task.kind==='web-project'?{kind:'web-projection',projection:(await import('../../src/web-resources/parse')).parseWebBytes(task.bytes)}:task.kind==='academic-original-inspect'?await inspectAcademic(task.bytes,task.mediaType):task.kind==='deterministic-parse'?{kind:'deterministic-projection',projection:(await import('../../src/academic/parse')).parseAcademic(task.bytes,task.format,task.identity,task.secondary,task.discovery)}:task.kind==='json-inspect'?inspectJson(task.bytes):task.kind==='pdf-inspect'?await inspectPdf(task.bytes):task.kind==='iiif-normalize'?normalizeIIIF(task.bytes):task.kind==='encyclopedia-normalize'?(typeof task.source==='string'?wikidataProjection(task.source,task.responses[0]):articleProjection(task.source,task.responses[0],task.responses[1])):task.kind==='academic-normalize'?{kind:'academic-normalize',metadata:normalizeScholarly(task.provider,task.doi,task.bytes)}:task.kind==='publication-project'?publicProjection(task.native,task.profile,task.cavernId,task.directory,id=>'b-'+createHash('sha256').update((task.directory?.namespace??task.namespace??'')+'\0'+id).digest('hex').slice(0,24),task.research):
   task.kind==='publication-inspect'?inspectResearch(task.native,task.profile,task.cavernId,task.blockId):
   task.kind==='publication-zip'?{bytes:publicationZip(task.members)}:
   task.kind==='convert'?{kind:'convert',...convertSource(task.source,task.format)}:
   task.kind==='inventory'?nativeInventory(decodeNative(task.native),task.resources!==false):
   {kind:'package',mediaType:'application/zip',bytes:await createPackage(task.native,task.source,task.context.data,task.context.schema,task.assets)};
  parentPort!.postMessage({value});
 }catch(error){parentPort!.postMessage({error:error instanceof Error?error.message:'Preparation failed'});}
});
function publicationZip(members:Record<string,Uint8Array>){
 if(Object.keys(members).length>2002||Object.values(members).reduce((n,b)=>n+b.length,0)>60*1024*1024)throw Error('Publication ZIP limit');
 const normalized:any={};for(const name of Object.keys(members).sort()){
  if(!publicRoute(name)&&!readerArtifact(name)&&! /^(?:reader\.css|assets\/[a-f0-9]{64}\.(?:png|jpg))$/.test(name))throw Error('Invalid ZIP member');
  normalized[name]=[members[name],{mtime:new Date(1980,0,1,0,0,0),level:0}];
 }
 const output=zipSync(normalized,{level:0});if(output.length>64*1024*1024)throw Error('Publication ZIP limit');return output;
}

function inspectJson(bytes:Uint8Array){if(bytes.length>8*1024*1024)throw Error("JSON original limit");JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));return {kind:"json-inspection"};}

async function inspectAcademic(bytes:Uint8Array,media:string){if(media==='application/xml')xml(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/<!DOCTYPE PubmedArticleSet PUBLIC "[^"<>\[\]]*" "https?:\/\/[^"<>\[\]]*">/,''));else (await import('../../src/academic/parse')).parseAcademic(bytes,media==='application/epub+zip'?'epub':media==='application/x-bibtex'?'bibtex':'ris');return {kind:'json-inspection'};}
