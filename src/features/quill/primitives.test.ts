import {it,expect} from 'vitest';
import {pathKinds,validPath,defaultComposition,validQuill} from './model';
import {PathCache,pathPreset,freeformPath} from './geometry';
it.each(pathKinds)('samples bounded %s geometry with reversible canonical direction',kind=>{
 const p=pathPreset(kind,{id:'p',kind:'line',x:20,y:30,width:300});expect(validPath(p)).toBe(true);const cache=new PathCache(),g=cache.get(p),reverse=cache.get({...p,reverse:true});expect(g.length).toBeGreaterThan(0);expect(reverse.point(0).x).toBeCloseTo(g.point(g.length).x,4);expect(reverse.point(reverse.length).y).toBeCloseTo(g.point(0).y,4);expect(cache.get(p)).toBe(g);
 const free=freeformPath(p);expect(validPath(free)).toBe(true);expect(free.nodes!.length).toBeLessThanOrEqual(66);expect(cache.get(free).point(0).x).toBeCloseTo(g.point(0).x,4);
});
it('bounds editable nodes, effects and layers; admits existing geometry unchanged',()=>{
 const c=defaultComposition();expect(validQuill(c)).toBe(true);c.paths[0]=pathPreset('bezier',c.paths[0]);expect(validQuill(c)).toBe(true);c.paths[0].nodes![0].outX=Infinity;expect(validQuill(c)).toBe(false);
});
