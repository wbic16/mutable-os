// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {diagramThumbnailUrl, installMermaidThumbnails} from './mermaid-thumbnails';
import {installMermaidNavigation} from './mermaid-navigation';

afterEach(() => {vi.restoreAllMocks(); document.body.replaceChildren();});

it('allows HTTPS and bounded PNG/JPEG thumbnails, excluding executable or arbitrary local URLs', () => {
 expect(diagramThumbnailUrl('https://example.org/portrait.jpg')).toBe(true);
 expect(diagramThumbnailUrl('data:image/png;base64,AAAA')).toBe(true);
 for (const url of ['javascript:alert(1)', 'file:///image.png', 'http://localhost/a', 'https://user:pass@example.org/a', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,' + 'A'.repeat(100001)]) expect(diagramThumbnailUrl(url)).toBe(false);
});

it('updates only known portrait slots without layout reads and preserves selection and initials on failure', () => {
 document.body.innerHTML='<svg><g class="node" id="flowchart-G0-0"><rect class="label-container"/><text><tspan class="text-outer-tspan">MMMMMM</tspan><tspan class="text-outer-tspan">MMMMMM</tspan><tspan class="text-outer-tspan">MMMMMM</tspan><tspan class="text-outer-tspan">Ada</tspan></text></g></svg>';
 const root=document.querySelector('svg')!, rect=root.querySelector('rect')!, measure=vi.fn(()=>({x:-70,y:-60,width:140,height:120}));Object.assign(rect,{getBBox:measure});
 const navigation=installMermaidNavigation(root,{token:'n',nodes:{G0:'Ada Lovelace'}}),stop=installMermaidThumbnails(root,'n',{G0:'Ada Lovelace'});
 const message=(node:string,url:string|null,token='n')=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{kind:'diagram-thumbnail',token,node,url}}));
 message('G0','https://example.org/a.png','wrong');message('G1','https://example.org/a.png');message('G0','javascript:alert(1)');expect(root.querySelector('image')).toBeNull();
 message('G0','https://example.org/a.png');const image=root.querySelector('image')!,fallback=root.querySelector('[data-semantic-portrait]>g')!;
 expect(image.getAttribute('href')).toBe('https://example.org/a.png');expect(image.getAttribute('width')).toBe('48');expect(fallback.textContent).toBe('AL');
 image.dispatchEvent(new Event('load'));expect(fallback.getAttribute('visibility')).toBe('hidden');
 const select=vi.spyOn(window,'postMessage').mockImplementation(()=>{});image.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(select).toHaveBeenCalledWith({kind:'gloss-node-select',token:'n',node:'G0',sequence:1},'*');
 message('G0','https://example.org/b.png');root.querySelector('image')!.dispatchEvent(new Event('error'));expect(root.querySelector('image')).toBeNull();expect(fallback.hasAttribute('visibility')).toBe(false);
 expect(measure).toHaveBeenCalledTimes(1);expect(root.querySelectorAll('.text-outer-tspan[visibility=hidden]')).toHaveLength(3);
 stop();message('G0','https://example.org/c.png');expect(root.querySelector('image')).toBeNull();navigation();
});
