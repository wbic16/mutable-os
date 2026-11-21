import {exactMessage, nodeToken} from './mermaid-navigation';

/** Images are supplied separately from Mermaid source, after its SVG is sanitized. */
export function diagramThumbnailUrl(value: unknown): value is string {
 if (typeof value !== 'string') return false;
 if (value.length <= 100000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)) return true;
 if (value.length > 2048) return false;
 try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function installMermaidThumbnails(root: Element, token: string, portraits: Record<string, string>, context: Window = window) {
 const ns = 'http://www.w3.org/2000/svg';
 const slots = new Map<string, {group: SVGGElement; fallback: SVGGElement; x: number; y: number; image?: SVGImageElement; url?: string}>();
 // Read each reserved slot once. Loading images and camera gestures never measure nodes.
 const geometry = [...root.querySelectorAll<SVGGElement>('g[data-gloss-node]')].flatMap(node => {
  const id = node.getAttribute('data-gloss-node')!, rect = node.querySelector<SVGRectElement>('rect.label-container');
  if (!nodeToken(id) || !Object.hasOwn(portraits, id) || !rect) return [];
  const box = rect.getBBox(); return [{node, id, x: box.x + box.width / 2 - 24, y: box.y + 10}];
 });
 for (const {node, id, x, y} of geometry) {
  // Three generated placeholder lines reserve space in Mermaid's own layout.
  for (const line of [...node.querySelectorAll('.text-outer-tspan')].slice(0, 3)) line.setAttribute('visibility', 'hidden');
  const group = document.createElementNS(ns, 'g'), fallback = document.createElementNS(ns, 'g');
  group.setAttribute('aria-hidden', 'true'); group.setAttribute('data-semantic-portrait', id);
  const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', String(x + 24)); circle.setAttribute('cy', String(y + 24)); circle.setAttribute('r', '24'); circle.setAttribute('fill', '#eee8ff');
  const initials = document.createElementNS(ns, 'text'); initials.setAttribute('x', String(x + 24)); initials.setAttribute('y', String(y + 30)); initials.setAttribute('text-anchor', 'middle'); initials.setAttribute('fill', '#67548d');
  initials.textContent = portraits[id].split(/\s+/).map(word => [...word][0]).slice(0, 2).join('');
  fallback.append(circle, initials); group.append(fallback); node.append(group); slots.set(id, {group, fallback, x, y});
 }
 const message = (event: MessageEvent) => {
  const data = event.data;
  if (event.source !== context.parent || !exactMessage(data, ['kind', 'token', 'node', 'url']) || data.kind !== 'diagram-thumbnail' || data.token !== token || !nodeToken(data.node) || !(data.url === null || diagramThumbnailUrl(data.url))) return;
  const slot = slots.get(data.node); if (!slot || slot.url === (data.url ?? undefined)) return;
  slot.image?.remove(); slot.image = undefined; slot.url = data.url ?? undefined; slot.fallback.removeAttribute('visibility');
  if (!data.url) return;
  const image = document.createElementNS(ns, 'image'); slot.image = image;
  image.setAttribute('x', String(slot.x)); image.setAttribute('y', String(slot.y)); image.setAttribute('width', '48'); image.setAttribute('height', '48'); image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  image.addEventListener('load', () => { if (slot.image === image) slot.fallback.setAttribute('visibility', 'hidden'); }, {once: true});
  image.addEventListener('error', () => { image.remove(); if (slot.image === image) slot.fallback.removeAttribute('visibility'); }, {once: true});
  image.setAttribute('href', data.url); slot.group.append(image);
 };
 context.addEventListener('message', message);
 return () => { context.removeEventListener('message', message); for (const slot of slots.values()) slot.group.remove(); };
}
