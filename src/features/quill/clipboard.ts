import type { MutableFragment } from '../../interchange/fragment';
import { QUILL_TYPE, sourceRole, validQuill } from './model';

/** Admission only; serializer/materializer still own allocation and reference remapping. */
export function admittedQuillBlocks(fragment: MutableFragment): Set<string> {
  const admitted = new Set<string>();
  if (!fragment.blocks.some(b => b.type === QUILL_TYPE)) return admitted;
  const blocks = new Map(fragment.blocks.map(b => [b.localId,b]));
  const placements = new Map(fragment.placements.map(p => [p.localId,p]));
  const uses = new Map<string,number>();
  for (const p of fragment.placements) if(p.target.kind === 'local') uses.set(p.target.id,(uses.get(p.target.id)??0)+1);
  for (const b of fragment.blocks) {
    if (b.type !== QUILL_TYPE || b.inline || !validQuill(b.data.quill)) continue;
    const refs = b.blockProperties.filter(p => sourceRole({...p.attributes,type:p.type}));
    if (refs.length !== b.data.quill.sources.length) continue;
    const targets = new Set<string>();
    const valid = b.data.quill.sources.every(({role}) => {
      const matching = refs.filter(p => sourceRole({...p.attributes,type:p.type}) === role);
      const target = matching[0]?.target;
      if (matching.length !== 1 || target?.kind !== 'local' || target.object !== 'block' || targets.has(target.id)) return false;
      targets.add(target.id);
      const source = blocks.get(target.id);
      return source?.type === 'standoff-editor-block' && !!source.inline && uses.get(target.id) === 1 && b.children.some(k => {
        const p=placements.get(k);return p?.kind === 'owned' && p.target.kind === 'local' && p.target.id === target.id;
      });
    });
    if (valid) admitted.add(b.localId);
  }
  return admitted;
}

/** Adapt native paragraph fragments into one owned source, preserving all native
 * range/definition IDs. Paragraph boundaries become authored LF characters.
 * Structured Blocks belong beside the composition, never inside its text role. */
export function quillTextFragment(input: MutableFragment): MutableFragment {
  const f=input,blocks=new Map(f.blocks.map(b=>[b.localId,b])),placements=new Map(f.placements.map(p=>[p.localId,p]));
  const roots=f.roots.map(r=>{const p=placements.get(r.placement);return p?.target.kind==='local'?blocks.get(p.target.id):undefined;});
  if(roots.some(b=>!b || b.type!=='standoff-editor-block' || !b.inline || b.children.length || Object.keys(b.relations).length))throw Error('Paste text ranges into Quill. Paste complete Blocks beside the composition.');
  if(roots.length===1&&f.roots[0].openStart&&f.roots[0].openEnd&&!f.roots[0].separatorAfter)return input;
  return joinParagraphs(structuredClone(input));
}
function joinParagraphs(f:MutableFragment):MutableFragment {
  const blocks=new Map(f.blocks.map(b=>[b.localId,b])),placements=new Map(f.placements.map(p=>[p.localId,p])),roots=f.roots.map(r=>{const p=placements.get(r.placement);return p?.target.kind==='local'?blocks.get(p.target.id):undefined;});
  const first=roots[0]!,removed=new Set(roots.slice(1).map(b=>b!.localId));
  if(f.links.some(l=>l.from.object==='block'&&removed.has(l.from.id)||l.to.kind==='local'&&l.to.object==='block'&&removed.has(l.to.id)) || [...f.definitions,...f.blocks.flatMap(b=>[...b.blockProperties,...b.inline?.properties??[]])].some(p=>p.target?.kind==='local'&&p.target.object==='block'&&removed.has(p.target.id)))throw Error('Clipboard paragraphs carry independent semantic identities. Paste these as complete Blocks.');
  let offset=first.inline!.atoms.reduce((n,a)=>n+(a.kind==='text'?[...a.text].length:1),0);
  for(const b of roots.slice(1)){
    first.inline!.atoms.push({kind:'text',text:'\n'});offset++;
    first.inline!.properties.push(...b!.inline!.properties.map(p=>({...p,startIndex:p.startIndex+offset,endIndex:p.endIndex+offset})));
    first.inline!.atoms.push(...b!.inline!.atoms);offset+=b!.inline!.atoms.reduce((n,a)=>n+(a.kind==='text'?[...a.text].length:1),0);
  }
  const rootEdges=new Set(f.roots.slice(1).map(r=>r.placement));
  f.blocks=f.blocks.filter(b=>!removed.has(b.localId));f.placements=f.placements.filter(p=>!rootEdges.has(p.localId));
  f.roots=[{...f.roots[0],openStart:true,openEnd:true}];delete f.roots[0].separatorAfter;
  return f;
}
