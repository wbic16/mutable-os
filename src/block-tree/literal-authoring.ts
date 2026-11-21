import type {ExistingBlockDto} from './types';

export const STANDOFF_CODE='standoff-code-block';
export const codeOperation={purpose:'Present exact literal code in a native CodeBlock.',parameters:{language:{type:'string',minLength:1,maxLength:64},text:{type:'string'}},nativeEffects:[STANDOFF_CODE,'standoff-editor-block','metadata.markdownCode.language']} as const;
export function validateCodeLanguage(language:unknown):string {
 if(typeof language!=='string'||!language.trim()||language.length>64||/[\u0000-\u001f\u007f]/.test(language))throw Error('Invalid code language');
 return language;
}
export function validateLiteralText(text:unknown):asserts text is string {
 if(typeof text!=='string'||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))throw Error('Invalid literal text');
}
/** Same factory for the human menu and DCP. Highlighting is a separate native view service. */
export function standoffCodeDto(language='javascript',text=''):ExistingBlockDto {
 validateCodeLanguage(language);validateLiteralText(text);
 return {id:crypto.randomUUID(),type:STANDOFF_CODE,metadata:{markdownCode:{language}},children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text}]};
}
