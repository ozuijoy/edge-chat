import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkLoadFailed, installChunkLoadRecovery } from '../frontend/src/chunk-load.ts';

test('按需资源失败给出恢复入口但不自动刷新或吞掉原始错误', () => {
  const target = new EventTarget();
  const dispose = installChunkLoadRecovery(target);
  chunkLoadFailed.value = false;
  target.dispatchEvent(new Event('error'));
  assert.equal(chunkLoadFailed.value, false);
  const failure = new Event('vite:preloadError', { cancelable: true });
  target.dispatchEvent(failure);
  assert.equal(chunkLoadFailed.value, true);
  assert.equal(failure.defaultPrevented, false);
  dispose();
  chunkLoadFailed.value = false;
  target.dispatchEvent(failure);
  assert.equal(chunkLoadFailed.value, false);
});
