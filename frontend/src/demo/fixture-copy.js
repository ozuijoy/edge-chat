import { ENGLISH_LOCALE, TRADITIONAL_CHINESE_LOCALE } from '../i18n.js';

// demo 預置數據的可讀文案按訪問者語言提供：海外訪客首次打開演示站時，
// 界面與聊天內容保持同一種語言，避免英文界面裡出現整屏中文示例而誤判產品不支持英文。
const DEMO_FIXTURE_COPY = {
  'zh-TW': {
    adminName: '演示管理員',
    longName: '負責跨團隊協作與超長姓名版面驗證的演示用戶',
    longBio: '用於驗證長名稱在通訊錄與資料卡中的自然降級。',
    generalDescription: '全員公告與日常交流',
    productName: '產品協作',
    productDescription: '規劃版本與驗證交付',
    telegramName: 'Telegram 聯動',
    telegramDescription: '展示 EdgeChat 與 Telegram 群組訊息雙向同步',
    publicName: '公開討論',
    publicDescription: '任何成員都可以發現並加入',
    welcome: '歡迎來到 EdgeChat 演示站。這裡展示頻道、私訊、附件與訊息管理。',
    adminTour: '管理員可以從左側進入後臺，查看用戶、邀請、站點設定和 Telegram 映射。',
    imageAttachment: '這是一則圖片附件訊息，點擊圖片可以開啟預覽。',
    localOnly: '所有演示操作都只保存在目前的瀏覽器頁面中。',
    mutedMember: '我先暫停參與討論，稍後再跟進。',
    productUpdate: '新版本的附件授權讀取已經驗證完成。',
    productMention: '@admin 收到，我會繼續檢查行動端訊息列表。',
    telegramOutbound: '這則訊息由 EdgeChat 發送，並同步到了 Telegram 群組。',
    telegramInbound: 'Telegram 群組裡的回覆也會回到同一個 EdgeChat 頻道。',
    publicPreview: '這個公開群組尚未加入，點擊後會在本地模擬加入。',
    dmHello: '你好，這裡是一對一私訊會話。',
    dmTour: '訊息發送、附件上傳和刪除都可以在 demo 中體驗。',
    inviteNote: '體驗邀請註冊流程',
    teamInviteNote: '產品體驗成員',
    telegramChatTitle: 'EdgeChat 演示群組',
    telegramMember: 'Telegram · 演示群組成員',
    telegramAutoReply: 'Telegram 已收到這則訊息，並把群組內回覆同步回 EdgeChat。'
  },
  'en-US': {
    adminName: 'Demo Admin',
    longName: 'Demo user who coordinates cross-team work and tests very long display names',
    longBio: 'Used to check how long names degrade gracefully in contacts and profile cards.',
    generalDescription: 'Announcements and everyday conversation for everyone',
    productName: 'Product Team',
    productDescription: 'Plan releases and verify delivery',
    telegramName: 'Telegram Bridge',
    telegramDescription: 'Shows two-way sync between EdgeChat and a Telegram group',
    publicName: 'Open Discussion',
    publicDescription: 'Any member can discover and join',
    welcome: 'Welcome to the EdgeChat demo. Explore groups, DMs, attachments and moderation.',
    adminTour: 'Admins can open the console on the left to manage users, invites, site settings and Telegram mappings.',
    imageAttachment: 'This message carries an image attachment. Click it to open the preview.',
    localOnly: 'Everything you do in this demo stays in this browser tab.',
    mutedMember: 'Stepping away from the discussion for now, will follow up later.',
    productUpdate: 'Authorized attachment downloads are verified for the new release.',
    productMention: '@admin Got it, I will keep checking the mobile message list.',
    telegramOutbound: 'This message was sent from EdgeChat and synced to the Telegram group.',
    telegramInbound: 'Replies from the Telegram group come back to the same EdgeChat channel.',
    publicPreview: 'You have not joined this public group yet. Click to simulate joining locally.',
    dmHello: 'Hi, this is a one-to-one direct message.',
    dmTour: 'Sending, uploading attachments and deleting messages all work in the demo.',
    inviteNote: 'Try the invitation sign-up flow',
    teamInviteNote: 'Product preview members',
    telegramChatTitle: 'EdgeChat Demo Group',
    telegramMember: 'Telegram · Demo member',
    telegramAutoReply: 'Telegram received this message and synced the group reply back to EdgeChat.'
  }
};

export function getDemoFixtureCopy(locale) {
  if (locale === ENGLISH_LOCALE) return DEMO_FIXTURE_COPY[locale];
  return DEMO_FIXTURE_COPY[TRADITIONAL_CHINESE_LOCALE];
}
