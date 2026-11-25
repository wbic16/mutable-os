// Reuse the qualification fixture and create independent Flint sessions in the
// same Chrome realm. Weak references are sampled in a separate task after GC.
import {heapRoots} from '../lightweight-cells/qualification/heap-roots.mjs';

export async function retention({evaluate,send,socket,sessionId,bind}) {
  const checkpoints=[];
  await evaluate('window.disposedSamples=[]');
  for (let i=1; i<=100; i++) {
    if (i>1) { await evaluate('window.openQualificationSession()'); await evaluate(bind); }
    await evaluate(`(async()=>{
      const {editor,text,flow,mount,session,dispose} = proof;
      flow.focus(); mount.restoreInlineSelection({anchor:1,head:1});
      flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'q'}));
      const sequence=editor.repository.residents.get(text.contentKey)?.cells?.cells;
      if(!sequence || document.activeElement!==flow)throw Error('Expected a focused resident editor');
      editor.__qualificationEditor=true;flow.__qualificationFlow=true;
      const addresses=(await import('/src/rendering/character-address.ts')).addressesFor(flow);
      disposedSamples.push({editor:new WeakRef(editor),flow:new WeakRef(flow),sequence:new WeakRef(sequence),
        ...(addresses?{addresses:new WeakRef(addresses)}:{})});
      dispose();session.dispose();delete window.proof;
    })()`);
    if ([1,10,25,50,75,100].includes(i)) {
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,100))))');
      await send('HeapProfiler.collectGarbage',{},sessionId);
      const alive=await evaluate(`Object.fromEntries(['editor','flow','sequence','addresses'].map(k=>[k,
        disposedSamples.flatMap((s,i)=>s[k]?.deref()?[i+1]:[])]))`);
      const {usedSize}=await send('Runtime.getHeapUsage',{},sessionId);
      checkpoints.push({cycles:i,alive,heap:usedSize,mounted:await evaluate('document.querySelectorAll(".reactive-standoff-flow").length')});
    }
  }
  const roots=await heapRoots(socket,send,sessionId);
  return {checkpoints,roots};
}
