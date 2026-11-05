import {defaultTextualFont} from './fonts';
import { describe, expect, it } from 'vitest';
import { cellStyle, measuredGrid, normalisePreferences } from './grid';
describe('Textual measured grid', () => {
  it('derives cell counts and shared edges without rounding accumulated pitches', () => {
    const grid = measuredGrid(1920,1080,9.6328125,20);
    expect(grid.columns).toBe(199); expect(grid.rows).toBe(54);
    const a = cellStyle(grid,{col:0,row:1,widthCells:100,heightCells:2});
    const b = cellStyle(grid,{col:100,row:1,widthCells:99,heightCells:2});
    expect(a.width).toBe(b.left);
    expect(parseFloat(b.left)+parseFloat(b.width)).toBeLessThanOrEqual(1920);
    expect(measuredGrid(3,5,10,20)).toMatchObject({columns:0,rows:0});
  });
  it('rejects invalid metrics and noninteger rectangles', () => {
    for(const w of [0,-1,NaN,Infinity]) expect(()=>measuredGrid(800,600,w,20)).toThrow();
    expect(()=>cellStyle(measuredGrid(100,100,10,20),{col:.5,row:0,widthCells:2,heightCells:1})).toThrow();
  });
  it('bounds preferences and handles corrupt local values', () => {
    expect(normalisePreferences({readingWidth:0}).readingWidth).toBe(0);
    expect(normalisePreferences(null)).toEqual({zoom:1,palette:'borland',readingWidth:88,font:defaultTextualFont});
    expect(normalisePreferences({zoom:Infinity,palette:'other'})).toEqual({zoom:1,palette:'borland',readingWidth:88,font:defaultTextualFont});
    expect(normalisePreferences({zoom:20,palette:'paper'})).toEqual({zoom:2,palette:'paper',readingWidth:88,font:defaultTextualFont});
  });
});
