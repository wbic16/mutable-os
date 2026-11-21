// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {installMermaidViewport} from './mermaid-viewport';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function fixture() {
 document.body.innerHTML = '<svg viewBox="0 0 400 200"><g data-gloss-node="G0"><text>Entity</text></g></svg>';
 const svg = document.querySelector('svg')!;
 const matrix = vi.fn(() => ({inverse: () => ({})}));
 Object.assign(svg, {
  getScreenCTM: matrix,
  createSVGPoint: () => ({x: 0, y: 0, matrixTransform() { return {x: this.x, y: this.y}; }}),
  setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(),
 });
 const stop = installMermaidViewport(svg, 'nonce');
 const box = () => svg.getAttribute('viewBox')!.split(' ').map(Number);
 const message = (action: string, token = 'nonce', source = window) => window.dispatchEvent(new MessageEvent('message', {source, data: {kind: 'diagram-viewport', token, action}}));
 const pointer = (type: string, x: number, y: number, target: Element = svg, pointerId = 1) => {
  const event = new MouseEvent(type, {clientX: x, clientY: y, button: 0, bubbles: true});
  Object.defineProperty(event, 'pointerId', {value: pointerId}); target.dispatchEvent(event);
 };
 return {svg, matrix, stop, box, message, pointer};
}

it('zooms at the pointer, bounds zoom, authenticates controls and releases listeners', () => {
 const f = fixture(), wheel = new WheelEvent('wheel', {clientX: 100, clientY: 50, deltaY: -200, cancelable: true});
 f.svg.dispatchEvent(wheel); expect(wheel.defaultPrevented).toBe(true);
 const [x, y, width, height] = f.box();
 expect(width).toBeLessThan(400); expect((100 - x) / width).toBeCloseTo(.25); expect((50 - y) / height).toBeCloseTo(.25);
 const zoomed = f.box(); f.message('reset', 'wrong'); f.message('reset', 'nonce', {} as Window); f.message('unknown'); expect(f.box()).toEqual(zoomed);
 for (let i = 0; i < 30; i++) f.message('in'); expect(f.box()[2]).toBeCloseTo(100);
 for (let i = 0; i < 50; i++) f.message('out'); expect(f.box()[2]).toBeCloseTo(1600);
 f.message('reset'); expect(f.box()).toEqual([0, 0, 400, 200]);
 f.stop(); f.message('in'); f.svg.dispatchEvent(new WheelEvent('wheel', {deltaY: -100})); expect(f.box()).toEqual([0, 0, 400, 200]);
});

it('drags only the background, reuses gesture geometry and stops on cancellation or resize', () => {
 const f = fixture();
 f.pointer('pointerdown', 10, 10, f.svg.querySelector('text')!); f.pointer('pointermove', 50, 50);
 expect(f.box()).toEqual([0, 0, 400, 200]); expect(f.matrix).not.toHaveBeenCalled();
 f.pointer('pointerdown', 10, 10);
 for (let i = 1; i <= 20; i++) f.pointer('pointermove', 10 + i, 10 + i);
 expect(f.box()).toEqual([-20, -20, 400, 200]); expect(f.matrix).toHaveBeenCalledTimes(1);
 f.pointer('pointercancel', 30, 30); f.pointer('pointermove', 50, 50); expect(f.box()).toEqual([-20, -20, 400, 200]);
 f.pointer('pointerdown', 30, 30); window.dispatchEvent(new Event('resize')); f.pointer('pointermove', 80, 80);
 expect(f.box()).toEqual([-20, -20, 400, 200]); expect(f.svg.style.cursor).toBe('grab');
 f.stop();
});
