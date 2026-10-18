import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import baseConfig from './vite.config.js';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default mergeConfig(baseConfig, {
  define: {
    'globalThis.__EDGECHAT_DEMO__': 'true'
  },
  resolve: {
    alias: [
      {
        find: /^(?:\.\.?\/)+runtime\.js$/,
        replacement: resolve(dirname, 'src/demo/runtime.js')
      }
    ]
  },
  server: {
    port: 5174
  },
  build: {
    outDir: resolve(dirname, 'demo-dist'),
    emptyOutDir: true
  }
});
