import { mergeConfig } from 'vite';
import baseConfig from './vite.config.js';

export default mergeConfig(baseConfig, {
  build: {
    // Android 11 的系统 WebView 仍可能停留在 Chrome 83，需避开 ES2021 逻辑赋值语法。
    target: 'es2020'
  }
});
