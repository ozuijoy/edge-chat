import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
let vite;
let createEdgeChatWebMcpTools;
let registerEdgeChatWebMcp;

before(async () => {
  vite = await createServer({
    root: projectRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true }
  });
  ({ createEdgeChatWebMcpTools, registerEdgeChatWebMcp } = await vite.ssrLoadModule(
    '/frontend/src/webmcp.ts'
  ));
});

after(async () => {
  await vite?.close();
});

function createApi(overrides = {}) {
  return {
    async bootstrap() {
      return { users: [] };
    },
    async getChannels() {
      return { channels: [] };
    },
    async getRecentMessages() {
      return { messages: [] };
    },
    async openDm() {
      return { dm: null };
    },
    async sendRoomMessage() {
      return { created: true };
    },
    ...overrides
  };
}

function toolMap(apiClient = createApi(), overrides = {}) {
  const tools = createEdgeChatWebMcpTools({
    apiClient,
    createMessageId: () => '11111111-1111-4111-8111-111111111111',
    getSession: () => ({ userId: 1 }),
    async login() {},
    ...overrides
  });
  return new Map(tools.map((tool) => [tool.name, tool]));
}

test('WebMCP 第一版只注册五个基础工具并标注读写属性', () => {
  const tools = [...toolMap().values()];
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'edgechat.login',
      'edgechat.list_channels',
      'edgechat.read_messages',
      'edgechat.send_message',
      'edgechat.open_dm'
    ]
  );
  assert.deepEqual(
    tools.map((tool) => tool.annotations.readOnlyHint),
    [false, true, true, false, false]
  );
  assert.deepEqual(tools[0].inputSchema.required, ['username', 'password']);
  assert.equal(tools[0].inputSchema.properties.password.writeOnly, true);
  assert.deepEqual(tools[2].inputSchema.required, ['kind', 'roomId']);
  assert.deepEqual(tools[3].inputSchema.required, ['kind', 'roomId', 'content']);
});

test('WebMCP 注册入口一次性注册全部工具并保持幂等', async () => {
  const registered = [];
  const result = await registerEdgeChatWebMcp({
    registerTool(tool) {
      registered.push(tool.name);
    }
  });
  const repeated = await registerEdgeChatWebMcp({
    registerTool() {
      throw new Error('不应重复注册');
    }
  });

  assert.equal(result, true);
  assert.equal(repeated, true);
  assert.deepEqual(registered, [
    'edgechat.login',
    'edgechat.list_channels',
    'edgechat.read_messages',
    'edgechat.send_message',
    'edgechat.open_dm'
  ]);
});

test('登录复用现有 store 流程且只返回脱敏会话信息', async () => {
  let credentials;
  let session = null;
  const tools = toolMap(createApi(), {
    getSession: () => session,
    async login(input) {
      credentials = input;
      session = {
        userId: 8,
        username: input.username,
        displayName: '演示用户',
        isAdmin: false,
        token: 'never-return-this'
      };
    }
  });

  const result = await tools.get('edgechat.login').execute({
    username: ' demo ',
    password: 'top-secret'
  });

  assert.deepEqual(credentials, { username: 'demo', password: 'top-secret' });
  assert.deepEqual(result, {
    session: {
      userId: 8,
      username: 'demo',
      displayName: '演示用户',
      isAdmin: false
    }
  });
  assert.equal(JSON.stringify(result).includes('top-secret'), false);
  assert.equal(JSON.stringify(result).includes('never-return-this'), false);
});

test('查询群聊和最近消息直接复用现有只读 API', async () => {
  const calls = [];
  const tools = toolMap(
    createApi({
      async getChannels() {
        calls.push(['getChannels']);
        return { channels: [{ id: 7, kind: 'private', name: '项目组' }] };
      },
      async getRecentMessages(kind, roomId, limit) {
        calls.push(['getRecentMessages', kind, roomId, limit]);
        return { room: { id: roomId, kind }, messages: [{ id: 9 }] };
      }
    })
  );

  assert.deepEqual(await tools.get('edgechat.list_channels').execute({}), {
    channels: [{ id: 7, kind: 'private', name: '项目组' }]
  });
  assert.deepEqual(
    await tools.get('edgechat.read_messages').execute({ kind: 'private', roomId: 7, limit: 12 }),
    { room: { id: 7, kind: 'private' }, messages: [{ id: 9 }] }
  );
  assert.deepEqual(calls, [['getChannels'], ['getRecentMessages', 'private', 7, 12]]);
});

test('发送消息使用既有 v1 幂等提交入口', async () => {
  const calls = [];
  const tools = toolMap(
    createApi({
      async sendRoomMessage(kind, roomId, payload) {
        calls.push([kind, roomId, payload]);
        return { created: true, message: { id: 18, content: payload.content } };
      }
    })
  );

  const result = await tools.get('edgechat.send_message').execute({
    kind: 'public',
    roomId: 3,
    content: '  WebMCP 你好  '
  });

  assert.deepEqual(calls, [
    [
      'public',
      3,
      {
        clientMessageId: '11111111-1111-4111-8111-111111111111',
        content: 'WebMCP 你好'
      }
    ]
  ]);
  assert.equal(result.message.id, 18);
});

test('打开私聊按准确用户名解析目标，并要求当前存在登录会话', async () => {
  const opened = [];
  const tools = toolMap(
    createApi({
      async bootstrap() {
        return { users: [{ id: 2, username: 'Alice' }] };
      },
      async openDm(userId) {
        opened.push(userId);
        return { dm: { id: 30, kind: 'dm' } };
      }
    })
  );

  assert.deepEqual(await tools.get('edgechat.open_dm').execute({ username: 'alice' }), {
    dm: { id: 30, kind: 'dm' }
  });
  assert.deepEqual(opened, [2]);

  const signedOutTools = toolMap(createApi(), { getSession: () => null });
  await assert.rejects(
    signedOutTools.get('edgechat.list_channels').execute({}),
    /请先登录 EdgeChat/
  );
});
