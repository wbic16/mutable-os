import {describe,expect,it} from 'vitest';
import {defaultTextualFont,normaliseTextualFont,textualFontPixels,uniformAdvances} from './fonts';
import {loadPreferences,savePreferences,normalisePreferences} from './grid';
describe('Textual font preferences',()=>{
 it('upgrades existing preferences without altering unrelated settings',()=>{
  expect(normalisePreferences({zoom:1.1,palette:'paper',readingWidth:0})).toEqual({zoom:1.1,palette:'paper',readingWidth:0,font:defaultTextualFont});
  expect(normaliseTextualFont({source:'other',family:'missing',size:NaN,lineHeight:Infinity})).toEqual(defaultTextualFont);
  expect(normaliseTextualFont({size:100,lineHeight:1})).toMatchObject({size:32,lineHeight:36});
 });
 it('persists font choices using the existing preferences and preserves spaces during family entry',()=>{
  const value=normalisePreferences({font:{source:'system',family:'Courier New ',size:19,lineHeight:25},zoom:1.1});savePreferences(value);expect(loadPreferences()).toEqual(value);localStorage.removeItem('mutable.textual.preferences.v1');
 });
 it('uses base size times zoom and a quantized shared row pitch',()=>{
  expect(textualFontPixels({...defaultTextualFont,size:18,lineHeight:23},1.1)).toEqual({size:19.8,lineHeight:25.3125});
 });
 it('rejects unequal/fallback advances while allowing browser layout rounding',()=>{
  expect(uniformAdvances([9.609375,9.609375,9.609375])).toBe(true);
  expect(uniformAdvances([9.6,9.61])).toBe(true);expect(uniformAdvances([9.6,8])).toBe(false);expect(uniformAdvances([0])).toBe(false);expect(uniformAdvances([NaN])).toBe(false);
 });
});
