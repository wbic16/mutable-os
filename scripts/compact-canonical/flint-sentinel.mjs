// Reuse the existing full-Flint investigation runner without overwriting its evidence.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const original=readFileSync('scripts/cell-materialisation/inspect-browser.mjs','utf8');
const fixtures="['small','large','anthology','extended']";
if(!original.includes(fixtures)||!original.includes('artifacts/cell-materialisation'))throw Error('Review the sentinel adapter against the current investigation runner');
const output=process.env.COMPACT_OUTPUT??'artifacts/compact-canonical/flint-release';
// Substitute a source-code string literal safely; output is a path, not code.
const source=original.replace(fixtures,"['small','large']").replaceAll("'artifacts/cell-materialisation'",JSON.stringify(output)).replaceAll("'artifacts/cell-materialisation/'",JSON.stringify(output+'/'));
const result=spawnSync(process.execPath,['--input-type=module','-e',source],{stdio:'inherit',env:{...process.env,CELL_URL:process.env.CELL_URL??'http://127.0.0.1:3113',CELL_FLINT:'1',CELL_RUNS:process.env.CELL_RUNS??'1'}});
process.exitCode=result.status??1;
