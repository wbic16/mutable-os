import {For,Show,onMount} from 'solid-js';
import {bundledTextualFonts,defaultTextualFont,type TextualFontSettings} from './fonts';
export function TextualFontSettingsPanel(props:{value:TextualFontSettings;change(value:TextualFontSettings):void;close():void;notice:string;loading:boolean;effective:string}){
 let panel!:HTMLDivElement;
 onMount(()=>panel.querySelector<HTMLSelectElement>('select')?.focus());
 const change=(patch:Partial<TextualFontSettings>)=>props.change({...props.value,...patch});
 return <div class="tw-font-settings tw-frame" ref={panel} role="dialog" aria-label="Textual Presentation Settings" data-native-context-menu onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();props.close();}
  if(e.key==='Tab'){const controls=[...panel.querySelectorAll<HTMLElement>('button,input,select')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
  <header><strong>Textual Presentation Settings</strong><button onClick={props.close} aria-label="Close font settings">Close</button></header>
  <label>Font source <select aria-label="Font source" value={props.value.source} onChange={e=>change({source:e.currentTarget.value as TextualFontSettings['source'],family:e.currentTarget.value==='bundled'?defaultTextualFont.family:'Courier New'})}><option value="bundled">Bundled</option><option value="system">System</option></select></label>
  <Show when={props.value.source==='bundled'} fallback={<label>Font family <input aria-label="System font family" list="tw-system-fonts" value={props.value.family} onInput={e=>change({family:e.currentTarget.value})}/><datalist id="tw-system-fonts"><For each={['Menlo','Consolas','Cascadia Mono','Courier New','DejaVu Sans Mono','Liberation Mono']}>{name=><option value={name}/>}</For></datalist></label>}>
   <label>Font family <select aria-label="Bundled font family" value={props.value.family} onChange={e=>change({family:e.currentTarget.value})}><For each={bundledTextualFonts}>{font=><option value={font.family}>{font.label}</option>}</For></select></label>
  </Show>
  <div class="tw-font-numbers"><label>Font size <input aria-label="Font size" type="number" min="12" max="32" value={props.value.size} onChange={e=>change({size:e.currentTarget.valueAsNumber})}/></label><label>Line height <input aria-label="Line height" type="number" min={Math.ceil(props.value.size*1.1)} max={Math.floor(props.value.size*2.5)} value={props.value.lineHeight} onChange={e=>change({lineHeight:e.currentTarget.valueAsNumber})}/></label></div>
  <p role="status">{props.loading?'Loading font…':props.notice||`Using ${props.effective}. Changes are saved as Textual preferences.`}</p>
  <pre class="tw-font-preview" aria-label="Font preview">{'┌──────────────────────────────┐\n│ File  Edit  View   [ Close ] │\n├──────────────────────────────┤\n│ ABCDEFGHIJKLMNOPQRSTUVWXYZ   │\n│ abcdefghijklmnopqrstuvwxyz   │\n│ 0123456789 !?.,:; +-*/ ()[]{}│\n└──────────────────────────────┘\n╔══════════════════════════════╗\n║ A clear view of words.       ║\n╚══════════════════════════════╝'}</pre>
  <p class="tw-font-prose">Letters, ideas and evidence belong together. Read comfortably, follow a thought, and return to the passage that matters.</p>
  <footer><button onClick={()=>props.change({...defaultTextualFont})}>Reset to Defaults</button><span>Font size × workspace zoom</span></footer>
 </div>;
}
