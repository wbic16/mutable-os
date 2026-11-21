import {describe,it,expect} from 'vitest';
import {LatinMeasurer} from './measurement';
import {PathCache} from './geometry';
import {FlowEngine,caretAt,hitCaret,rangeBoxes,RangeGeometryCache} from './layout';
const measure=()=>new LatinMeasurer(()=>10);
const line={id:'line',kind:'line' as const,x:10,y:40,width:100};
describe('M1 checkpoint 1: canonical geometry boundary',()=>{
 it('maps canonical spans, UTF16 and affinity explicitly; rejects unsupported clusters without altering text',()=>{
  const m=measure();expect(m.shape('abc').clusters[1]).toMatchObject({start:1,end:2,utf16Start:1,utf16End:2,carets:[1,2],direction:'ltr'});
  for(const text of ['e\u0301','é','🙂','العربية','a\t']){expect(m.shape(text).diagnostic).toBeTruthy();expect(m.shape(text).clusters).toEqual([]);}
 });
 it.each(['line','sine'] as const)('maps clicks/carets/ranges along %s without DOM reads',kind=>{
  const p=new PathCache().get({...line,kind,...(kind==='sine'?{amplitude:20,cycles:1}:{})}),l=new FlowEngine().layout(measure().shape('abcdef'),[p]);
  for(let i=0;i<=6;i++){const c=caretAt(l,i)!;expect(hitCaret(l,c.x,c.y-7)?.index).toBe(i);}
  expect(rangeBoxes(l,2,4)).toHaveLength(2);expect(p.length).toBeGreaterThanOrEqual(100);
 });
 it('retains geometry and unchanged fragments; remeasures only new character/style combinations',()=>{
  const m=measure(),p=new PathCache(),f=new FlowEngine(),paths=[p.get(line),p.get({...line,id:'next',y:90})];
  const a=m.shape('one two\nthree'),first=f.layout(a,paths),measurements=m.measurements,fits=f.fits;
  const b=m.shape('one two\nthree!',()=>'',a),second=f.layout(b,paths);
  expect(second.fragments[0]).toBe(first.fragments[0]);expect(m.measurements-measurements).toBe(1);expect(f.fits-fits).toBe(1);expect(p.builds).toBe(2);
 });
 it('flows by words and explicit breaks and preserves overflow',()=>{
  const p=new PathCache(),l=new FlowEngine().layout(measure().shape('one two three\nfour five six'),[0,1,2].map(i=>p.get({...line,id:'p'+i,y:40+i*50,width:80})));
  expect(l.fragments.map(f=>f.glyphs.map(g=>g.cluster.text).join(''))).toEqual(['one two ','three\n','four ']);expect(l.overflow).toBe(19);expect(l.length).toBe(27);
 });
});

it('invalidates font metrics and shares unchanged range geometry across downstream edits',()=>{
 let width=10;const m=new LatinMeasurer(()=>width),p=new PathCache(),f=new FlowEngine(),r=new RangeGeometryCache(),paths=[p.get(line),p.get({...line,id:'next',y:90})];
 const a=m.shape('one two\nthree'),l=f.layout(a,paths),box=r.get(l,0,3),reads=r.builds;
 const b=m.shape('one two\nthree!',()=>'',a),changed=f.layout(b,paths);expect(r.get(changed,0,3)).toBe(box);expect(r.builds).toBe(reads);
 width=20;m.invalidate();expect(m.shape('one',()=>'',a).clusters[0].advance).toBe(20);
});

it('reconsiders a preceding soft break when a downstream word shrinks to fit',()=>{
 const m=measure(),f=new FlowEngine(),cache=new PathCache(),paths=[cache.get({...line,width:90}),cache.get({...line,id:'second',y:80,width:90})];
 const a=m.shape('one lengthy'),before=f.layout(a,paths);expect(before.fragments[0].end).toBe(4);
 const after=f.layout(m.shape('one leg',()=>'',a),paths);expect(after.fragments[0].end).toBe(7);
});
it('converges after changed fragments and retains downstream glyph geometry with rebased canonical spans',()=>{
 const m=measure(),f=new FlowEngine(),p=new PathCache(),paths=[p.get({...line,width:200}),p.get({...line,id:'next',y:90,width:200})],a=m.shape('one\nthree'),before=f.layout(a,paths),fits=f.fits;
 const after=f.layout(m.shape('xone\nthree',()=>'',a),paths);expect(f.fits-fits).toBe(1);expect(after.fragments[1].glyphs[0].point).toBe(before.fragments[1].glyphs[0].point);expect(after.fragments[1].glyphs[0].cluster.start).toBe(5);
});
