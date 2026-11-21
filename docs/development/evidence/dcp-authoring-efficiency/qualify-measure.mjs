import fs from 'node:fs';
const {getEncoding}=await import(process.env.DCP_TOKENIZER || '/tmp/dcp-workspace-tokenizer-js/node_modules/js-tiktoken/dist/index.js');
const enc=getEncoding('o200k_base');
const metric=v=>{const text=typeof v==='string'?v:JSON.stringify(v);return {bytes:Buffer.byteLength(text),tokens:enc.encode(text).length}};
const parts=b=>({wire:metric(b),system:metric(b.instructions??b.system),userText:metric((b.input??b.messages)[0].content),schema:metric(b.text?.format.schema??b.output_config.format.schema)});
const values=JSON.parse(fs.readFileSync('/tmp/dcp-efficiency-qualified-wire.json','utf8')).map(({name,provider,before,dedup,after,omitted})=>({name,provider,before:parts(before),dedup:parts(dedup),after:parts(after),omitted}));
for(const row of values){
 const filename=row.name==='workspace-3'?'docs/development/evidence/dcp-semantic-workspace/exchange-3.json':`/tmp/dcp-editorial-authoring/gpt-5.4-${row.name==='editorial-core'?'D':'A'}.json`;
 const response=JSON.parse(fs.readFileSync(filename,'utf8')).response,short=structuredClone(response);
 for(const field of row.omitted){if(!Array.isArray(short[field])||short[field].length)throw Error('Measurement attempted to omit a populated field');delete short[field]}
 row.responseFieldOmission={before:metric(response),after:metric(short)};
}
const result={date:'2026-11-11',method:'Controlled offline assembly with retained request contexts. Before reconstructs the former user projection using the same current system/schema/settings. After adds qualified alias guidance and empty-field negotiation. o200k_base local text/JSON counts, not provider billing or measured latency.',values};
fs.writeFileSync('docs/development/evidence/dcp-authoring-efficiency/qualification-measurements.json',JSON.stringify(result,null,2)+'\n');
for(const r of values)console.log(r.name,r.provider,JSON.stringify({before:r.before,after:r.after,omitted:r.omitted}));
