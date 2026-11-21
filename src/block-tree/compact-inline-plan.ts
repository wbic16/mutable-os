import { validateCompactInline } from './inline-sequence';
import type { ContentRecord, RepositoryOperation, RepositoryState } from './types';

/** Existing affected-record commit/publication path; no alternative repository.
 * Graph edges and the representation are immutable on this route. New objects
 * and structural mutations must pass the ordinary graph planner. */
export function compactInlineOwnerFor(state:RepositoryState,operations:RepositoryOperation[]):string|undefined {
  if(operations.length!==1||operations[0].kind!=='put-content')return;
  const next=operations[0].record,prior=state.contents[next.key];
  if(!prior?.compactInline||!next.compactInline)return;
  validateCompactInline(next);
  const graph=(c:ContentRecord)=>{const {payload,compactInline,inlineRevision,revision,...rest}=c;return JSON.stringify(rest);};
  if(graph(prior)!==graph(next))return;
  const objects=(c:ContentRecord)=>JSON.stringify(c.compactInline!.spans.filter(a=>a.kind!=='text'));
  if(objects(prior)!==objects(next))return;
  return next.key;
}
