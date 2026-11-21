import {it,expect,vi} from 'vitest';
import {EditingIndex,adjacentGrapheme,graphemeWork} from './editing-index';
import {cells,EditingOccurrence,allocations} from './presentation';
import {CompactDocument,plain} from './model';
import {fixture,fixtureBytes} from './fixture';
import {graphemeBoundaries} from '../../src/input/graphemes';
import {decodeNative,nativeText} from '../../src/persistence/native-resource';
const bytes=(f:unknown)=>new TextEncoder().encode(JSON.stringify(f));
it('rank lookup survives 250 deterministic splices without suffix Cell reindexing',()=>{
 let seed=42;const rand=()=>seed=(seed*1664525+1013904223)>>>0;
 const a=cells([{kind:'text',text:'x'.repeat(10000)}]),index=new EditingIndex(a);
 for(let i=0;i<250;i++){const start=rand()%(a.length+1),count=Math.min(rand()%40,a.length-start),added=cells([{kind:'text',text:'y'.repeat(rand()%30)}]),removed=a.slice(start,start+count),prior=index.work.cellsIndexed;index.splice(start,removed,added);a.splice(start,count,...added);expect(index.work.cellsIndexed-prior).toBeLessThanOrEqual(512+added.length);for(let j=0;j<a.length;j++)expect(index.position(a[j].key)).toBe(j);for(const c of removed)expect(index.position(c.key)).toBeUndefined();}
});
for(const text of ['a😀b','aéb','x\r\ny','a🇬🇧🇫🇷🇺🇸b','a👩🏽‍👩‍👧‍👧b','\u0600a\u0301b','क्‍ष','x'+'🇬'.repeat(1001)+'y','a\u0301'.repeat(100)])it('grapheme access agrees with complete segmentation '+text.slice(0,15),()=>{
 const a=cells([{kind:'text',text}]),bounds=graphemeBoundaries(text);
 for(let at=0;at<=a.length;at++){expect(adjacentGrapheme(a,at,-1)).toBe(bounds.filter(i=>i<at).at(-1)??0);expect(adjacentGrapheme(a,at,1)).toBe(bounds.find(i=>i>at)??a.length);}
});
it('ASCII navigation reads bounded context in a 120624-position occurrence',()=>{const a=cells([{kind:'text',text:'x'.repeat(120624)}]),prior=graphemeWork.reads;for(const at of [1,60000,120623]){expect(adjacentGrapheme(a,at,-1)).toBe(at-1);expect(adjacentGrapheme(a,at,1)).toBe(at+1);}expect(graphemeWork.reads-prior).toBeLessThan(30);});
it('inline objects form single-atom grapheme boundaries',()=>{const a=cells([{kind:'text',text:'é'},{kind:'image',properties:{}},{kind:'text',text:'😀x'}]);expect(adjacentGrapheme(a,3,-1)).toBe(2);expect(adjacentGrapheme(a,2,1)).toBe(3);expect(adjacentGrapheme(a,2,-1)).toBe(0);});
it('a combining mark after an image cannot consume the image',()=>{const a=cells([{kind:'text',text:'x'},{kind:'image',properties:{}},{kind:'text',text:'\u0301y'}]);expect(adjacentGrapheme(a,3,-1)).toBe(2);expect(adjacentGrapheme(a,2,1)).toBe(3);expect(adjacentGrapheme(a,2,-1)).toBe(1);});
it('local insertion/deletion repaints only changed styles, preserves identities, and does not enumerate or validate',()=>{
 const f=fixture();f.document.blocks.find(b=>b.id==='b')!.inline=[{kind:'text',text:'x'.repeat(120624)}];const d=new CompactDocument(bytes(f)),a=new EditingOccurrence(d,'b'),b=new EditingOccurrence(d,'b'),other=new EditingOccurrence(d,'a'),key=a.cells[60000].key,updates=other.updates;
 const full=d.metrics.fullValidation,visits=allocations.renderVisits;vi.spyOn(d,'all').mockImplementation(()=>{throw Error('document enumeration');});vi.spyOn(d,'capture').mockImplementation(()=>{throw Error('snapshot');});
 for(const at of [0,60000,120624]){d.replace('b',at,at,[{kind:'text',text:'Z'}]);d.replace('b',at,at+1,[]);}
 expect(allocations.renderVisits-visits).toBeLessThan(30);expect(a.cells[60000].key).toBe(key);expect(d.metrics.fullValidation).toBe(full);expect(other.updates).toBe(updates);a.dispose();b.dispose();other.dispose();
});
it('compound selected-Enter publishes one coherent state and history event',()=>{
 const d=new CompactDocument(fixtureBytes()),o=new EditingOccurrence(d,'b'),before=d.capture();let seen=0;d.subscribe(()=>{seen++;expect(o.cells.map(c=>c.text).join('')).toBe(plain(d.get('b').inline!));});
 d.transaction(()=>{d.replace('b',1,4,[]);d.split('b',1);});expect(seen).toBe(1);const after=d.capture();d.undo();expect(d.capture()).toBe(before);d.redo();expect(d.capture()).toBe(after);o.dispose();
});
it('rejected compound mutation publishes nothing and leaves history unchanged',()=>{const d=new CompactDocument(fixtureBytes()),before=d.capture(),rev=d.revision;expect(()=>d.transaction(()=>{d.replace('b',1,2,[]);d.split('b',0);})).toThrow();expect(d.revision).toBe(rev);expect(d.capture()).toBe(before);expect(d.undo()).toBe(false);});
it('point endpoint forms survive structural Undo/Redo and native round trips',()=>{const f=fixture(),b=f.document.blocks.find(b=>b.id==='b')!;b.properties.standoffProperties=[{type:'point/a',isZeroWidth:true,start:5,end:5},{type:'point/b',isZeroWidth:true,start:5,end:4}];const d=new CompactDocument(bytes(f)),before=d.capture(),right=d.split('b',3),p=d.get(right).properties.standoffProperties;expect(p.map((x:any)=>[x.start,x.end])).toEqual([[2,2],[2,1]]);const after=d.capture();expect(nativeText(decodeNative(bytes(JSON.parse(after))))).toBe(after);d.undo();expect(d.capture()).toBe(before);d.redo();expect(d.capture()).toBe(after);});

it('annotation and image validation do not publish a structural invalidation',()=>{
 const d=new CompactDocument(fixtureBytes()),notices:any[]=[];d.subscribe(n=>notices.push(n));const full=d.metrics.fullValidation;
 d.annotations('b',[{type:'style/bold',start:0,end:2}]);d.replace('b',1,1,[{kind:'image',properties:{alt:'typed'}}]);
 expect(d.metrics.fullValidation).toBe(full+2);expect(notices.map(n=>n.structural)).toEqual([false,false]);
 d.undo();d.redo();expect(notices.map(n=>n.structural)).toEqual([false,false,false,false]);
});
