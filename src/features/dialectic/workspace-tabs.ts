export const workspaceTabTypes=['conversation','media','attachments','semantics'] as const;
export type WorkspaceTabType=typeof workspaceTabTypes[number];
export interface ConversationWorkspaceTab {id:string;title:string;type:WorkspaceTabType}
export interface ConversationWorkspaceTabs {version:1;tabs:ConversationWorkspaceTab[]}
export const defaultWorkspaceTabs=():ConversationWorkspaceTabs=>({version:1,tabs:workspaceTabTypes.map(type=>({id:type,type,title:type[0].toUpperCase()+type.slice(1)}))});
/** View configuration travels with native Conversation preferences, never a copy of its Document. */
export function workspaceTabs(value:unknown):ConversationWorkspaceTabs|undefined {
 const v=value as ConversationWorkspaceTabs|undefined;
 if(!v||v.version!==1||!Array.isArray(v.tabs)||v.tabs.length<1||v.tabs.length>24||new Set(v.tabs.map(t=>t?.id)).size!==v.tabs.length)return;
 if(v.tabs.some(t=>!t||typeof t.id!=='string'||!t.id||t.id.length>100||typeof t.title!=='string'||!t.title.trim()||t.title.length>80||/[\r\n]/.test(t.title)||!workspaceTabTypes.includes(t.type))||v.tabs.filter(t=>t.type==='conversation').length!==1)return;
 return {version:1,tabs:v.tabs.map(({id,title,type})=>({id,title,type}))};
}
