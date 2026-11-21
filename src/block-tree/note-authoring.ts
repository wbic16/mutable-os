import type {ExistingBlockDto} from './types';
export const noteSize={type:'object',properties:{width:{type:'number',minimum:200},height:{type:'number',minimum:160}},required:['width','height'],additionalProperties:false} as const;
export function noteDimensions(value:unknown):{width:number;height:number} {
 const v=value as any;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['width','height'].includes(k))||!Number.isFinite(v.width)||!Number.isFinite(v.height)||v.width<200||v.height<160)throw Error('Invalid sticky note dimensions');
 return {width:v.width,height:v.height};
}
export function prepareStickyNote(content:ExistingBlockDto[],size:unknown=null):ExistingBlockDto {
 if(!content.length)throw Error('Sticky notes need content');
 return {id:crypto.randomUUID(),type:'sticky-note-block',metadata:{colour:'yellow',material:'paper',overflowMode:'scroll',fontStep:0,...(size===null?{}:{size:noteDimensions(size)})},children:content};
}
export function stickyNoteDto(text=''):ExistingBlockDto {
 return prepareStickyNote([{id:crypto.randomUUID(),type:'standoff-editor-block',text,standoffProperties:[],children:[]}]);
}
/** Native Add Canvas exposes this local demonstration preview, not a saved spatial canvas. */
export const canvasPreviewDto=():ExistingBlockDto=>({id:crypto.randomUUID(),type:'canvas-block',children:[]});
