// Disposable model for authored, inclusive, non-point ranges in one text-only block.
export class CellText {
  constructor(text, properties) {
    this.cells = Array.from(text, (value, index) => ({value, index}));
    this.ranges = new Set();
    this.owners = new Map();
    for (const [origin, property] of properties.entries()) {
      const {start, end, ...fields} = property;
      if (property.isZeroWidth || !Number.isInteger(start) || !Number.isInteger(end) ||
          start < 0 || start > end || end >= this.cells.length) {
        throw Error('Prototype requires valid inclusive, non-point ranges');
      }
      const range = {fields, first: this.cells[start], last: this.cells[end], origin};
      this.ranges.add(range);
      this.attach(range.first, range);
      this.attach(range.last, range);
    }
  }

  attach(cell, range) {
    let bucket = this.owners.get(cell);
    if (!bucket) this.owners.set(cell, bucket = new Set());
    bucket.add(range);
  }
  detach(cell, range) {
    const bucket = this.owners.get(cell);
    if (bucket && bucket.delete(range) && !bucket.size) this.owners.delete(cell);
  }

  replace(start, end, text) {
    const cells = this.cells;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end > cells.length) {
      throw Error('Invalid half-open replacement');
    }
    const length = cells.length;
    const added = Array.from(text, (value, i) => ({value, index: start + i}));
    const delta = added.length - (end - start);
    const touched = new Set();
    for (let i = start; i < end; i++) {
      const bucket = this.owners.get(cells[i]);
      if (bucket) for (const range of bucket) touched.add(range);
    }
    // Current Mutable semantics attach a clipped end to the last surviving
    // prefix Cell and a clipped start to the first surviving suffix Cell.
    for (const range of touched) {
      this.detach(range.first, range);
      this.detach(range.last, range);
      if (range.first.index >= start && range.last.index < end) {
        this.ranges.delete(range);
        continue;
      }
      if (range.first.index >= start) range.first = cells[end];
      if (range.last.index < end) range.last = cells[start - 1];
      this.attach(range.first, range);
      this.attach(range.last, range);
    }
    // Move each displaced Cell once, in the overlap-safe direction, for the
    // entire bulk operation. Equal-length replacement leaves the suffix alone.
    if (delta > 0) {
      cells.length = length + delta;
      for (let i = length - 1; i >= end; i--) {
        const cell = cells[i];
        cell.index = i + delta;
        cells[cell.index] = cell;
      }
    } else if (delta < 0) {
      for (let i = end; i < length; i++) {
        const cell = cells[i];
        cell.index = i + delta;
        cells[cell.index] = cell;
      }
      cells.length = length + delta;
    }
    for (let i = 0; i < added.length; i++) cells[start + i] = added[i];
    return {suffixWrites: delta ? length - end : 0, removedSlots: end - start,
      insertedSlots: added.length, touchedRanges: touched.size};
  }

  properties(origins) {
    const output = [];
    for (const range of this.ranges) {
      if (origins) {
        origins.push(range.origin);
        range.origin = output.length;
      }
      output.push({...range.fields, start: range.first.index, end: range.last.index});
    }
    return output;
  }

  text() { return this.cells.map(cell => cell.value).join(''); }
}
