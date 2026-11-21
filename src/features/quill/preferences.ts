export type QuillAppearance='midnight'|'parchment'|'mutable';
export interface QuillPreferences {appearance:QuillAppearance;workspace:'charcoal'|'paper';panels:boolean;zoom:number}
const key='mutable.quill.preferences.v1';
export function normalisePreferences(value:unknown):QuillPreferences {
 const v=value as Partial<QuillPreferences>|null;
 return {appearance:v?.appearance==='parchment'||v?.appearance==='mutable'?v.appearance:'midnight',workspace:v?.workspace==='paper'?'paper':'charcoal',panels:v?.panels!==false,zoom:typeof v?.zoom==='number'&&Number.isFinite(v.zoom)?Math.min(2,Math.max(.5,v.zoom)):1};
}
export function loadPreferences(){try{return normalisePreferences(JSON.parse(localStorage.getItem(key)??'null'));}catch{return normalisePreferences(null);}}
export function savePreferences(value:QuillPreferences){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Session-only settings remain usable. */}}
