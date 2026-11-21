/** A host utility result, never a DCP contribution or source authority. */
export const titleLimits={input:4000,characters:120,outputTokens:512,deadlineMs:20000};
export const titleSchema={type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false};
export function parseConversationTitle(value:unknown):string{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1)throw Error('Invalid conversation title');
 const title=(value as {title?:unknown}).title;
 if(typeof title!=='string'||!title.trim()||title.trim().length>titleLimits.characters||/[\x00-\x1f\x7f]/.test(title))throw Error('Invalid conversation title');
 return title.trim();
}
