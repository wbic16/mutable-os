// Loaded by the real Flint benchmark only when BENCHMARK_CELL_QUALIFICATION=1.
export async function measureBrowser(longProbe=false) {
  const {editor,mount,text,flow}=window.proof, repo=editor.repository;
  const {observeCellWork}=await import('/src/block-tree/cell-diagnostics.ts');
  const {ResidentCells}=await import('/src/block-tree/resident-cells.ts');
  const {DirectCharacterCells}=await import('/src/rendering/direct-character-cells.ts');
  const diag=observeCellWork(true), cleanup=[];
  let stats={};
  function wrap(owner,key,label) {
    const original=owner[key];
    if(typeof original!=='function')return;
    owner[key]=function(...args){
      const t=performance.now();
      try{return original.apply(this,args);}finally{
        const row=stats[label]??={n:0,ms:0}; row.n++;row.ms+=performance.now()-t;
      }
    };
    cleanup.push(()=>{owner[key]=original;});
  }
  for(const [owner,key,name] of [
    [ResidentCells,'open','hydrate'],[ResidentCells.prototype,'plan','plan'],
    [repo,'commitResidentText','residentCommand'],[repo,'commit','regularCommit'],
    [DirectCharacterCells.prototype,'update','characterDOM'],[DirectCharacterCells.prototype,'spliceText','characterSplice'],[Selection.prototype,'addRange','addRange'],
    [Selection.prototype,'setBaseAndExtent','setBaseAndExtent'],[Document.prototype,'createRange','newRange'],
    [Range.prototype,'getClientRects','rangeRects'],[Element.prototype,'getBoundingClientRect','elementRect'],
    [repo,'snapshot','snapshot'],
  ])wrap(owner,key,name);
  const frame=()=>new Promise(requestAnimationFrame);
  const initial=mount.captureText(), length=Array.from(initial).length;
  let changes=0;
  const stop=repo.subscribeChanges(()=>changes++);
  const mutations=new MutationObserver(()=>{});
  mutations.observe(mount.root,{attributes:true,childList:true,characterData:true,subtree:true});
  const samples=[];
  try {
    await frame();
    const idle=[];
    for(let i=0;i<12;i++){const t=performance.now();await frame();idle.push(performance.now()-t);}
    mutations.disconnect();
    const collect=async(label,run)=>{
      const before={...diag.counts}, timer={...diag.times}, revision=repo.state.revision;
      stats={};const dom={added:0,removed:0,attributes:0,indexAttributes:0,svg:0};
      const observer=new MutationObserver(records=>{for(const r of records){
        dom.added+=r.addedNodes.length;dom.removed+=r.removedNodes.length;
        if(r.type==='attributes')dom.attributes++;
        if(r.attributeName==='data-inline-index')dom.indexAttributes++;
        if(r.target instanceof SVGElement)dom.svg++;
      }});
      observer.observe(mount.root,{subtree:true,childList:true,attributes:true,characterData:true});
      const start=performance.now();run();const sync=performance.now()-start;
      await Promise.resolve();const settled=performance.now()-start;
      await frame();const raf=performance.now()-start;observer.disconnect();
      samples.push({label,sync,settled,raf,commits:repo.state.revision-revision,work:Object.fromEntries(Object.keys(before).map(k=>[k,diag.counts[k]-before[k]])),repositoryMs:Object.fromEntries(Object.keys(timer).map(k=>[k,diag.times[k]-timer[k]])),calls:structuredClone(stats),dom});
    };
    const replace=(s,e,v)=>editor.commands.replaceInlineRange(text.key,s,e,v);
    for(const [name,s,e,v] of [['start',0,0,'x'],['middle',length>>1,length>>1,'🍏'],['append',length,length,'z'],
      ['backspace',length-1,length,''],['forwardDelete',100,101,''],['equal',40,100,'a'.repeat(60)],['delete',50,240,''],
      ['unequal',50,240,'r'.repeat(192)],['largePaste',100,100,'p'.repeat(2048)]]) {
      await collect(name,()=>replace(s,e,v));await collect('undo-'+name,()=>repo.undo());
      await collect('redo-'+name,()=>repo.redo());repo.undo();await frame();
      if(mount.captureText()!==initial)throw Error(name+' restoration');
    }
    for (const [label,at] of [['warmStart',1],['warmMiddle',length>>1],['warmAppend',length]]) {
      replace(length,length,'x');replace(length,length+1,'');await frame();
      await collect(label,()=>replace(at,at,'x'));repo.undo();await frame();
      if(mount.captureText()!==initial)throw Error(label+' restoration');
    }
    for(let i=0;i<(longProbe?2:8);i++) {
      if(i%2===0){replace(length,length,'x');replace(length,length+1,'');await frame();}
      await collect(i%2===0?'warmPaste':'afterUndoPaste',()=>replace(100,100,'alpha '.repeat(32)));
      repo.undo();await frame();
    }
    flow.focus();
    for(const [label,anchor,head] of [['caretMove',12,12],['backwardSelection',120,12],['repeatSelection',120,12],['forwardSelection',12,120]])
      await collect(label,()=>mount.restoreInlineSelection({anchor,head}));
    for(const [name,type] of [['forwardInput','deleteContentForward'],['backwardInput','deleteContentBackward']]){
      mount.restoreInlineSelection({anchor:100,head:100});
      await collect(name,()=>flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:type})));
      repo.undo();await frame();
      if(mount.captureText()!==initial)throw Error(name+' restoration');
    }
    mount.restoreInlineSelection({anchor:100,head:100});
    for(let i=0;i<(longProbe?4:24);i++)await collect('sustained',()=>flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'a'})));
    for(let i=0;i<(longProbe?4:24);i++)repo.undo();
    if(mount.captureText()!==initial)throw Error('Sustained input restoration');
    return {idle,samples,changes};
  } finally {stop();mutations.disconnect();diag.stop();cleanup.reverse().forEach(fn=>fn());}
}

export async function mountSecond() {
  const {editor,view,text}=window.proof;
  const {render}=await import('solid-js/web');
  const {createComponent}=await import('solid-js');
  const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const other=editor.createView('qualification-second',view.rootPlacementKey);
  const root=document.body.appendChild(document.createElement('div'));
  const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection:other}),root);
  window.proof.closeSecond=()=>{dispose();editor.disposeView(other);root.remove();};
  const node=Object.values(other.state.nodes).find(n=>n.contentKey===text.contentKey);
  if(!node||!editor.mounts.get(node.key))throw Error('Second occurrence did not mount');
  window.proof.secondMount=editor.mounts.get(node.key);
  return root.querySelectorAll('[data-inline-key]').length;
}
