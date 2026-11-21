import {it,expect} from 'vitest';
import {LatinMeasurer,TextMeasurer} from './measurement';
import {PathCache} from './geometry';
import {FlowEngine,VisualLayoutCache,hitCaret,caretAt} from './layout';
import {defaultComposition} from './model';
it('size/tracking participate in fitting while colour/opacity preserve fitted geometry',()=>{
 const m=new LatinMeasurer((t,font)=>t.length*Number(font.match(/([\d.]+)px/)?.[1]??20)/2),engine=new FlowEngine(),paths=[new PathCache().get({...defaultComposition().paths[0],width:100})];
 const before=engine.layout(m.shape('one two three',undefined,undefined,{size:20}),paths),fits=engine.fits;
 const visual=new VisualLayoutCache().apply(before,{effects:[{id:'fade',kind:'opacity',curve:'linear',from:1,to:.2}]});expect(engine.fits).toBe(fits);expect(visual.fragments[0].end).toBe(before.fragments[0].end);expect(visual.fragments[0].glyphs.at(-1)!.paint!.opacity).toBeLessThan(1);
 const enlarged=engine.layout(m.shape('one two three',undefined,undefined,{size:40,tracking:1}),paths);expect(enlarged.overflow).toBeLessThan(before.overflow);
});
it('broader shaping retains scalar/UTF16/grapheme mapping and bounded font measurement',()=>{
 const m=new TextMeasurer(()=>10),shape=m.shape('e\u0301🙂字');expect(shape.diagnostic).toBeUndefined();expect(shape.clusters.map(c=>[c.start,c.end,c.utf16Start,c.utf16End])).toEqual([[0,2,0,2],[2,3,2,4],[3,4,4,5]]);const layout=new FlowEngine().layout(shape,[new PathCache().get(defaultComposition().paths[0])]);expect(layout.boundaries).toEqual([0,2,3,4]);for(const i of layout.boundaries!){const p=caretAt(layout,i)!;expect(hitCaret(layout,p.x,p.y-7)?.index).toBe(i);}const count=m.measurements;m.shape('e\u0301🙂字',undefined,shape);expect(m.measurements).toBe(count);expect(m.shape('العربية').diagnostic).toBeTruthy();
});

it('shares shaping across mounted occurrences and releases the source cache',async()=>{
 const {acquireSourceMeasurer}=await import('./measurement');let reads=0;const owner={},measure=()=>{reads++;return 10;},a=acquireSourceMeasurer(owner,'source',measure),b=acquireSourceMeasurer(owner,'source',measure);
 const first=a.shape('text',()=>'',undefined,undefined,'');expect(b.shape('text',()=>'',undefined,undefined,'')).toBe(first);const before=reads,second=a.shape('texts',()=>'',first,undefined,'');expect(b.shape('texts',()=>'',first,undefined,'')).toBe(second);expect(reads-before).toBe(1);a.release();b.release();const c=acquireSourceMeasurer(owner,'source',measure);expect(c.shape('text',()=>'',undefined,undefined,'')).not.toBe(first);c.release();
});

it('reuses fitted source layout across occurrences while invalidating changed geometry',()=>{
 const shape=new LatinMeasurer(()=>10).shape('shared source'),path=defaultComposition().paths[0],a=new FlowEngine(),b=new FlowEngine(),first=a.layout(shape,[new PathCache().get(path)]);
 expect(b.layout(shape,[new PathCache().get(path)])).toBe(first);expect(b.fits).toBe(0);const changed=b.layout(shape,[new PathCache().get({...path,width:50})]);expect(changed).not.toBe(first);expect(b.fits).toBe(1);expect(changed.overflow).toBeLessThan(first.overflow);
});
