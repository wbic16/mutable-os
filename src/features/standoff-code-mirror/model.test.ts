import { describe,it,expect } from 'vitest';
import { ChangeSet } from '@codemirror/state';
import { Coordinates,mapChanges,normalizeLineEndings } from './model';
import { mapStandoffPropertiesForReplacement } from '../../interchange/ranges';
import { project } from './projection';

describe('Mutable mapping parity',()=>{
  it('matches all 1764 insertion/deletion/replacement cases',()=>{
    let cases=0;const text='abcdef';
    for(let start=0;start<=6;start++)for(let end=start;end<=6;end++)for(const insert of ['', 'x','xy'])for(let a=0;a<6;a++)for(let b=a;b<6;b++){
      const p={id:'p',type:'unknown',start:a,end:b,value:'entity',metadata:{x:1},future:{keep:true}},origins:(number|null)[]=[];
      const expected=mapStandoffPropertiesForReplacement([p],start,end,insert.length,origins,6);
      expect(mapChanges(text,[p],ChangeSet.of({from:start,to:end,insert},6))).toEqual({properties:expected,origins});cases++;
    }
    expect(cases).toBe(1764);
  });
  it('maps compound changes in source coordinates and retains origins',()=>{
    const p=[{id:'a',type:'note',start:1,end:2},{id:'b',type:'note',start:4,end:5},{type:'unknown',start:0,end:5,extra:9}];
    const result=mapChanges('abcdef',p,ChangeSet.of([{from:0,insert:'😀'},{from:1,to:3,insert:'X'},{from:6,insert:'!'}],6));
    expect(result.origins).toEqual([1,2]);expect(result.properties).toEqual([{...p[1],start:4,end:5},{...p[2],start:1,end:5}]);
  });
  it.each(['before','after'])('handles both imported point representations with %s affinity',affinity=>{
    for(const end of [2,1]){
      const point={id:'point',type:'note',start:2,end,isZeroWidth:true,affinity};
      const mapped=mapChanges('abcd',[point],ChangeSet.of({from:2,insert:'x'},4)).properties[0];
      expect(mapped.start).toBe(affinity==='before'?2:3);expect(mapped.end).toBe(mapped.start);
      expect(mapChanges('abcd',[point],ChangeSet.of({from:1,to:3,insert:''},4)).properties).toEqual([]);
    }
  });
});
it.each(['ASCII','漢字','A😀B','👩‍💻','e\u0301','a\nb','a\r\nb','a\rb\r\nc\nd'])('converts Unicode and line endings: %s',text=>{
  const c=new Coordinates(text);for(let i=0;i<=c.length;i++)if(c.boundaries[i]>=0)expect(c.canonical(c.native(i))).toBe(i);
  const result=normalizeLineEndings(text,[{id:'p',type:'future',start:0,end:[...text].length-1,unknown:{x:1}}]);
  expect(result.text).toBe(text.replace(/\r\n?/g,'\n'));expect(result.properties[0]).toMatchObject({start:0,end:[...result.text].length-1,unknown:{x:1}});
});
it('rejects surrogate and ambiguous CRLF boundaries without rewriting imports',()=>{
  expect(()=>new Coordinates('😀').canonical(1)).toThrow();expect(()=>normalizeLineEndings('a\r\nb',[{start:2,end:3}])).toThrow();
  expect(()=>mapChanges('😀',[],ChangeSet.of({from:1,insert:'x'},2))).toThrow();
});
it('projects independent identical/nested/crossing/adjacent ranges and points',()=>{
  const properties=[[0,2],[0,2],[1,1],[2,3],[3,3]].map(([start,end],i)=>({id:'same',type:'unknown',start,end,extra:i}));
  const p=project('abcd',[...properties,{start:2,end:1,isZeroWidth:true,type:'point'}],['a','b','c','d','e','f']);const found:string[]=[];
  p.index.between(0,4,(_a,_b,v)=>{found.push(v.identity);});expect(found.sort()).toEqual(['a','b','c','d','e','f']);expect(p.invalid).toBe(0);
});
