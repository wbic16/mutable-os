// QA-only source overlays. Production source files are never rewritten.
// Each replacement fails closed against source drift. COMPACT_M2=0 loads M1.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const baselineRef='f3ea056';
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('M2 overlay needs review: '+a.slice(0,100));return s.replace(a,b);};
export function experimentalOverlays(baseline=false){return {name:'compact-m2-contracts',enforce:'pre',load(id){
 const file=id.replace(process.cwd()+'/','');
 if(baseline&&['model.ts','editor.ts','presentation.ts','cell-oracle.ts'].some(n=>file==='scripts/compact-canonical/'+n))return execFileSync('git',['show',baselineRef+':'+file],{encoding:'utf8'});
 if(baseline)return;
 if(file==='src/rendering/direct-character-cells.ts'){
  let s=readFileSync(id,'utf8');
  s=replace(s,'  update(cells: readonly CharacterCellPresentation[]): void {',`  readonly experimentalSplice = true;
  elementFor(key: string) { return this.entries.get(key)?.element; }
  update(cells: readonly CharacterCellPresentation[], splice?: {removed: readonly string[]; before?: string}): void {`);
  s=replace(s,'const sequenceChanged = !this.keys', 'const sequenceChanged = !!splice || !this.keys');
  s=replace(s,'this.keys = keys;', 'this.keys = splice ? undefined : keys;');
  s=replace(s,'for (const [key, entry] of this.entries) {', 'for (const [key, entry] of (splice ? splice.removed.flatMap(key => {const e=this.entries.get(key);return e?[[key,e] as const]:[];}) : this.entries)) {');
  s=replace(s,'let cursor = this.flow.firstChild;', 'const present = (key: string | undefined) => {const e=this.entries.get(key ?? "")?.element;return e?.parentNode===this.flow?e:undefined;}; let cursor: ChildNode | null = splice ? (present(cells[0]?.key) ?? present(splice.before) ?? null) : this.flow.firstChild;');
  s=replace(s,'if (cell.index !== undefined && !cell.provisional)', 'if (!cell.provisional)');
  s=replace(s,'if (!this.addresses && cell.index !== undefined) setAttribute(element, "data-inline-index", String(cell.index));', 'element.removeAttribute("data-inline-index"); // Resolve current position through the mounted occurrence, never stale suffix attributes.');
  s=replace(s,'if (structureChanged) while (cursor)', 'if (!splice && structureChanged) while (cursor)');
  return s;
 }
 // The production gateway now consumes the same optional adjacentGrapheme port.
}};}
