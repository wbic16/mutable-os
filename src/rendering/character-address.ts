// Occurrence-local index of the rendered flow, including provisional characters.
// Small pages keep forward and reverse lookups bounded without updating a slot
// on every surviving element. The canonical sequence never owns these pages.
import { onCleanup } from 'solid-js';
import type { CanonicalRepository } from '../block-tree/repository';
import { cellWork } from '../block-tree/cell-diagnostics';

const pageSize = 128;
interface Page { elements: HTMLElement[]; widths: number[]; start: number; utf16: number; units: number }
const flows = new WeakMap<HTMLElement, CharacterAddresses>();
const reactiveIndices = new WeakMap<Element, () => number>();
export const characterSelector = '[data-inline-key],[data-provisional-cell],[data-inline-index]';

export function bindCharacterIndex(element: HTMLElement, index: () => number) {
  reactiveIndices.set(element, index);
  onCleanup(() => reactiveIndices.delete(element));
}

export function characterIndex(element: Element | null | undefined): number | undefined {
  if (!element) return;
  const owner = element.parentElement && flows.get(element.parentElement);
  if (owner) return owner.indexOf(element);
  const read = reactiveIndices.get(element);
  if (read) return read();
  const attr = element.getAttribute('data-inline-index');
  return attr === null ? undefined : Number(attr);
}

export function addressesFor(flow: HTMLElement) { return flows.get(flow); }

export class CharacterAddresses {
  private pages: Page[] = [];
  private owners = new WeakMap<Element, Page>();
  length = 0;

  // The lookup is supplied by the owning occurrence and cleared at unmount.
  // Keeping the callback here avoids binding DOM nodes to retired Cell epochs.
  lookupResident?: (element:Element,index:number) => ReturnType<CanonicalRepository['residentCharacterAt']>;

  residentCharacter(element: Element) {
    const index = this.indexOf(element);
    if (index !== undefined) return this.lookupResident?.(element,index);
  }

  private flow?: HTMLElement;
  constructor(flow: HTMLElement) { this.flow = flow; flows.set(flow, this); }

  private pageAt(index: number) {
    let lo = 0, hi = this.pages.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.pages[mid].start <= index) lo = mid; else hi = mid;
    }
    return lo;
  }

  elementAt(index: number): HTMLElement | undefined {
    if (index < 0 || index >= this.length) return;
    const page = this.pages[this.pageAt(index)];
    return page.elements[index - page.start];
  }

  indexOf(element: Element) {
    const page = this.owners.get(element);
    if (page) return page.start + page.elements.indexOf(element as HTMLElement);
  }

  logicalOffset(units: number) {
    let lo = 0, hi = this.pages.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.pages[mid].utf16 <= units) lo = mid; else hi = mid;
    }
    const page = this.pages[lo];
    if (!page) return 0;
    let at = page.start, offset = page.utf16;
    for (const width of page.widths) {
      if (offset + width > units) break;
      offset += width; at++;
    }
    return at;
  }

  utf16Offset(element: Element) {
    const page = this.owners.get(element);
    if (!page) return;
    let offset = page.utf16;
    for (let i = 0; page.elements[i] !== element; i++) offset += page.widths[i];
    return offset;
  }

  splice(start: number, end: number, elements: HTMLElement[], widths: number[]) {
    const first = this.pageAt(start);
    const endIndex = this.pageAt(end);
    let last = endIndex;
    if (this.pages[last + 1] && this.pages[last].elements.length + this.pages[last + 1].elements.length <= pageSize) last++;
    const a = this.pages[first], b = this.pages[last];
    const from = a?.start ?? 0, units = a?.utf16 ?? 0;
    const prefix = start - from;
    const endPage = this.pages[endIndex];
    const suffix = end - (endPage?.start ?? 0);
    // Only the two boundary pages and insertions need new membership.
    const members = (a?.elements.slice(0, prefix) ?? []).concat(elements, endPage?.elements.slice(suffix) ?? [], b !== endPage ? b.elements : []);
    const sizes = (a?.widths.slice(0, prefix) ?? []).concat(widths, endPage?.widths.slice(suffix) ?? [], b !== endPage ? b.widths : []);
    const pages: Page[] = [];
    const chunk = Math.ceil(members.length / Math.max(1, Math.ceil(members.length / pageSize)));
    for (let i = 0; i < members.length; i += chunk) {
      const part = sizes.slice(i, i + chunk);
      pages.push({elements:members.slice(i, i + chunk), widths:part, start:0, utf16:0,
        units:part.reduce((sum, width) => sum + width, 0)});
    }
    for (const old of this.pages.splice(first, last - first + 1, ...pages)) {
      for (const el of old.elements) this.owners.delete(el);
    }
    for (const page of pages) for (const el of page.elements) this.owners.set(el, page);
    if (cellWork) { cellWork.addressPages += pages.length; cellWork.addressMembers += members.length; }
    let index = from, offset = units;
    for (let i = first; i < this.pages.length; i++) {
      const page = this.pages[i];
      page.start = index; page.utf16 = offset;
      index += page.elements.length; offset += page.units;
    }
    this.length = index;
  }

  dispose() {
    this.lookupResident = undefined;
    if (this.flow && flows.get(this.flow) === this) flows.delete(this.flow);
    this.flow = undefined;
    this.pages = [];
    this.owners = new WeakMap();
    this.length = 0;
  }
}
