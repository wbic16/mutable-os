import {exactMessage} from './mermaid-navigation';

export type DiagramViewportAction = 'in' | 'out' | 'reset';

/** Camera state lives entirely in the sandbox; gestures never rebuild the graph. */
export function installMermaidViewport(svg: SVGSVGElement, token: string, context: Window = window) {
 const initial = (svg.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
 if (initial.length !== 4 || !initial.every(Number.isFinite) || initial[2] <= 0 || initial[3] <= 0) return () => {};
 let [x, y, width, height] = initial, zoom = 1;
 let drag: {id: number; x: number; y: number; inverse: DOMMatrix} | undefined;
 const draw = () => svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
 const point = (clientX: number, clientY: number, inverse: DOMMatrix) => {
  const p = svg.createSVGPoint(); p.x = clientX; p.y = clientY; return p.matrixTransform(inverse);
 };
 const scale = (factor: number, anchor = {x: x + width / 2, y: y + height / 2}) => {
  const next = Math.max(.25, Math.min(4, zoom * factor)), ratio = zoom / next;
  x = anchor.x + (x - anchor.x) * ratio; y = anchor.y + (y - anchor.y) * ratio;
  width *= ratio; height *= ratio; zoom = next; draw();
 };
 const wheel = (event: WheelEvent) => {
  const matrix = svg.getScreenCTM(); if (!matrix || drag) return;
  event.preventDefault();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? context.innerHeight : 1);
  scale(Math.exp(-Math.max(-300, Math.min(300, delta)) * .002), point(event.clientX, event.clientY, matrix.inverse()));
 };
 const down = (event: PointerEvent) => {
  if (event.button !== 0 || drag || (event.target as Element)?.closest('[data-gloss-node]')) return;
  const matrix = svg.getScreenCTM(); if (!matrix) return;
  event.preventDefault();
  drag = {id: event.pointerId, x: event.clientX, y: event.clientY, inverse: matrix.inverse()};
  svg.setPointerCapture(event.pointerId); svg.style.cursor = 'grabbing';
 };
 const move = (event: PointerEvent) => {
  if (!drag || event.pointerId !== drag.id) return;
  const previous = point(drag.x, drag.y, drag.inverse), current = point(event.clientX, event.clientY, drag.inverse);
  x -= current.x - previous.x; y -= current.y - previous.y;
  drag.x = event.clientX; drag.y = event.clientY; draw();
 };
 const end = (event?: PointerEvent) => {
  if (!drag || event && event.pointerId !== drag.id) return;
  const id = drag.id; drag = undefined;
  if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
  svg.style.cursor = 'grab';
 };
 const message = (event: MessageEvent) => {
  const data = event.data;
  if (event.source !== context.parent || !exactMessage(data, ['kind', 'token', 'action']) || data.kind !== 'diagram-viewport' || data.token !== token) return;
  if (data.action === 'reset') { end(); [x, y, width, height] = initial; zoom = 1; draw(); }
  else if (data.action === 'in' || data.action === 'out') { end(); scale(data.action === 'in' ? 1.25 : .8); }
 };
 const original = {cursor: svg.style.cursor, touchAction: svg.style.touchAction, maxWidth: svg.style.maxWidth};
 // Mermaid's inline max-width otherwise leaves non-interactive margins in the frame.
 svg.style.maxWidth = 'none'; svg.style.cursor = 'grab'; svg.style.touchAction = 'none';
 svg.addEventListener('wheel', wheel, {passive: false});
 svg.addEventListener('pointerdown', down); svg.addEventListener('pointermove', move);
 svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end); svg.addEventListener('lostpointercapture', end);
 const cancel = () => end();
 context.addEventListener('message', message); context.addEventListener('blur', cancel); context.addEventListener('resize', cancel);
 return () => {
  end(); Object.assign(svg.style, original);
  svg.removeEventListener('wheel', wheel); svg.removeEventListener('pointerdown', down); svg.removeEventListener('pointermove', move);
  svg.removeEventListener('pointerup', end); svg.removeEventListener('pointercancel', end); svg.removeEventListener('lostpointercapture', end);
  context.removeEventListener('message', message); context.removeEventListener('blur', cancel); context.removeEventListener('resize', cancel);
 };
}
