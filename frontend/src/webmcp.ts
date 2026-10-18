import api from './api.js';
import { isDemoMode } from './runtime.js';
import store from './store.js';

type ToolInput = Record<string, unknown>;

interface EdgeChatUser {
  id: number;
  username: string;
}

interface EdgeChatSession {
  userId?: number;
  username?: string;
  displayName?: string;
  isAdmin?: boolean;
}

interface EdgeChatWebMcpApi {
  bootstrap(): Promise<{ users?: EdgeChatUser[] }>;
  getChannels(): Promise<{ channels?: unknown[] }>;
  getRecentMessages(kind: string, roomId: number, limit: number): Promise<unknown>;
  openDm(userId: number): Promise<unknown>;
  sendRoomMessage(
    kind: string,
    roomId: number,
    payload: { clientMessageId: string; content: string }
  ): Promise<unknown>;
}

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean };
  execute(input: ToolInput): Promise<unknown>;
}

interface WebMcpModelContext {
  registerTool(tool: WebMcpTool): Promise<void> | void;
}

interface WebMcpDocument extends Document {
  modelContext?: WebMcpModelContext;
}

interface WebMcpDependencies {
  apiClient: EdgeChatWebMcpApi;
  createMessageId: () => string;
  getSession: () => EdgeChatSession | null;
  login: (credentials: { username: string; password: string }) => Promise<void>;
}

const ROOM_KIND_SCHEMA = {
  type: 'string',
  enum: ['public', 'private', 'dm'],
  description: '會話類型：公開群、私有群或私聊'
};

const ROOM_ID_SCHEMA = {
  type: 'integer',
  minimum: 1,
  description: '會話 ID，可先通過 edgechat.list_channels 獲取群聊 ID'
};

function requireSession(getSession: () => EdgeChatSession | null) {
  if (!getSession()) {
    throw new Error('請先登錄 EdgeChat 後再使用站點工具');
  }
}

function roomInput(input: ToolInput) {
  return {
    kind: String(input.kind || ''),
    roomId: Number(input.roomId)
  };
}

export function createEdgeChatWebMcpTools(
  overrides: Partial<WebMcpDependencies> = {}
): WebMcpTool[] {
  const apiClient = overrides.apiClient || api;
  const createMessageId = overrides.createMessageId || (() => crypto.randomUUID());
  const getSession = overrides.getSession || (() => store.session);
  const login = overrides.login || ((credentials) => store.login(credentials));

  return [
    {
      name: 'edgechat.login',
      description:
        '使用現有 EdgeChat 登錄流程創建當前瀏覽器會話。賬號密碼屬於敏感信息，僅在用戶明確授權後調用。',
      inputSchema: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            description: 'EdgeChat 用戶名'
          },
          password: {
            type: 'string',
            minLength: 1,
            writeOnly: true,
            description: 'EdgeChat 密碼，工具結果不會返回此字段'
          }
        },
        required: ['username', 'password'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        await login({
          username: String(input.username || '').trim(),
          password: String(input.password || '')
        });
        const session = getSession();
        if (!session) {
          throw new Error('EdgeChat 登錄未完成');
        }
        return {
          session: {
            userId: session.userId,
            username: session.username,
            displayName: session.displayName,
            isAdmin: Boolean(session.isAdmin)
          }
        };
      }
    },
    {
      name: 'edgechat.list_channels',
      description: '查詢當前登錄用戶可見的 EdgeChat 公開群組和私有群組。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute() {
        requireSession(getSession);
        const payload = await apiClient.getChannels();
        return { channels: payload.channels || [] };
      }
    },
    {
      name: 'edgechat.read_messages',
      description: '讀取指定 EdgeChat 會話最近的消息，不改變已讀狀態。',
      inputSchema: {
        type: 'object',
        properties: {
          kind: ROOM_KIND_SCHEMA,
          roomId: ROOM_ID_SCHEMA,
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 30,
            description: '返回的最近消息數量'
          }
        },
        required: ['kind', 'roomId'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute(input) {
        requireSession(getSession);
        const { kind, roomId } = roomInput(input);
        const limit = input.limit === undefined ? 30 : Number(input.limit);
        return apiClient.getRecentMessages(kind, roomId, limit);
      }
    },
    {
      name: 'edgechat.send_message',
      description: '向指定 EdgeChat 會話發送一條純文字消息。此操作會立即產生外部可見消息。',
      inputSchema: {
        type: 'object',
        properties: {
          kind: ROOM_KIND_SCHEMA,
          roomId: ROOM_ID_SCHEMA,
          content: {
            type: 'string',
            minLength: 1,
            maxLength: 10000,
            description: '要發送的消息正文'
          }
        },
        required: ['kind', 'roomId', 'content'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        requireSession(getSession);
        const { kind, roomId } = roomInput(input);
        return apiClient.sendRoomMessage(kind, roomId, {
          clientMessageId: createMessageId(),
          content: String(input.content || '').trim()
        });
      }
    },
    {
      name: 'edgechat.open_dm',
      description: '按準確用戶名找到用戶，並冪等地找到或創建與該用戶的 EdgeChat 私聊。',
      inputSchema: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            description: '目標用戶的準確用戶名，不包含 @'
          }
        },
        required: ['username'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false },
      async execute(input) {
        requireSession(getSession);
        const username = String(input.username || '').trim().toLowerCase();
        const payload = await apiClient.bootstrap();
        const user = (payload.users || []).find(
          (candidate) => String(candidate.username || '').toLowerCase() === username
        );
        if (!user) {
          throw new Error(`找不到用戶 @${username}`);
        }
        return apiClient.openDm(Number(user.id));
      }
    }
  ];
}

let registrationPromise: Promise<boolean> | null = null;

export function registerEdgeChatWebMcp(
  modelContextOverride?: WebMcpModelContext
): Promise<boolean> {
  if (registrationPromise) {
    return registrationPromise;
  }
  if (isDemoMode) {
    return Promise.resolve(false);
  }

  const modelContext =
    modelContextOverride ||
    (typeof document === 'undefined' ? undefined : (document as WebMcpDocument).modelContext);
  if (typeof modelContext?.registerTool !== 'function') {
    return Promise.resolve(false);
  }

  // WebMCP 只是頁面能力增強；註冊失敗不能改變 EdgeChat 原有啟動與通信鏈路。
  registrationPromise = (async () => {
    for (const tool of createEdgeChatWebMcpTools()) {
      await modelContext.registerTool(tool);
    }
    return true;
  })().catch(() => false);
  return registrationPromise;
}
