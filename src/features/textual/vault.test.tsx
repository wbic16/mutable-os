// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {TextualVault} from './vault';
import {flintPanes} from './layout';
import type {ApplicationVault,ApplicationVaultState} from '../../feature-api/document-application';
let dispose=()=>{};afterEach(()=>{dispose();document.body.replaceChildren();});
it('reserves left-side cells without shrinking narrow editors or overlapping the other panes',()=>{
 for(const columns of [42,90,128,182]){const p=flintPanes({columns,rows:40,cellWidthPx:10,cellHeightPx:20},true,true,false,88,true);expect(p.vault+p.document+p.left+p.right).toBe(p.width);expect(p.document).toBeGreaterThan(0);expect(p.vaultWidth).toBe(28);expect(p.vaultOverlay).toBe(columns<82);}
 expect(flintPanes({columns:182,rows:40,cellWidthPx:10,cellHeightPx:20},false,false,false,88,false).vault).toBe(0);
});
it('uses existing open/refresh commands and does no listing or row work for unrelated state or active-file changes',async()=>{
 let reads=0;const location={get folder(){reads++;return 'vault';},filename:'one.ink'};
 const [state,setState]=createSignal<ApplicationVaultState>({root:'vault',folders:['vault/sub'],documents:[{id:'one',title:'One',location,state:'paired',loaded:true,tags:[]},{id:'pending',title:'Pending',location:{folder:'vault/sub',filename:'pending.ink'},state:'pending',loaded:false,tags:[]}],markdown:[],candidates:['vault/plain.md'],diagnostics:[],operations:[],readOnly:false,complete:true,busy:false,notice:''});
 const [active,setActive]=createSignal<{folder:string;filename:string}|undefined>();const openFile=vi.fn(async()=>{}),refresh=vi.fn(async()=>{}),openCandidate=vi.fn(async()=>{});
 const vault={state,openFile,refresh,openCandidate} as unknown as ApplicationVault;const opened=vi.fn(),host=document.body.appendChild(document.createElement('div'));
 dispose=render(()=><TextualVault vault={vault} activeLocation={active} collapse={()=>{}} create={()=>{}} opened={opened}/>,host);
 const one=host.querySelector<HTMLButtonElement>('[aria-label="Open vault/one.ink"]')!;expect(refresh).not.toHaveBeenCalled();const initial=reads;
 for(let i=0;i<20;i++)setState(s=>({...s,notice:String(i)}));expect(reads).toBe(initial);setActive({folder:'vault',filename:'one.ink'});expect(one.getAttribute('aria-current')).toBe('page');expect(host.querySelector('[aria-label="Open vault/one.ink"]')).toBe(one);
 one.click();await Promise.resolve();await Promise.resolve();expect(openFile).toHaveBeenCalledWith(location);expect(opened).toHaveBeenCalledOnce();expect(host.querySelector<HTMLButtonElement>('[aria-label="Open vault/sub/pending.ink"]')!.disabled).toBe(true);
 const candidate=host.querySelector<HTMLButtonElement>('[aria-label="Open vault/plain.md"]')!;candidate.click();await Promise.resolve();await Promise.resolve();expect(openCandidate).toHaveBeenCalledWith({folder:'vault',filename:'plain.md'});
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Refresh')!.click();expect(refresh).toHaveBeenCalledOnce();
});
