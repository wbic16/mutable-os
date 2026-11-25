import assert from "node:assert/strict";

export async function memoryBrowser({evaluate,send,sessionId}) {
  async function sample(){
    await send('HeapProfiler.collectGarbage',{},sessionId);
    const {usedSize}=await send('Runtime.getHeapUsage',{},sessionId);
    return {heap:usedSize,...await send('Memory.getDOMCounters',{},sessionId)};
  }
  const result={};
  result.afterSustained=await sample();
  await evaluate("(async()=>{proof.work=(await import('/src/block-tree/cell-diagnostics.ts')).observeCellWork()})()");
  await evaluate("proof.editor.commands.replaceInlineRange(proof.text.key,0,0,'h')");
  result.beforeSecond=await sample();
  const initial=await evaluate("({...proof.work.counts,revision:proof.editor.repository.state.revision})");
  await evaluate("(async()=> (await import('/experiments/lightweight-cells/qualification/browser.mjs')).mountSecond())()");
  result.twoViews=await sample();
  const mounted=await evaluate("({...proof.work.counts,revision:proof.editor.repository.state.revision})");
  assert.equal(mounted.allocations,initial.allocations);
  assert.equal(mounted.revision,initial.revision);
  assert.ok(await evaluate("proof.secondMount.focusElement!==proof.mount.focusElement && proof.secondMount.captureText()===proof.mount.captureText()"));
  await evaluate("proof.editor.commands.replaceInlineRange(proof.text.key,0,0,'z')");
  result.afterSharedEdit=await sample();
  assert.ok(await evaluate("proof.secondMount.captureText()===proof.mount.captureText() && proof.mount.captureText().startsWith('zh')"));
  await evaluate("proof.closeSecond(); delete proof.closeSecond; delete proof.secondMount");
  result.secondOccurrenceWork={initial,mounted,closed:await evaluate("({...proof.work.counts,revision:proof.editor.repository.state.revision})")};
  assert.equal(result.secondOccurrenceWork.closed.revision,initial.revision+1);
  result.closedSecond=await sample();
  await evaluate("Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).slice(0,8).forEach(n=>proof.editor.commands.replaceInlineRange(n.key,0,0,'w'))");
  result.editedSeveral=await sample();
  result.work=await evaluate("proof.work.stop();proof.work.counts");
  return result;
}
