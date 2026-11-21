import {it,expect,vi} from 'vitest';
import {GeometrySession,linkedWaves} from './geometry-session';
import {defaultComposition,validQuill} from './model';
import {PathCache} from './geometry';
import {FlowEngine} from './layout';
import {LatinMeasurer} from './measurement';
it('previews and cancels without canonical writes; one commit per gesture; stale drafts rejected',()=>{
 let value=linkedWaves(defaultComposition());const write=vi.fn(v=>{value=v;}),g=new GeometrySession(()=>value,write),before=JSON.stringify(value);
 g.update('wave-1',{amplitude:40});g.update('wave-1',{amplitude:45});expect(write).not.toHaveBeenCalled();expect(JSON.stringify(value)).toBe(before);g.cancel();expect(write).not.toHaveBeenCalled();
 g.update('wave-1',{cycles:2,phase:1});g.commit();expect(write).toHaveBeenCalledTimes(1);expect(value.paths[0].cycles).toBe(2);g.update('wave-1',{width:333});value={...value,pathSpacing:99};expect(()=>g.commit()).toThrow('changed elsewhere');expect(g.draft).toBeUndefined();
});
it('validates phase and spacing, generates three native linked paths and reflows forward/back',()=>{
 const c=linkedWaves(defaultComposition());expect(validQuill(c)).toBe(true);expect(validQuill({...c,pathSpacing:NaN})).toBe(false);expect(validQuill({...c,paths:c.paths.map(p=>({...p,phase:Infinity}))})).toBe(false);
 const cache=new PathCache(),m=new LatinMeasurer(()=>10),engine=new FlowEngine(),paths=c.paths.map(p=>cache.get({...p,width:100})),a=engine.layout(m.shape('one two three four five six'),paths),b=engine.layout(m.shape('new words one two three four five six'),paths),again=engine.layout(m.shape('one two three four five six'),paths);
 expect(b.fragments[1].glyphs.map(g=>g.cluster.text).join('')).not.toBe(a.fragments[1].glyphs.map(g=>g.cluster.text).join(''));expect(again.fragments.map(f=>f.end)).toEqual(a.fragments.map(f=>f.end));expect(b.overflow).toBeLessThan(b.length);
});
