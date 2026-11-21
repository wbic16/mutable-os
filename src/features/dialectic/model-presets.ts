import type {Provider} from './dcp/provider-contract';
export const defaultOpenAiModel='gpt-6.1-sol';
// Public aliases supporting Responses, streaming, function calling and structured
// outputs, checked 2026-11-11: https://developers.openai.com/api/docs/models/all
// Individual model pages document those capabilities. Account access is checked
// by the API request; this is not an account-specific availability inventory.
// Excludes shut-down models, non-chat modalities and incompatible Pro variants.
// Dated snapshots and account-specific IDs remain available through Custom model.
export const modelPresets:Record<Provider,{id:string;label:string}[]>={
 openai:[
  {id:defaultOpenAiModel,label:'GPT-6.1 Sol (default)'},
  {id:'gpt-6.1-terra',label:'GPT-6.1 Terra'},
  {id:'gpt-6-astra',label:'GPT-6 Astra'},
  {id:'gpt-6-sol',label:'GPT-6 Sol'},
  {id:'gpt-6-luna',label:'GPT-6 Luna'},
  {id:'gpt-5.6-sol',label:'GPT-5.6 Sol'},
  {id:'gpt-5.6-terra',label:'GPT-5.6 Terra'},
  {id:'gpt-5.6-luna',label:'GPT-5.6 Luna'},
  {id:'gpt-5.5',label:'GPT-5.5'},
  {id:'gpt-5.4',label:'GPT-5.4'},
  {id:'gpt-5.4-mini',label:'GPT-5.4 Mini'},
  {id:'gpt-5.2',label:'GPT-5.2'},
  {id:'chat-latest',label:'Chat Latest'},
  {id:'gpt-6-cyber',label:'GPT-6 Cyber — specialised'},
  {id:'gpt-5.6-cyber',label:'GPT-5.6 Cyber — specialised'},
  {id:'gpt-5.4-nano',label:'GPT-5.4 Nano (deprecated)'},
  {id:'gpt-5.3-codex',label:'GPT-5.3 Codex (deprecated)'},
  {id:'gpt-5.1',label:'GPT-5.1 (deprecated)'},
  {id:'gpt-5',label:'GPT-5 (deprecated)'},
  {id:'gpt-5-mini',label:'GPT-5 Mini (deprecated)'},
  {id:'gpt-5-nano',label:'GPT-5 Nano (deprecated)'},
  {id:'o3',label:'o3 (deprecated)'},
  {id:'gpt-4.1',label:'GPT-4.1 (deprecated)'},
  {id:'gpt-4.1-mini',label:'GPT-4.1 Mini (deprecated)'},
  {id:'gpt-4o',label:'GPT-4o (deprecated)'},
  {id:'gpt-4o-mini',label:'GPT-4o Mini (deprecated)'},
 ],
 anthropic:[{id:'claude-sonnet-5-5',label:'Claude Sonnet 5.5 (default)'},{id:'claude-haiku-5-5',label:'Claude Haiku 5.5'}],
};
export const defaultModel=(provider:Provider)=>modelPresets[provider][0].id;
