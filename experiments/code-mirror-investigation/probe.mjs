// Investigation only. Run from the repository root with existing dependencies:
// node experiments/code-mirror-investigation/probe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {EditorState, ChangeSet, RangeSet, RangeValue, MapMode} from '@codemirror/state';
import {Decoration} from '@codemirror/view';

// Execute the actual repository mapper, transpiled in memory; no generated files
// or production imports/changes. Preserve the repository's clone semantics.
const source = fs.readFileSync(new URL('../../src/interchange/ranges.ts', import.meta.url), 'utf8')
  .replace(/import \{ clone \} from '[^']+';/, 'const clone = value => value == null ? value : structuredClone(value);');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {mapStandoffPropertiesForReplacement: map} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
class Span extends RangeValue {
  constructor(id) { super(); this.id = id; this.startSide = 1; this.endSide = -1; }
}
const ranges = set => { const out = []; for (let c = set.iter(); c.value; c.next()) out.push([c.from, c.to]); return out; };
const oracle = (p, a, b, count, length = 6) => map([p], a, b, count, [], length).map(p => [p.start, p.end + 1]);
let cases = 0;
const mismatches = [], markMismatches = [];
for (let from = 0; from < 6; from++) for (let to = from + 1; to <= 6; to++) {
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) for (let count = 0; count <= 2; count++) {
    const change = ChangeSet.of({from: a, to: b, insert: 'x'.repeat(count)}, 6);
    const expected = oracle({id: 'p', start: from, end: to - 1}, a, b, count);
    const actual = ranges(RangeSet.of([new Span('p').range(from, to)]).map(change));
    const mark = ranges(Decoration.set([Decoration.mark({inclusive: false}).range(from, to)]).map(change));
    cases++;
    if (JSON.stringify(expected) !== JSON.stringify(actual)) mismatches.push({from, to, a, b, count, expected, actual});
    if (JSON.stringify(expected) !== JSON.stringify(mark)) markMismatches.push({from, to, a, b, count, expected, actual: mark});
  }
}
const operations = [
  ['before', 0, 0, 1], ['at start', 1, 1, 1], ['inside', 2, 2, 1], ['at end', 4, 4, 1],
  ['delete before', 0, 1, 0], ['delete inside', 2, 3, 0], ['delete whole', 1, 4, 0],
  ['replace whole', 1, 4, 2], ['replace left', 0, 2, 2], ['replace right', 3, 5, 2],
].map(([name, a, b, count]) => ({name, mapped: oracle({id: 'p', start: 1, end: 3}, a, b, count)}));
assert.deepEqual(operations[1].mapped, [[2,5]]);
assert.deepEqual(operations[3].mapped, [[1,4]]);
assert.deepEqual(operations[7].mapped, []);

const unicode = ['abc', '漢é', 'a😀b', 'e\u0301', 'a\nb', 'a\r\nb', 'a\rb', 'a\r\nb\nc', '\u00e9', '👨‍👩‍👧‍👦'].map(text => {
  const state = EditorState.create({doc: text});
  const boundaries = [0]; for (const ch of text) boundaries.push(boundaries.at(-1) + ch.length);
  return {text, cells: [...text].length, utf16: text.length, boundaries, cmLength: state.doc.length, cmText: state.doc.toString()};
});
assert.equal(unicode[2].cells, 3); assert.equal(unicode[2].cmLength, 4);
assert.equal(unicode[5].cmText, 'a\nb');
const preserveCRLF = EditorState.create({doc: 'a\r\nb', extensions: EditorState.lineSeparator.of('\r\n')});
assert.equal(preserveCRLF.doc.length, 3);
assert.equal(preserveCRLF.sliceDoc(), 'a\r\nb');

const pointCases = [];
for (const end of [2,1]) for (const affinity of ['before','after']) for (const [name,a,b,count] of [['insert',2,2,1],['consume',1,3,0]]) {
  const mapped = map([{id:'point',isZeroWidth:true,start:2,end,affinity}],a,b,count,[],6);
  pointCases.push({end,affinity,name,mapped});
}
// Distinct IDs must survive identical, nested and partially overlapping ranges.
const overlap = RangeSet.of([new Span('a').range(1,4),new Span('b').range(1,4),new Span('c').range(2,5),new Span('d').range(2,3)], true);
assert.equal(overlap.size, 4);
assert.equal(overlap.map(ChangeSet.of({from:2,insert:'x'},6)).size, 4);

const compound = ChangeSet.of([{from:1,to:2,insert:'XY'},{from:4,to:5,insert:'Z'}],6);
const compoundParts = []; compound.iterChanges((a,b,c,d,insert)=>compoundParts.push({a,b,c,d,text:insert.toString()}),true);
const deletion = ChangeSet.of({from:1,to:4,insert:''},6);
const deletionModes = Object.fromEntries(['Simple','TrackDel','TrackBefore','TrackAfter'].map(name=>[name,[1,2,4].map(pos=>deletion.mapPos(pos,1,MapMode[name]))]));
const versions = Object.fromEntries(['codemirror','@codemirror/state','@codemirror/view','@codemirror/language','@codemirror/commands'].map(name=>[name,JSON.parse(fs.readFileSync(new URL('../../node_modules/'+name+'/package.json',import.meta.url),'utf8')).version]));
console.log(JSON.stringify({versions, cases, customRangeMismatches:mismatches.length, customRangeExamples:mismatches.slice(0,5),markMismatches:markMismatches.length,markExamples:markMismatches.slice(0,5),operations,unicode,crlf:{internalLength:preserveCRLF.doc.length,serialized:preserveCRLF.sliceDoc()},pointCases,overlapSize:overlap.size,compoundParts,deletionModes},null,2));
