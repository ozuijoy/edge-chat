import { mergeConfig } from 'vite';
import baseConfig from './vite.config.js';

export default mergeConfig(baseConfig, {
  build: {
    // Android 11 的系統 WebView 仍可能停留在 Chrome 83，需避開 ES2021 邏輯賦值語法。
    target: 'es2020'
  }
});
