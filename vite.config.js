import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { createRequire } from 'node:module';

export default defineConfig({
  // Markdown's default browser decoder uses DOM. Pin its data-only entry for
  // both the main bundle and the clipboard worker; never parse clipboard via DOM.
  resolve: { alias: { 'decode-named-character-reference': createRequire(import.meta.url).resolve('decode-named-character-reference') } },
  plugins: [solidPlugin()],
  // Existing browser workers are modules; academic parsers load only for explicit imports.
  worker: { format: 'es' },
  server: {
    port: 3000,
    proxy: {
      // The local credential broker verifies browser Origin against Host.
      '/api/dialectic': { target: `http://127.0.0.1:${process.env.PORT || 3002}`, changeOrigin: false },
      '/api': `http://127.0.0.1:${process.env.PORT || 3002}`,
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true
  },
});
