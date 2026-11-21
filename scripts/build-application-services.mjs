import {copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await build({entryPoints:[fileURLToPath(new URL('server/application-services/host.ts',root))],outfile:fileURLToPath(new URL('dist/server/application-services/host.js',root)),bundle:true,platform:'node',format:'esm',target:'node22',external:['express','fs-ext'],plugins:[{name:'existing-native-store',setup(b){b.onResolve({filter:/asset-remote\.mjs$/},()=>({path:'../asset-remote.mjs',external:true}));b.onResolve({filter:/native-document-store\.mjs$/},()=>({path:'../native-document-store.mjs',external:true}));}}]});
await build({entryPoints:[fileURLToPath(new URL('server/application-services/preparation-worker.ts',root))],outfile:fileURLToPath(new URL('dist/server/application-services/preparation-worker.mjs',root)),bundle:true,platform:'node',format:'esm',target:'node22',external:['pdfjs-dist/*','pdfkit']});

// DCP shares browser-native schemas and .mjs helpers; bundle their Node runtime dependencies.
await build({entryPoints:[fileURLToPath(new URL('server/dialectic/broker.ts',root))],outfile:fileURLToPath(new URL('dist/server/dialectic/broker.js',root)),bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:true,external:['express','multer'],plugins:[{name:'image-admission-worker',setup(b){b.onResolve({filter:/asset-image-validation\.mjs$/},()=>({path:'../asset-image-validation.mjs',external:true}));}}]});

await copyFile(new URL('node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf',root),new URL('dist/server/application-services/attachment-font.ttf',root));
await copyFile(new URL('node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION',root),new URL('dist/server/application-services/LICENSE_LIBERATION',root));
