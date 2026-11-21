import {it,expect} from 'vitest';
import {sanitiseSvg} from './svg-sanitize.mjs';
const wrap=(s:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${s}</svg>`;
it('retains safe local gradients, paths and text with deterministic escaping',()=>{const s=wrap('<defs><linearGradient id="gold"><stop offset="0" stop-color="#ffd000"/></linearGradient></defs><path fill="url(#gold)" d="M0 0L10 10"/><text x="1" y="20">A &amp; B</text>');const a=sanitiseSvg(s);expect(a.svg).toContain('A &amp; B');expect(sanitiseSvg(a.svg).svg).toBe(a.svg);});
it.each(['<script>alert(1)</script>','<path onload="alert(1)"/>','<foreignObject/>','<image href="https://example.com/pixel"/>','<use href="#loop"/>','<path style="fill:url(https://example.com)"/>','<path fill="url(https://example.com)"/>','<path d="M0 0L1e99 2"/>','<path fill="url(#missing)"/>'])('rejects active or unbounded SVG %s',s=>expect(()=>sanitiseSvg(wrap(s))).toThrow());
it('rejects declarations and deeply nested SVG',()=>{expect(()=>sanitiseSvg('<!DOCTYPE svg>'+wrap(''))).toThrow();expect(()=>sanitiseSvg(wrap('<g>'.repeat(30)+'</g>'.repeat(30)))).toThrow();});
