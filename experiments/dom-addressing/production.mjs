// Build the same qualification entry and expose its CDP instrumentation modules
// as named entries in that bundle, so every counter wraps the actual classes.
import {build} from 'vite';
import {createServer} from 'node:http';
import {access,readFile} from 'node:fs/promises';
import path from 'node:path';

export async function serveProduction(plugin,fixture,profile) {
  const dir=process.env.BENCHMARK_DOM_BUILD ?? path.join(profile,'qualification-build');
  const entries={
    diagnostic:'/src/block-tree/cell-diagnostics.ts',
    stages:'/experiments/lightweight-cells/qualification/browser.mjs',
    resident:'/src/block-tree/resident-cells.ts',
    direct:'/src/rendering/direct-character-cells.ts',
    addresses:'/src/rendering/character-address.ts',
  };
  const input={proof:'/__flint-proof.js',...Object.fromEntries(Object.entries(entries).map(([key,id])=>[key,path.resolve('.'+id)]))};
  const reuse=process.env.BENCHMARK_DOM_BUILD && await access(path.join(dir,'proof.js')).then(()=>true,()=>false);
  if(!reuse) await build({plugins:[plugin],publicDir:false,logLevel:'error',build:{outDir:dir,sourcemap:false,
    cssCodeSplit:false,rollupOptions:{input,preserveEntrySignatures:'strict',output:{entryFileNames:'[name].js'}}}});
  const imports=Object.fromEntries(Object.entries(entries).map(([key,id])=>[id,'/'+key+'.js']));
  const {readdir}=await import('node:fs/promises');
  const assets=await readdir(path.join(dir,'assets'));
  const css=assets.filter(n=>n.endsWith('.css')).map(n=>'<link rel="stylesheet" href="/assets/'+n+'">').join('');
  const html='<script>window.__identityDom='+String(process.env.BENCHMARK_IDENTITY_DOM!=='false')+'</script>'+css+'<script type="importmap">'+JSON.stringify({imports})+'</script><div id="root"></div><script type="module" src="/proof.js"></script>';
  const httpServer=createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    if(name==='/__letter'){res.end(fixture);return;}
    if(name==='/__flint-integration'){res.setHeader('Content-Type','text/html');res.end(html);return;}
    try {
      const data=await readFile(path.join(dir,name));
      res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'application/octet-stream');
      res.end(data);
    } catch {res.statusCode=404;res.end();}
  });
  await new Promise(r=>httpServer.listen(0,'127.0.0.1',r));
  return {httpServer,close:()=>new Promise(r=>httpServer.close(r))};
}
