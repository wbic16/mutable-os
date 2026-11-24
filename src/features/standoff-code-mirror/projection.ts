import { RangeValue, RangeSet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { JsonObject } from '../../block-tree/types';
import { Coordinates } from './model';
export class AnnotationRange extends RangeValue {
  constructor(readonly index: number, readonly identity: string, readonly property: JsonObject) { super(); }
}
class Point extends WidgetType {
  constructor(readonly label: string) { super(); }
  eq(other: Point) { return other.label === this.label; }
  toDOM() {const el=document.createElement('span'); el.className='cm-mutable-point';el.textContent='◆';el.title=this.label; return el;}
}
export interface Projection { index: RangeSet<AnnotationRange>; decorations: DecorationSet; invalid: number }
export const replaceProjection = StateEffect.define<Projection>();
export const previewRanges = StateEffect.define<DecorationSet>();
export const annotationVisibility = StateEffect.define<boolean>();
export const annotationField = StateField.define<{projection:Projection;visible:boolean;preview:DecorationSet}>({
  create: () => ({projection:{index:RangeSet.empty, decorations:Decoration.none, invalid:0},visible:true,preview:Decoration.none}),
  update(value, tr) {
    if(tr.docChanged)value={...value,preview:Decoration.none};
    for (const effect of tr.effects) {
      if (effect.is(replaceProjection)) value={...value,projection:effect.value};
      if (effect.is(previewRanges)) value={...value,preview:effect.value};
      if (effect.is(annotationVisibility)) value={...value,visible:effect.value};
    }
    return value;
  },
  provide: field => [EditorView.decorations.from(field, value => value.visible ? value.projection.decorations : Decoration.none),EditorView.decorations.from(field,value=>value.preview)],
});
export function project(text: string, properties: JsonObject[], identities: readonly string[], resolve: (p:JsonObject)=>JsonObject = p=>p): Projection {
  const coordinates = new Coordinates(text), ranges = [], decorations = []; let invalid=0;
  for (let i=0;i<properties.length;i++) {
    const raw=properties[i]; if (!raw || typeof raw!=='object') {invalid++;continue;}
    const p=resolve(raw); if(p.isDeleted)continue;
    try {
      const {from,to}=coordinates.range(p), identity=identities[i]??`property-${i}`;
      ranges.push(new AnnotationRange(i,identity,p).range(from,to));
      decorations.push((p.isZeroWidth ? Decoration.widget({widget:new Point(String(p.type)),side:p.affinity==='before'?-1:1}) : Decoration.mark({class:'cm-mutable-annotation',attributes:{'data-annotation-identity':identity,title:String(p.type)}})).range(from,to));
    } catch { invalid++; }
  }
  return {index:RangeSet.of(ranges,true),decorations:Decoration.set(decorations,true),invalid};
}
export function annotationsAt(view: EditorView, from = view.state.selection.main.from, to = view.state.selection.main.to) {
  const result: AnnotationRange[]=[];
  view.state.field(annotationField).projection.index.between(from,to,(a,b,p)=>{if(a===b ? a>=from&&a<=to : from===to ? a<=from&&from<b : a<to&&b>from)result.push(p);});
  return result;
}
export const annotationTheme = EditorView.baseTheme({
  '.cm-mutable-annotation':{backgroundColor:'rgba(69,128,190,.12)',borderBottom:'1px solid rgba(69,128,190,.5)'},
  '.cm-mutable-preview':{backgroundColor:'#ffe29a'},'.cm-mutable-preview-active':{backgroundColor:'#ffcf66',outline:'1px solid #8a5100'},
  '.cm-mutable-point':{color:'#657ba0',fontSize:'.65em'},
  '&':{fontSize:'14px'}, '.cm-scroller':{overflow:'auto',maxHeight:'600px'},
});
