import {isAuthoredBlock} from './identity';
import {decodeBlockTree} from './codecs';
import {clone} from './clone';
import type {BlockFragment} from './clipboard';
import type {ExistingBlockDto} from './types';

/** Host-private assembly of newly authored composition and prepared resources.
 * Slots/fragments never come from the wire. Supports native resource Surface
 * descendants, not copying, definition dependencies or reference traversal.
 * The assembled graph still passes canonical insertFragment admission. */
export function composePreparedLeaves(dto:ExistingBlockDto, leaves:ReadonlyMap<string,BlockFragment>, maxNodes:number,maxCells=Infinity):BlockFragment {
 const decoded=decodeBlockTree(dto),state=decoded.state,remaining=new Map(leaves);
 let nodes=0,cells=0;
 const count=(contents:typeof state.contents,subtractSlot=false)=>{if(subtractSlot)nodes--;for(const content of Object.values(contents)){if(isAuthoredBlock(content))nodes++;else cells++;}if(nodes>maxNodes||cells>maxCells)throw Error('Native composition descendant budget exceeded');};
 count(state.contents);
 for(const [key,slot]of Object.entries(state.contents)){
  const fragment=remaining.get(String(slot.payload.id));if(!fragment)continue;
  const root=fragment.state.placements[fragment.roots[0]],resource=root&&fragment.state.contents[root.contentKey];
  if(fragment.roots.length!==1||!resource||root.kind!=='owned'||Object.keys(fragment.linkedAnnotations??{}).length||fragment.copyIdentities?.length||slot.children.length||slot.inlineContent.length||Object.keys(slot.ownedRelations).length)throw Error('Prepared native resource required');
  const contents=Object.values(fragment.state.contents),placements=Object.values(fragment.state.placements);
  // Retained-resource wrappers use an owned tree, with inline text Cells and
  // terminal Block-ID information properties. No repository dependencies.
  if(placements.some(p=>!['owned','inline'].includes(p.kind)||p.externalReference||p.resolvedReference||p.resourceRegistration)||contents.some(c=>c.definitionOwnerKey||Object.keys(c.opaqueRelations).length)||contents.some(c=>c.key in state.contents)||placements.some(p=>p.key in state.placements))throw Error('Prepared resource contains dependencies or colliding keys');
  count(fragment.state.contents,true);
  for(const content of contents){if(content.key===root.contentKey)state.contents[key]={...clone(content),key};else state.contents[content.key]=clone(content);}
  for(const placement of placements){if(placement.key!==root.key)state.placements[placement.key]=clone(placement);}
  remaining.delete(String(slot.payload.id));
 }
 if(remaining.size)throw Error('Prepared native resource slot missing');
 return {state,roots:[decoded.rootPlacementKey]};
}
