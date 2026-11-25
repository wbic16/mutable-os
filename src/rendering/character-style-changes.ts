import {cellStyleAt, type CellStyleRun} from './standoff-styles';
import {classesAt, type ClassRun} from './range-rendering';

export interface CharacterStyles { styles: readonly CellStyleRun[]; classes: readonly ClassRun[] }

/** Compare the old and new styling in survivor coordinates. Work follows run
 * boundaries, plus the characters whose actual presentation changes. */
export function updateSurvivingStyles(old: CharacterStyles, next: CharacterStyles,
  length: number, start: number, end: number, added: number, update: (i:number)=>void) {
  function compare(from:number, to:number, shift:number) {
    if (from >= to || (!shift && old.styles === next.styles && old.classes === next.classes)) return;
    const cuts = new Set([from,to]);
    for (const [snapshot,delta] of [[old,shift],[next,0]] as const)
      for (const runs of [snapshot.styles,snapshot.classes]) for (const run of runs) {
        const at = run.start + delta;
        if (at > from && at < to) cuts.add(at);
      }
    const ordered = [...cuts].sort((a,b) => a-b);
    for (let j=1; j<ordered.length; j++) {
      const at = ordered[j-1], before = at-shift;
      if (classesAt(old.classes,before) === classesAt(next.classes,at)
        && JSON.stringify(cellStyleAt(old.styles,before)) === JSON.stringify(cellStyleAt(next.styles,at))) continue;
      for (let i=at; i<ordered[j]; i++) update(i);
    }
  }
  compare(0,start,0);
  compare(start+added,length,start+added-end);
}
