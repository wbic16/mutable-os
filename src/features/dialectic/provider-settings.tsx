import {createEffect,createSignal,For,Show} from 'solid-js';
import {defaultModel,modelPresets} from './model-presets';
import type {DialecticController} from './controller';
import {outputTokenLimits,type Provider,type ProviderSettings} from './dcp/provider-contract';

/** Shared compact controls; inherited Desktop/Textual chrome remains independent. */
export function ProviderSettingsView(props:{c:DialecticController}){
 const c=props.c,[settings,setSettings]=createSignal<ProviderSettings>({...c.providerSettings()});let key!:HTMLInputElement;
 const [custom,setCustom]=createSignal(!modelPresets[settings().provider].some(m=>m.id===settings().model));
 createEffect(()=>{c.resourceId();setSettings({...c.providerSettings()});setCustom(!modelPresets[c.providerSettings().provider].some(m=>m.id===c.providerSettings().model));});
 const change=(patch:Partial<ProviderSettings>)=>setSettings(v=>({...v,...patch}));
 return <details class="dialectic-provider-settings"><summary>AI settings · {c.providerSettings().model} · {c.providerSettings().maxOutputTokens.toLocaleString()} output tokens</summary>
  <p>Keys entered here stay in the local server’s session memory. Server environment credentials remain available after reload or Forget keys. Credentials are never saved in this Document.</p>
  <Show when={c.editor.features.dialecticProviderContinuity&&settings().provider==='openai'}><p>Ask includes preceding contributions in this Document. OpenAI retains conversation memory; forgetting keys does not delete it. The Document remains authoritative.</p></Show>
  <Show when={JSON.stringify(settings())!==JSON.stringify(c.providerSettings())}><p role="status">Changes are not applied yet. Apply these conversation settings before submitting a contribution.</p></Show>
  <Show when={c.editor.features.dialecticImageGeneration&&c.editor.features.dialecticArtifacts}><p>Ask for an image to generate a PNG attachment with OpenAI. Image generation uses your OpenAI API account and is billed separately from chat. With Anthropic chat, configure an OpenAI session key first, then switch back, or use the server’s OpenAI key.</p></Show>
  <Show when={c.conversations}><p>Model, participant and vocabulary choices belong to this conversation. Changes apply to subsequent requests; finish or cancel its response before changing them. Application defaults apply when a conversation has no override.</p></Show>
  <form onSubmit={e=>{e.preventDefault();const secret=key.value;key.value='';void c.configureProvider(settings(),secret||undefined);}}>
   <fieldset disabled={c.busy()||c.providerConfiguring()}>
    <Show when={c.aiParticipants().length>1}><label>AI participant <select aria-label="AI participant" value={c.aiParticipant().id} onChange={e=>c.setSelectedAi(e.currentTarget.value)}><For each={c.aiParticipants()}>{p=><option value={p.id}>{p.name}</option>}</For></select></label></Show>
    <label>Provider <select aria-label="AI provider" value={settings().provider} onChange={e=>{const provider=e.currentTarget.value as Provider;setCustom(false);change({provider,model:defaultModel(provider)});}}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>
    <label>Model <select aria-label="AI model" value={custom()?'custom':settings().model} onChange={e=>{const value=e.currentTarget.value;setCustom(value==='custom');change({model:value==='custom'?'':value});}}><For each={modelPresets[settings().provider]}>{m=><option value={m.id}>{m.label}</option>}</For><option value="custom">Custom model…</option></select></label>
    <Show when={settings().provider==='openai'}><p>Models listed support structured replies and tools. Access depends on your OpenAI API account.</p></Show>
    <Show when={custom()}><label>Custom model ID <input aria-label="AI model ID" required maxLength={128} placeholder="Model supporting structured output and tools" value={settings().model} onInput={e=>change({model:e.currentTarget.value})}/></label></Show>
    <label>Session API key <input ref={key} aria-label="Session API key" type="password" autocomplete="off" spellcheck={false} maxLength={4096} placeholder="Leave blank to use a server key or retain the session key"/></label>
    <label>Maximum output tokens <input aria-label="Maximum output tokens" type="number" min={outputTokenLimits.min} max={outputTokenLimits.max} step="1" value={settings().maxOutputTokens} onInput={e=>change({maxOutputTokens:Number(e.currentTarget.value)})}/></label>
    <label>Response length <select aria-label="Response length" value={settings().cadence} onChange={e=>change({cadence:e.currentTarget.value as ProviderSettings['cadence']})}><option value="conversational">Conversational</option><option value="extended">Extended when useful</option></select></label>
    <label><input type="checkbox" checked={settings().repair} onChange={e=>change({repair:e.currentTarget.checked})}/> Allow one validation repair (may incur another provider charge)</label>
    <button type="submit">{c.conversations?'Use conversation settings':'Use session settings'}</button><Show when={c.conversations}><button type="button" onClick={()=>void c.inheritPreferences()}>Use application defaults</button><button type="button" onClick={()=>c.conversations?.useAsDefaults()}>Make current settings the defaults</button></Show><button type="button" onClick={()=>{key.value='';void c.forgetProvider();}}>Forget keys</button>
   </fieldset>
  </form>
  <Show when={c.providerNotice()}><p role="status">{c.providerNotice()}</p></Show>
  <p>No request is sent until Ask or Submit. Selected content and requested source reads are sent to the chosen provider. Cost is reported as unknown; the token limit is not a currency cap.</p>
 </details>;
}
