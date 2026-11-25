import {letters} from '../../shared/CellSequence';
import {namedRange} from '../../shared/TextRun';
import type {Block, Segment} from '../005-beyond-the-contiguous-range/model';

export const entities = {
  napoleon: {id:'napoleon', name:['Napoleon', 'Bonaparte']},
  augustus: {id:'augustus', name:['Augustus']},
} as const;
export type Entity = (typeof entities)[keyof typeof entities];
export type Document = {id:string; block:Block; lines:string[]};
export type Mention = {id:string; document:Document; segment:Segment; entity:Entity};

// The referent is supplied for each occurrence, independently of its wording.
function mention(id:string, lines:string[], expression:string, entity:Entity): Mention {
  const text = lines.join(' ');
  const bounds = namedRange(id, text, expression);
  const block = {id:'document-' + id + '/01', cells:letters(text, 'd' + id + '-')};
  return {id, document:{id, lines, block}, entity,
    segment:{block, start:block.cells[bounds.start], end:block.cells[bounds.end-1]}};
}

export const mentions = [
  mention('01', ['Napoleon returned to Paris.'], 'Napoleon', entities.napoleon),
  mention('02', ['The Emperor', 'addressed his officers.'], 'The Emperor', entities.napoleon),
  mention('03', ['Bonaparte considered', 'the proposal.'], 'Bonaparte', entities.napoleon),
  mention('04', ['The Corsican', 'remained silent.'], 'The Corsican', entities.napoleon),
  mention('05', ['The Emperor', 'governed Rome.'], 'The Emperor', entities.augustus),
];
