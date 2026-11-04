export interface TextualGrid {
  columns: number; rows: number; cellWidthPx: number; cellHeightPx: number;
}
export interface CellRect { col: number; row: number; widthCells: number; heightCells: number }
export function measuredGrid(width: number, height: number, cellWidthPx: number, cellHeightPx: number): TextualGrid {
  if (![width, height, cellWidthPx, cellHeightPx].every(Number.isFinite) || width < 0 || height < 0 || cellWidthPx <= 0 || cellHeightPx <= 0)
    throw new Error('Invalid Textual viewport or font metrics');
  return { columns: Math.floor(width / cellWidthPx), rows: Math.floor(height / cellHeightPx), cellWidthPx, cellHeightPx };
}
/** Derive each shared edge from its index; never accumulate rounded pitches. */
export function cellStyle(grid: TextualGrid, rect: CellRect) {
  if (!Object.values(rect).every(Number.isInteger) || Object.values(rect).some(n => n < 0)) throw new Error('Expected a nonnegative integer cell rectangle');
  return { left: `${rect.col * grid.cellWidthPx}px`, top: `${rect.row * grid.cellHeightPx}px`,
    width: `${rect.widthCells * grid.cellWidthPx}px`, height: `${rect.heightCells * grid.cellHeightPx}px` };
}
export interface TextualPreferences { zoom: number; palette: 'borland' | 'paper' }
const preferenceKey = 'mutable.textual.preferences.v1';
export function normalisePreferences(value: unknown): TextualPreferences {
  const v = value as Partial<TextualPreferences> | null;
  return { zoom: typeof v?.zoom === 'number' && Number.isFinite(v.zoom) ? Math.round(Math.min(2, Math.max(.75, v.zoom)) * 20) / 20 : 1,
    palette: v?.palette === 'paper' ? 'paper' : 'borland' };
}
export function loadPreferences(): TextualPreferences {
  try { return normalisePreferences(JSON.parse(localStorage.getItem(preferenceKey) ?? 'null')); } catch { return normalisePreferences(null); }
}
export function savePreferences(value: TextualPreferences) {
  try { localStorage.setItem(preferenceKey, JSON.stringify(value)); } catch { /* Session preferences still work when storage is unavailable. */ }
}
