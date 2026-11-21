import {providerSettings,type ProviderSettings} from './dcp/provider-contract';
import {copyVocabularySelection,type VocabularySelection} from './dcp/vocabulary-contract';
import {workspaceTabs,type ConversationWorkspaceTabs} from './workspace-tabs';

/** Absent fields inherit application defaults. Unknown versions remain untouched. */
export interface ConversationPreferences {version:1;provider?:ProviderSettings;vocabulary?:VocabularySelection;participantId?:string;workspace?:ConversationWorkspaceTabs}
export function conversationPreferences(value:unknown):ConversationPreferences {
 const v=value as Partial<ConversationPreferences>|undefined;
 if(!v||v.version!==1)return {version:1};
 const result:ConversationPreferences={version:1};
 try{if(v.provider)result.provider=providerSettings(v.provider);}catch{/* Invalid legacy override inherits defaults. */}
 try{if(v.vocabulary)result.vocabulary=copyVocabularySelection(v.vocabulary);}catch{}
 if(typeof v.participantId==='string'&&v.participantId.length<=200)result.participantId=v.participantId;
 const workspace=workspaceTabs(v.workspace);if(workspace)result.workspace=workspace;
 return result;
}
