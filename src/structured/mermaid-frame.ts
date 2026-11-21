import mermaid from 'mermaid';
import {installMermaidThumbnails} from './mermaid-thumbnails';
import {installMermaidViewport} from './mermaid-viewport';
import {installMermaidNavigation,glossNodeStyle} from './mermaid-navigation';
import {decodeNumericSvgLabels} from './numeric-svg-labels';
// A self-contained opaque sandbox. Optional Entity portraits allow image loads only.
const input=(window as any).structuredInput;
(async()=>{try{
 // The sandbox can execute before its first layout. Sequence diagrams measure SVG
 // text immediately. Offscreen frames throttle rAF, so finish document setup and
 // flush this isolated frame's layout without waiting for a visible animation.
 if(document.readyState==='loading')await new Promise<void>(resolve=>document.addEventListener('DOMContentLoaded',()=>resolve(),{once:true}));
 await document.fonts.ready;
 document.body.getBoundingClientRect();
 mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:20000,maxEdges:500,suppressErrorRendering:true,secure:['securityLevel','startOnLoad','maxTextSize','maxEdges','htmlLabels','flowchart','secure'],theme:'neutral'});
 const {svg}=await mermaid.render('diagram',input.source);
 if(svg.length>2*1024*1024)throw Error('Diagram SVG size limit');
 const parsed=new DOMParser().parseFromString(svg,'image/svg+xml'),root=parsed.documentElement;
 if(root.tagName!=='svg'||root.querySelectorAll('*').length>10000)throw Error('Diagram complexity limit');
 for(const node of root.querySelectorAll('script,foreignObject,image,a,iframe,object,embed,animate,set'))node.remove();
 for(const node of [root,...root.querySelectorAll('*')])for(const a of [...node.attributes])if(/^on/i.test(a.name)||/href$/i.test(a.name)&&!a.value.startsWith('#'))node.removeAttribute(a.name);
 if(input.numericLabelEntities)decodeNumericSvgLabels(root);
 if(input.naturalSize){const box=(root.getAttribute('viewBox')??'').trim().split(/\s+/).map(Number);if(box.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0&&box[2]<=100000&&box[3]<=100000){(root as unknown as SVGElement).style.maxWidth='none';(root as unknown as SVGElement).style.width=box[2]+'px';(root as unknown as SVGElement).style.height=box[3]+'px';}}
 document.body.replaceChildren(document.importNode(root,true));if(input.navigation){const style=document.createElement('style');style.textContent=glossNodeStyle;document.head.append(style);installMermaidNavigation(document.body.firstElementChild!,{token:input.token,...input.navigation});}if(input.portraits)installMermaidThumbnails(document.body.firstElementChild!,input.token,input.portraits);if(input.panZoom)installMermaidViewport(document.body.firstElementChild as SVGSVGElement,input.token);parent.postMessage({token:input.token,ok:true},'*');
 }catch(e){document.body.textContent='Diagram unavailable';parent.postMessage({token:input.token,error:String(e).slice(0,1000)},'*');}})();
