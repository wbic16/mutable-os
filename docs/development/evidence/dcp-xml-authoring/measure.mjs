// Offline only. Run from the repository root; no network or application changes.
import fs from 'node:fs';
const {getEncoding}=await import(process.env.TOKENIZER_MODULE??'/tmp/dcp-workspace-tokenizer-js/node_modules/js-tiktoken/dist/index.js');
const encoder=getEncoding('o200k_base'),tokens=s=>encoder.encode(s).length,dir='docs/development/evidence/dcp-xml-authoring';
const saved=JSON.parse(fs.readFileSync(dir+'/provider-requests.json','utf8'));
const request={};for(const key of ['json','xml']){const b=saved[key],parts={instructions:tokens(b.instructions),currentContent:tokens(b.input.map(i=>i.content).join('\n')),responseFormat:b.text?.format?tokens(JSON.stringify(b.text.format)):0,tools:tokens(JSON.stringify(b.tools))};request[key]={...parts,componentSubtotal:Object.values(parts).reduce((a,b)=>a+b,0),serializedBodyTokens:tokens(JSON.stringify(b)),bodyBytes:Buffer.byteLength(JSON.stringify(b))};}
const responses={};for(const name of ['palimpsest','leonardo','mercury']){const e=JSON.parse(fs.readFileSync(dir+'/'+name+'.json','utf8'));responses[name]={json:tokens(JSON.stringify(e.json)),xml:tokens(e.xml),nativeTextAndRangesEquivalent:e.nativeTextAndRangesEquivalent,nativeDefinitionCounts:e.nativeDefinitionCounts};}
const result={method:'Local o200k_base estimates over captured mocked invocations. Not endpoint/billed token counts; no paid calls. Parts omit provider framing/history/reasoning and are not an exact provider accounting partition.',request,responses};
fs.writeFileSync(dir+'/measurements.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
