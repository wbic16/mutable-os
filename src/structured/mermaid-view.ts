import {diagramThumbnailUrl} from './mermaid-thumbnails';
import type {DiagramViewportAction} from './mermaid-viewport';
import {exactMessage,nodeToken,selectionMessage,type MermaidNavigation} from './mermaid-navigation';
import {mermaidSource} from './model';
let library:Promise<string>|undefined;
async function libraryText(){library??=fetch(new URL(import.meta.env.BASE_URL+'mutable-mermaid.js',location.origin)).then(async r=>{if(!r.ok)throw Error('Local Mermaid library unavailable');const text=await r.text();if(text.length>8*1024*1024)throw Error('Mermaid library limit');return text;}).catch(e=>{library=undefined;throw e;});return library;}
export async function diagramFrame(host:HTMLElement,source:string,signal:AbortSignal,done:(error?:string)=>void,options:{title?:string;fit?:boolean;panZoom?:boolean;portraits?:Record<string,string>;naturalSize?:boolean;numericLabelEntities?:boolean;navigation?:MermaidNavigation}={}){
 mermaidSource(source);const code=await libraryText();signal.throwIfAborted();const token=crypto.randomUUID(),frame=document.createElement('iframe');frame.title=options.title??(options.navigation?'Interactive Gloss relationship diagram':'Read-only Mermaid diagram');frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.style.cssText='width:100%;height:'+(options.fit?'100%':'440px')+';border:0;background:white';
 const navigation=options.navigation,allowed=new Set(Object.keys(navigation?.nodes??{}).filter(nodeToken));let selected=navigation?.selected,ready=false,disposed=false,sequence=0;
 const selectNode=(node?:string)=>{selected=node&&allowed.has(node)?node:undefined;if(ready&&!disposed)frame.contentWindow?.postMessage({kind:'gloss-node-selected',token,node:selected??null},'*');};
 const viewport=(action:DiagramViewportAction)=>{if(options.panZoom&&ready&&!disposed)frame.contentWindow?.postMessage({kind:'diagram-viewport',token,action},'*');};
 const portraits=Object.fromEntries(Object.entries(options.portraits??{}).filter(([node])=>allowed.has(node)).slice(0,60)),thumbnails=new Map<string,string>();
 const thumbnail=(node:string,url?:string)=>{if(!Object.hasOwn(portraits,node))return;const safe=diagramThumbnailUrl(url)?url:undefined;if(safe)thumbnails.set(node,safe);else thumbnails.delete(node);if(ready&&!disposed)frame.contentWindow?.postMessage({kind:'diagram-thumbnail',token,node,url:safe??null},'*');};
 const input=JSON.stringify({source,token,...(Object.keys(portraits).length?{portraits}:{}),panZoom:!!options.panZoom,naturalSize:!!options.naturalSize,numericLabelEntities:!!options.numericLabelEntities,...(navigation?{navigation:{nodes:navigation.nodes,selected}}:{})}).replace(/</g,'\\u003c');
 frame.srcdoc=`<!doctype html><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; img-src ${Object.keys(portraits).length?"https: data:":"'none'"}; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>body{margin:12px;font:14px sans-serif}svg{max-width:100%;height:auto}${options.fit?'html,body{height:100%;width:100%;margin:0;overflow:hidden}body{display:grid;place-items:center}svg{width:100%;height:100%;max-height:100%}':''}</style><body><script nonce="${token}">window.structuredInput=${input};window.addEventListener('error',e=>parent.postMessage({token:window.structuredInput.token,error:e.message||'Diagram script failed'},'*'));window.addEventListener('unhandledrejection',e=>parent.postMessage({token:window.structuredInput.token,error:String(e.reason)},'*'))</script><script nonce="${token}">const s=document.createElement('script');s.nonce=${JSON.stringify(token)};s.textContent=${JSON.stringify(code).replace(/</g,'\\u003c')};document.body.append(s)</script>`;
 const timer=setTimeout(()=>{dispose();done('Diagram render exceeded 8 seconds. Use Source.');},8000);
 const message=(event:MessageEvent)=>{
  if(disposed||signal.aborted||!frame.isConnected||event.source!==frame.contentWindow)return;
  const data=event.data;
  if(ready&&navigation&&selectionMessage(data,token,allowed,sequence)){sequence=data.sequence;navigation.onSelect(data.node);return;}
  if(exactMessage(data,['token','error'])&&data.token===token&&typeof data.error==='string'){dispose();done(data.error.slice(0,1000));return;}
  if(ready)return;
  if(exactMessage(data,['token','ok'])&&data.token===token&&data.ok===true){clearTimeout(timer);ready=true;frame.dataset.rendered='true';selectNode(selected);for(const [node,url]of thumbnails)thumbnail(node,url);done();}
 };
 function dispose(){disposed=true;ready=false;clearTimeout(timer);window.removeEventListener('message',message);signal.removeEventListener('abort',dispose);frame.remove();}
 window.addEventListener('message',message);signal.addEventListener('abort',dispose,{once:true});host.replaceChildren(frame);return Object.assign(dispose,{selectNode,viewport,thumbnail});
}
