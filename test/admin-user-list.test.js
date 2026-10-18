import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAdminUsers } from '../frontend/src/admin/user-list.ts';

const users = [
  { id: 1, displayName: 'Alice 張', username: 'alice' },
  { id: 2, displayName: '管理員', username: 'admin' },
  { id: 3, displayName: 'Alice', username: 'alicia' }
];

test('後臺本頁搜索支持名字、用戶名、@前綴和大小寫', () => {
  assert.deepEqual(filterAdminUsers(users, ' ALICE ').map(({ id }) => id), [1, 3]);
  assert.deepEqual(filterAdminUsers(users, '@ADMIN').map(({ id }) => id), [2]);
  assert.deepEqual(filterAdminUsers(users, '張').map(({ id }) => id), [1]);
  assert.deepEqual(filterAdminUsers(users, '不存在'), []);
});

test('後臺本頁搜索保留數據和排序，清空後恢復當前頁', () => {
  const before = structuredClone(users);
  assert.equal(filterAdminUsers(users, '  '), users);
  assert.equal(filterAdminUsers(users, 'alicia')[0], users[2]);
  assert.deepEqual(users, before);
  assert.deepEqual(filterAdminUsers([], 'Alice'), []);
});
