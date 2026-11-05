/** Presentation-only sizing. ResizeObserver supplies dimensions; no Cell measurement. */
export function nativeIslands(root:HTMLElement, initialPitch:number) {
 let pitch=initialPitch,alive=true;
 const sizes=new Map<HTMLElement,number>(),tables=new Set<HTMLElement>();
 const diagnostics={resizes:0,structuralVisits:0,writes:0};
 const media=':is(.reactive-image,.reactive-video,.reactive-iframe) > :is(img,iframe,video),video';
 const paint=(element:HTMLElement,height:number)=>{
  const padding=Math.max(0,Math.ceil((height-.01)/pitch)*pitch-height),value=`${padding}px`;
  if(element.style.getPropertyValue('--tw-island-pad')!==value){element.style.setProperty('--tw-island-pad',value);diagnostics.writes++;}
 };
 const resize=new ResizeObserver(entries=>{if(!alive)return;for(const entry of entries){const element=entry.target as HTMLElement;const height=entry.contentRect.height;sizes.set(element,height);diagnostics.resizes++;paint(element,height);}});
 const table=(element:HTMLElement)=>{tables.add(element);element.style.setProperty('--tw-table-columns',String(Math.max(1,Number(element.getAttribute('aria-colcount'))||1)));};
 const visit=(element:HTMLElement)=>{
  if(element.closest('.reactive-standoff-flow'))return;
  diagnostics.structuralVisits++;
  const add=(node:HTMLElement)=>{if(node.matches('.reactive-table'))table(node);else if(!sizes.has(node)){sizes.set(node,0);resize.observe(node);}};
  if(element.matches(`${media},.reactive-table`))add(element);
  element.querySelectorAll<HTMLElement>(`${media},.reactive-table`).forEach(add);
 };
 visit(root);
 const mutations=new MutationObserver(records=>{
  const structural=records.filter(record=>!(record.target instanceof Element&&record.target.closest('.reactive-standoff-flow')));
  for(const record of structural){if(record.type==='attributes')table(record.target as HTMLElement);else for(const node of record.addedNodes)if(node instanceof HTMLElement)visit(node);}
  // Release only native elements in removed subtrees; SVG/Cell redraws must not
  // walk the inventory of unrelated media.
  const release=(element:HTMLElement)=>{if(root.contains(element))return;if(sizes.delete(element)){resize.unobserve(element);element.style.removeProperty('--tw-island-pad');}if(tables.delete(element))element.style.removeProperty('--tw-table-columns');};
  for(const record of structural)for(const node of record.removedNodes)if(node instanceof HTMLElement){
   if(node.matches(`${media},.reactive-table`))release(node);
   node.querySelectorAll<HTMLElement>(`${media},.reactive-table`).forEach(release);
  }
 });
 mutations.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-colcount']});
 return {diagnostics,zoom(next:number){pitch=next;for(const [element,height]of sizes)paint(element,height);},dispose(){alive=false;mutations.disconnect();resize.disconnect();for(const element of sizes.keys())element.style.removeProperty('--tw-island-pad');for(const element of tables)element.style.removeProperty('--tw-table-columns');sizes.clear();tables.clear();}};
}
