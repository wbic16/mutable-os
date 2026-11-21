import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
for (const name of ['managed-assets-router', 'asset-image-validation', 'asset-image-worker', 'asset-remote']) await build({entryPoints:[fileURLToPath(new URL(`../server/${name}.mjs`,import.meta.url))],outfile:fileURLToPath(new URL(`../dist/server/${name}.mjs`,import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',external:['sharp','express','multer','fs-ext','ipaddr.js']});
