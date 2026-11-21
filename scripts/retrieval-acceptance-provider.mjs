// Test-only receipt counter; no application registration.
import {createProvider as native} from '../src/retrieval/provider.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
export function createProvider(options={}) {const p=native();return {...p,async embed(texts,context){const ledger=JSON.parse(readFileSync(options.ledger,'utf8'));if(context.scope.kind==='query'){if(ledger.queryCalls>=12)throw Error('Acceptance query-call cap reached');ledger.queryCalls++;}else ledger.indexCalls++;writeFileSync(options.ledger,JSON.stringify(ledger,null,2));return p.embed(texts,context);}};}
