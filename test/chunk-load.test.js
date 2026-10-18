import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkLoadFailed, installChunkLoadRecovery } from '../frontend/src/chunk-load.ts';

test('按需資源失敗給出恢復入口但不自動刷新或吞掉原始錯誤', () => {
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
