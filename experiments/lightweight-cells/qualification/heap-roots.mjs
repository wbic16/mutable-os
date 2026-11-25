// Record a shortest strong path to the two tagged session objects. Discard the
// snapshot itself, which contains authored text and all script source strings.
export async function heapRoots(socket,send,sessionId) {
  const chunks=[];
  function receive(event) {
    const m=JSON.parse(event.data);
    if(m.sessionId===sessionId&&m.method==='HeapProfiler.addHeapSnapshotChunk')chunks.push(m.params.chunk);
  }
  socket.addEventListener('message',receive);
  try { await send('HeapProfiler.takeHeapSnapshot',{reportProgress:false},sessionId); }
  finally { socket.removeEventListener('message',receive); }
  const snapshot=JSON.parse(chunks.join(''));
  const {nodes,edges,strings}=snapshot,{node_fields:nf,edge_fields:ef,edge_types:types}=snapshot.snapshot.meta;
  const width=nf.length,stride=ef.length,count=nodes.length/width;
  const name=nf.indexOf('name'),num=nf.indexOf('edge_count'),kind=ef.indexOf('type'),label=ef.indexOf('name_or_index'),to=ef.indexOf('to_node');
  const offsets=new Uint32Array(count+1),targets=new Map();
  for(let n=0;n<count;n++){
    offsets[n+1]=offsets[n]+nodes[n*width+num]*stride;
    for(let e=offsets[n];e<offsets[n+1];e+=stride){
      if(types[kind][edges[e+kind]]!=='property')continue;
      const key=strings[edges[e+label]];
      if(key==='__qualificationEditor'||key==='__qualificationFlow')targets.set(key,n);
    }
  }
  const queue=new Uint32Array(count),parent=new Int32Array(count).fill(-1),via=new Int32Array(count);
  let start=0,end=1;parent[0]=0;
  while(start<end){
    const n=queue[start++];
    for(let e=offsets[n];e<offsets[n+1];e+=stride){
      const t=types[kind][edges[e+kind]],child=edges[e+to]/width;
      if(parent[child]>=0||t==='weak')continue;
      if(t==='internal'&&strings[edges[e+label]]?.includes('WeakMap'))continue;
      parent[child]=n;via[child]=e;queue[end++]=child;
    }
  }
  const paths={};
  for(const [key,target] of targets){
    const path=[];if(parent[target]<0)continue;
    for(let n=target;n;n=parent[n]){
      const e=via[n],t=types[kind][edges[e+kind]];
      path.push({object:strings[nodes[n*width+name]].slice(0,100),via:t==='element'||t==='hidden'?String(edges[e+label]):strings[edges[e+label]].slice(0,100),kind:t});
    }
    paths[key]=path.reverse();
  }
  return paths;
}
