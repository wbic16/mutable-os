/** Illustrative pure cell geometry, not a production implementation. */
export type Rect={col:number;row:number;cols:number;rows:number};
export type Grid={cols:number;rows:number;cellWidthPx:number;cellHeightPx:number};
export function measureGrid(widthPx:number,heightPx:number,cw:number,ch:number):Grid {
 return {cols:Math.floor(widthPx/cw),rows:Math.floor(heightPx/ch),cellWidthPx:cw,cellHeightPx:ch};
}
export function flintLayout(g:Grid, options:{margin:boolean;references:boolean;scry:boolean}) {
 const menu:Rect={col:0,row:0,cols:g.cols,rows:1};
 const tabs:Rect={col:0,row:1,cols:g.cols,rows:1};
 const status:Rect={col:0,row:g.rows-1,cols:g.cols,rows:1};
 const bodyRows=Math.max(0,g.rows-3);
 const marginCols=options.margin&&g.cols>=110?Math.min(24,Math.floor(g.cols*.13)):0;
 const refsCols=options.references&&g.cols>=155?Math.min(44,Math.floor(g.cols*.23)):0;
 const editor:Rect={col:marginCols,row:2,cols:g.cols-marginCols-refsCols,rows:bodyRows};
 const margin=marginCols?{col:0,row:2,cols:marginCols,rows:bodyRows}:undefined;
 const references=refsCols?{col:g.cols-refsCols,row:2,cols:refsCols,rows:bodyRows}:undefined;
 const overlay=options.scry?{
  col:Math.max(0,Math.floor((g.cols-Math.min(80,g.cols-4))/2)),
  row:Math.max(2,Math.floor(g.rows*.16)),
  cols:Math.min(80,g.cols-4),rows:Math.min(27,g.rows-6)
 }:undefined;
 return {menu,tabs,status,editor,margin,references,overlay};
}
/** Subgrid origin is the same as the main grid. Two subcells fit each main cell. */
export function subgrid(g:Grid){return {cellWidthPx:g.cellWidthPx/2,cellHeightPx:g.cellHeightPx/2};}
