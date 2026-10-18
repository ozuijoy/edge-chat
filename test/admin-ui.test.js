import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { computed, ref } from 'vue';
import { adminNavigation, adminRouteIcons } from '../frontend/src/admin/navigation.ts';
import en from '../frontend/src/locales/en-US.js';
import tw from '../frontend/src/locales/zh-TW.js';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const routerSource = read('../frontend/src/router.js');
const apiSource = read('../frontend/src/api.js');
const adminApiSource = read('../worker/src/api/admin.js');
const mainSource = read('../frontend/src/main.js');
const adminPageSource = read('../frontend/src/pages/AdminPage.vue');
const navigationSource = read('../frontend/src/admin/navigation.ts');
const sidebarSource = read('../frontend/src/components/admin/AdminSidebar.vue');
const dashboardSource = read('../frontend/src/pages/AdminDashboardPage.vue');
const usersSource = read('../frontend/src/pages/AdminUsersPage.vue');
const userBanDialogSource = read('../frontend/src/components/admin/UserBanDialog.vue');
const userBanDurationSource = read('../frontend/src/admin/user-ban-duration.js');
const storageSource = read('../frontend/src/pages/AdminStoragePage.vue');
const invitesSource = read('../frontend/src/pages/AdminInvitesPage.vue');
const userCreatorSource = read('../frontend/src/components/admin/AdminUserCreator.vue');
const inviteManagerSource = read('../frontend/src/components/admin/RegistrationInviteManager.vue');
const siteSource = read('../frontend/src/pages/AdminSitePage.vue');
const siteAppearanceSource = read('../frontend/src/components/admin/AdminSiteAppearance.vue');
const telegramSource = read('../frontend/src/pages/AdminTelegramPage.vue');
const adminStyles = read('../frontend/src/styles/admin.css');
const adminTokens = read('../frontend/src/styles/admin/tokens.css');
const adminLayout = read('../frontend/src/styles/admin/layout.css');
const adminSidebarStyles = read('../frontend/src/styles/admin/sidebar.css');
const userBanDialogStyles = read('../frontend/src/styles/admin/user-ban-dialog.css');
const legacyTokens = read('../frontend/src/styles/tokens.css');
const dashboardStyles = read('../frontend/src/styles/admin/dashboard.css');
const invitesPageStyles = read('../frontend/src/styles/admin/invites-page.css');
const userCreatorStyles = read('../frontend/src/styles/admin/user-creator.css');
const inviteManagerStyles = read('../frontend/src/styles/admin/invite-manager.css');

test('後臺默認進入儀表盤並新增受保護的註冊邀請頁', () => {
  assert.match(routerSource, /component: \(\) => import\('\.\/pages\/AdminDashboardPage\.vue'\)/);
  assert.match(routerSource, /component: \(\) => import\('\.\/pages\/AdminInvitesPage\.vue'\)/);
  assert.match(routerSource, /redirect: \{ name: 'admin-dashboard' \}/);
  assert.match(routerSource, /path: 'dashboard'/);
  assert.match(routerSource, /path: 'invites'/);
  assert.match(routerSource, /adminTitleKey: 'admin\.nav\.invites'/);
  assert.match(routerSource, /meta: \{ admin: true/);
});

test('生產 Web 跨入後臺時發起真實文檔請求，後臺內部仍使用 SPA 導航', () => {
  assert.match(routerSource, /router\.beforeEach\(async \(to, from\) =>/);
  assert.match(routerSource, /to\.meta\.admin &&[\s\S]*!from\.meta\.admin/);
  assert.match(routerSource, /from\.matched\.length > 0/);
  assert.match(routerSource, /!isDemoMode &&[\s\S]*!isCapacitorAndroid/);
  assert.match(routerSource, /window\.location\.assign\(router\.resolve\(to\.fullPath\)\.href\)/);
  assert.match(sidebarSource, /void router\.push\(location\)/);
  assert.match(dashboardSource, /void router\.push\(path\)/);
});

test('側欄包含存儲統計並移除消息查看入口', () => {
  assert.match(sidebarSource, /t\('admin\.sidebar\.brand'\)/);
  for (const id of ['dashboard', 'users', 'storage', 'invites', 'telegram', 'site']) {
    assert.match(navigationSource, new RegExp(`id: '${id}'`));
  }
  assert.match(navigationSource, /labelKey: 'admin\.nav\.createUser'/);
  assert.match(navigationSource, /labelKey: 'admin\.nav\.registrationLinks'/);
  assert.match(navigationSource, /labelKey: 'admin\.nav\.siteAppearance'/);
  assert.match(navigationSource, /labelKey: 'admin\.nav\.versionUpdate'/);
  assert.doesNotMatch(navigationSource, /信息查看|\/admin\/messages/);
  assert.match(sidebarSource, /v-if="!item\.children"/);
  assert.match(sidebarSource, /:aria-expanded="isGroupOpen\(item\)"/);
  assert.match(sidebarSource, /v-show="isGroupOpen\(item\)"/);
});

test('儀表盤獨立置頂，業務分類與分隔線下的系統入口順序固定', () => {
  assert.deepEqual(adminNavigation.map((section) => section.items.map((item) => item.id)), [
    ['dashboard'],
    ['rbac', 'channels', 'users', 'invites'],
    ['telegram', 'instance-bridge'],
    ['site', 'storage', 'maintenance', 'stealth']
  ]);
  assert.equal(adminNavigation[0].labelKey, undefined);
  assert.equal(adminNavigation[1].labelKey, 'admin.nav.usersAccess');
  assert.equal(adminNavigation[2].labelKey, 'admin.nav.integrations');
  assert.deepEqual(adminNavigation.filter((section) => section.separated).map((section) => section.id), ['site-system']);
  assert.match(sidebarSource, /admin-nav-section--separated/);
  assert.match(sidebarSource, /:aria-labelledby="section\.label/);
  assert.match(adminSidebarStyles, /\.admin-nav-section--separated\s*\{\s*padding-block-start:[\s\S]*border-block-start:/);
  assert.doesNotMatch(adminSidebarStyles, /margin-block-start:\s*auto/);
});

test('用戶相關入口圖標彼此區分且頂欄同步同一來源', () => {
  const items = adminNavigation[1].items;
  assert.equal(new Set(items.map((item) => item.icon)).size, 4);
  for (const item of adminNavigation.flatMap((section) => section.items)) {
    assert.equal(adminRouteIcons[item.id], item.icon);
  }
  assert.match(routerSource, /adminTitleKey: 'rbac.title', adminIcon: 'rbac'/);
  assert.match(routerSource, /adminTitleKey: 'rbac.channels', adminIcon: 'channels'/);
});

function sidebarNavigation(messages, pages, permissions = []) {
  const source = sidebarSource.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+;\r?\n/gm, '');
  return runInNewContext(`${source}\n({ query, filteredNavigation });`, {
    computed, ref, adminNavigation,
    useRoute: () => ({ path: '/admin/dashboard', hash: '' }),
    useRouter: () => ({}),
    useI18n: () => ({ locale: ref('en-US'), t: (key) => messages[key] }),
    store: { session: {} },
    canVisit: (page) => pages.includes(page),
    can: (permission) => permissions.includes(permission)
  });
}

test('側欄按權限過濾分類和子菜單，隱藏空分類', () => {
  const { filteredNavigation } = sidebarNavigation(en, ['invites', 'storage'], ['invites.read']);
  const sections = filteredNavigation.value;
  assert.equal(sections.length, 2);
  assert.equal(sections[0].id, 'users-access');
  assert.equal(sections[0].items[0].children.length, 1);
  assert.equal(sections[0].items[0].children[0].id, 'registration-links');
  assert.equal(sections[1].id, 'site-system');
  assert.equal(sections[1].items[0].id, 'storage');
});

test('雙語搜索支持分類、頁面和子菜單，無結果時不殘留空標題', () => {
  const pages = adminNavigation.flatMap((section) => section.items.map((item) => item.id));
  for (const messages of [en, tw]) {
    const { query, filteredNavigation } = sidebarNavigation(messages, pages, ['users.create', 'invites.read']);
    query.value = messages['admin.nav.integrations'];
    assert.equal(filteredNavigation.value.length, 1);
    assert.equal(filteredNavigation.value[0].items.length, 2);
    query.value = messages['admin.nav.registrationLinks'];
    assert.equal(filteredNavigation.value.length, 1);
    assert.equal(filteredNavigation.value[0].items[0].id, 'invites');
    assert.ok(filteredNavigation.value[0].items[0].children.some((child) => child.id === 'registration-links'));
    query.value = messages['admin.nav.storage'];
    assert.equal(filteredNavigation.value[0].items[0].id, 'storage');
    query.value = 'no-matching-navigation-xyz';
    assert.equal(filteredNavigation.value.length, 0);
    query.value = '';
    assert.equal(filteredNavigation.value.length, 4);
    assert.equal(messages['admin.nav.site'], messages['admin.nav.siteAppearance']);
  }
  assert.match(adminSidebarStyles, /\.admin-nav-item > svg\s*\{\s*flex-shrink: 0;/);
  assert.match(adminSidebarStyles, /\.admin-nav-item > span\s*\{[\s\S]*?overflow-wrap: anywhere;/);
});

test('側欄分組默認收起，主按鈕導航且僅箭頭負責展開', () => {
  assert.match(sidebarSource, /openGroups\s*=\s*ref\(new Set\(\)\)/);
  assert.doesNotMatch(sidebarSource, /watch\s*\(/);
  assert.match(sidebarSource, /class="admin-nav-item admin-nav-item--group"[\s\S]*@click="navigate\(item\.to\)"/);
  assert.match(sidebarSource, /class="admin-nav-group__toggle"[\s\S]*@click="toggleGroup\(item\.id\)"/);
  assert.match(adminSidebarStyles, /\.admin-nav-group__toggle\s*\{[\s\S]*flex:\s*0 0 44px;/);
});

test('存儲統計由按鈕手動刷新且四個統計列均可排序', () => {
  assert.match(routerSource, /component: \(\) => import\('\.\/pages\/AdminStoragePage\.vue'\)/);
  assert.match(routerSource, /path: 'storage'/);
  assert.match(apiSource, /adminStorageScan/);
  const storageApi = readFileSync(new URL('../worker/src/api/storage.ts', import.meta.url), 'utf8');
  assert.match(storageApi, /\/api\/admin\/storage\/scan/);
  assert.match(storageApi, /\/api\/admin\/files\/backfill/);
  assert.match(storageApi, /%Y-%m-%dT%H:%M:%SZ.*MAX\(created_at\)/);
  assert.match(storageApi, /FROM uploaded_files/);
  assert.match(storageSource, /@click="refreshStorage"/);
  assert.doesNotMatch(storageSource, /onMounted(refreshStorage)/);
  assert.doesNotMatch(storageSource, /尚未統計|10 GB|免費存儠|R2/);
  for (const key of ['objectCount', 'bytes', 'share', 'latestUploadedAt']) {
    assert.match(storageSource, new RegExp(`key: '${key}'`));
  }
  assert.match(storageSource, /@click="changeSort\(column\.key\)"/);
});

test('用戶管理只維護用戶列表，創建用戶和註冊鏈接集中在註冊邀請頁', () => {
  assert.match(usersSource, /t\('users\.list'\)/);
  assert.doesNotMatch(usersSource, /AdminUserCreator|RegistrationInviteManager|創建用戶|註冊鏈接/);
  assert.match(invitesSource, /import AdminUserCreator/);
  assert.match(invitesSource, /import RegistrationInviteManager/);
  assert.match(invitesSource, /id="create-user"/);
  assert.match(invitesSource, /id="registration-links"/);
});

test('用戶管理通過獨立彈窗選擇快捷、自定義或永久封禁時長', () => {
  assert.match(usersSource, /import UserBanDialog/);
  assert.match(usersSource, /banDurationMinutes/);
  assert.match(usersSource, /@confirm="disableUser"/);
  assert.match(userBanDialogSource, /role="dialog"/);
  assert.match(userBanDialogSource, /useOverlayLifecycle/);
  assert.match(userBanDialogSource, /value="days"/);
  assert.match(userBanDialogSource, /value="hours"/);
  assert.match(userBanDialogSource, /value="minutes"/);
  assert.match(userBanDialogSource, /selection === 'custom'/);
  assert.match(userBanDialogSource, /value: 'permanent'/);
  assert.match(userBanDurationSource, /BAN_DURATION_PRESETS/);
  assert.match(adminStyles, /user-ban-dialog\.css/);
  assert.match(userBanDialogStyles, /@media \(max-width: 480px\)/);
  assert.match(usersSource, /user\.disabledUntil/);
  assert.match(adminApiSource, /disabled_until = \?/);
  assert.match(adminApiSource, /session_version = session_version \+ 1/);
});

test('註冊邀請頁限制內容寬度並用獨立卡片組織創建工具與鏈接列表', () => {
  assert.match(invitesSource, /admin-invites-page/);
  assert.match(invitesPageStyles, /max-width: 1120px/);
  assert.match(userCreatorSource, /admin-user-creator__identity-grid/);
  assert.match(userCreatorStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(inviteManagerSource, /invite-create-panel/);
  assert.match(inviteManagerSource, /t\('invites\.createdCount', \{ count: invites\.length \}\)/);
  assert.match(inviteManagerSource, /admin-invite-card__status/);
  assert.match(inviteManagerStyles, /border: 1px solid var\(--admin-border-strong\)/);
  assert.doesNotMatch(inviteManagerStyles, /max-height: 320px|border-block-start: 1px solid var\(--admin-border\);\s*border-radius: 0/);
});

test('網站設置只讀取站點配置且不重複展示統計信息', () => {
  assert.match(siteAppearanceSource, /api\.adminSiteSettings\(\)/);
  assert.doesNotMatch(siteSource, /adminOverview|admin-metric|站內用戶|公開群組|私信會話/);
  assert.match(siteSource, /id="site-appearance"/);
  assert.match(siteSource, /id="version-update"/);
});

test('儀表盤複用現有概況接口並只展示可驗證統計', () => {
  assert.match(dashboardSource, /api\.adminOverview\(\)/);
  assert.match(dashboardSource, /overview\.value\.stats\.messages/);
  assert.match(dashboardSource, /overview\.value\.stats\.activeUsers/);
  assert.doesNotMatch(dashboardSource, /overview\.value\.users/);
  assert.match(dashboardSource, /t\('dashboard\.quickAccess'\)/);
  assert.match(dashboardSource, /t\('dashboard\.systemOverview'\)/);
});

test('Telegram 互通頁由管理員路由保護並統一管理公開與私有群組映射', () => {
  assert.match(routerSource, /component: \(\) => import\('\.\/pages\/AdminTelegramPage\.vue'\)/);
  assert.match(routerSource, /path: 'telegram'/);
  assert.match(routerSource, /adminTitleKey: 'admin\.nav\.telegram'/);
  assert.match(telegramSource, /api\.saveAdminTelegramConfig/);
  assert.match(telegramSource, /api\.createAdminTelegramMapping/);
  assert.match(telegramSource, /type="checkbox"/);
  assert.match(telegramSource, /t\('telegram\.chatId'\)/);
  assert.match(telegramSource, /t\('telegram\.edgechatGroup'\)/);
  assert.match(telegramSource, /channel\.kind === 'private'/);
});

test('儀表盤在中等桌面寬度提前重排且快捷入口文字保持完整', () => {
  assert.match(
    dashboardStyles,
    /@media \(max-width: 64rem\)[\s\S]*\.admin-dashboard__body\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/
  );
  assert.match(
    dashboardStyles,
    /@media \(max-width: 75rem\)[\s\S]*\.admin-dashboard__metrics\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(dashboardStyles, /\.admin-quick-link__copy strong\s*\{[\s\S]*overflow-wrap: anywhere;/);
  assert.doesNotMatch(
    dashboardStyles,
    /\.admin-quick-link__copy strong\s*\{[\s\S]*?text-overflow: ellipsis;[\s\S]*?\}/
  );
});

test('輕量後臺保留按需加載、可訪問導航和按權限展示的設置入口', () => {
  const topbar = read('../frontend/src/components/admin/AdminTopbar.vue');
  assert.match(topbar, /v-if="canVisit\('site'\)"/);
  assert.match(topbar, /:aria-label="t\('admin\.nav\.site'\)"/);
  assert.match(sidebarSource, /:aria-current="isChildActive\(item, child\) \? 'location'/);
  assert.match(sidebarSource, /@keydown\.esc="closeMobileNavigation"/);
  assert.match(sidebarSource, /mobileToggle\.value\?\.focus\(\)/);
  assert.match(adminPageSource, /id="admin-main"[^>]+tabindex="-1"/);
  assert.match(adminSidebarStyles, /position: fixed;\s*inset: 60px 0 0;/);
  assert.doesNotMatch(adminStyles + adminTokens, /@import url|backdrop-filter/);
});

test('用戶列表搜索明確為本頁且保留原分頁和權限操作', () => {
  assert.match(usersSource, /filterAdminUsers\(users\.value, query\.value\)/);
  assert.match(usersSource, /t\('users\.searchPage'\)/);
  assert.match(usersSource, /users\.length < 100/);
  assert.match(usersSource, /v-for="user in visibleUsers"/);
  assert.match(usersSource, /aria-labelledby="admin-users-title"/);
  assert.match(usersSource, /class="error-text" role="alert"/);
  assert.match(usersSource, /can\('users\.delete'\) && canTarget\(user\)/);
  assert.match(dashboardSource, /loading \|\| error \? '—'/);
});

test('用戶組選擇位於最右側操作區，不再增高姓名列', () => {
  const identityCell = usersSource.match(/<td class="admin-user-identity">([\s\S]*?)<\/td>/)[1];
  const actionsCell = usersSource.match(/<td class="admin-user-actions"[^>]*>([\s\S]*?)<\/td>/)[1];
  const usersStyles = read('../frontend/src/styles/admin/users.css');
  assert.doesNotMatch(identityCell, /UserGroupAssignment/);
  assert.match(actionsCell, /<UserGroupAssignment[^>]+v-if="store\.session\?\.isSuperAdmin"/);
  assert.match(actionsCell, /<UserGroupAssignment[^\n]+\/>\s*<\/div>\s*$/);
  assert.match(usersStyles, /\.admin-user-actions \.group-assignment\s*\{[^}]*margin: 0;[^}]*margin-inline-start: auto;/);
});

test('管理員消息正文查看的頁面、客戶端調用與服務端接口均已下線', () => {
  assert.doesNotMatch(routerSource, /AdminMessagesPage|AdminRoomPage|admin-messages|admin-room/);
  assert.doesNotMatch(apiSource, /adminRoomMessages|searchMessages|\/admin\/messages\/search/);
  assert.doesNotMatch(adminApiSource, /\/api\/admin\/messages|\/api\/admin\/rooms.*messages/);
  assert.doesNotMatch(dashboardSource, /消息查看|\/admin\/messages/);
});

test('後臺視覺令牌匹配參考圖並按職責拆分樣式文件', () => {
  assert.doesNotMatch(mainSource, /styles\/admin\.css/);
  assert.match(adminPageSource, /import '\.\.\/styles\/admin\.css';/);
  assert.match(adminStyles, /@import '\.\/admin\/tokens\.css';/);
  assert.match(adminStyles, /@import '\.\/admin\/layout\.css';/);
  assert.match(adminStyles, /@import '\.\/admin\/controls\.css';/);
  assert.match(adminTokens, /--admin-workspace: #f0f3f8;/);
  assert.match(adminTokens, /--admin-panel: #ffffff;/);
  assert.match(adminTokens, /--admin-ink: #0d1731;/);
  assert.match(adminTokens, /--admin-green-bg: #f1fdfb;/);
  assert.match(adminTokens, /--admin-green: #168c87;/);
  assert.doesNotMatch(adminTokens, /backdrop-filter|linear-gradient/);
  assert.doesNotMatch(legacyTokens, /admin-shell|admin-grid--two|admin-metric-grid--wide/);
});

test('後臺核心 Vue 文件保持在單一職責的可維護規模', () => {
  for (const [name, source] of [
    ['AdminSidebar', sidebarSource],
    ['AdminDashboardPage', dashboardSource],
    ['AdminUsersPage', usersSource],
    ['AdminStoragePage', storageSource],
    ['AdminTelegramPage', telegramSource],
    ['AdminSitePage', siteSource]
  ]) {
    assert.ok(source.split('\n').length < 260, `${name} 不應重新膨脹為超大文件`);
  }
});

test('移動端後臺始終保留獨立的縱向滾動區域', () => {
  assert.match(adminLayout, /\.admin-page\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(adminLayout, /\.admin-workspace\s*\{[\s\S]*?min-height:\s*0;/);
  assert.match(adminLayout, /\.admin-content\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?touch-action:\s*pan-y;/);
  assert.match(adminSidebarStyles, /\.admin-sidebar__body\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?touch-action:\s*pan-y;/);
});
