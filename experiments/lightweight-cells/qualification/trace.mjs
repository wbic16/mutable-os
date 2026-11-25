// Keep timing and thread identity only. Native text, URLs and JS arguments
// from the browser trace are deliberately excluded from the result file.
export async function traceTyping(socket,send,expected=40) {
  const rows=[],names=new Set(['Layout','UpdateLayoutTree','FunctionCall','EventDispatch','FireAnimationFrame',
    'MinorGC','MajorGC','V8.GCScavenger','V8.GCCompactor','Paint','RasterTask','RunMicrotasks','PrePaint','Layerize']);
  let complete;
  const done=new Promise(resolve=>{complete=resolve;});
  function receive(event) {
    const m=JSON.parse(event.data);
    if(m.method==='Tracing.tracingComplete')complete();
    if(m.method!=='Tracing.dataCollected')return;
    for(const e of m.params.value)if((names.has(e.name)&&e.ph==='X')||e.name==='qualification-dispatch-start'||e.name==='qualification-dispatch-end')rows.push({
      name:e.name,pid:e.pid,tid:e.tid,start:e.ts,us:e.dur,type:e.args?.data?.type,
    });
  }
  socket.addEventListener('message',receive);
  await send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing',transferMode:'ReportEvents'});
  return async()=>{
    await send('Tracing.end');await done;socket.removeEventListener('message',receive);
    const inputs=rows.filter(r=>r.name==='EventDispatch'&&r.type==='beforeinput');
    const marks=rows.filter(r=>r.name==='qualification-dispatch-start');
    const thread=marks[0]??inputs[0];if(!thread||(inputs.length!==expected&&marks.length!==expected))throw Error('Incomplete input trace: '+inputs.length+' dispatches and '+marks.length+' start marks');
    const origin=thread.start;
    return rows.map(r=>({...r,start:r.start-origin,main:r.pid===thread.pid&&r.tid===thread.tid}));
  };
}
