import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexHtml = readFileSync(new URL("../frontend/index.html", import.meta.url), "utf8");
const chatPage = readFileSync(
	new URL("../frontend/src/pages/ChatPage.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const attachmentStyles = readFileSync(
	new URL("../frontend/src/styles/chat-attachments.css", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const mobileDrawer = readFileSync(
	new URL("../frontend/src/components/chat/MobileNavigationDrawer.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const conversationList = readFileSync(
	new URL("../frontend/src/components/chat/ConversationList.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const messageComposer = readFileSync(
	new URL("../frontend/src/components/chat/MessageComposer.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const demoNavigator = readFileSync(
	new URL("../frontend/src/components/demo/DemoNavigator.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

function getStyleRule(source, selector) {
	const marker = `${selector} {`;
	const start = source.indexOf(marker);
	assert.notEqual(start, -1, `聊天頁缺少樣式規則：${selector}`);
	const end = source.indexOf("}", start + marker.length);
	assert.notEqual(end, -1, `聊天頁樣式規則未閉合：${selector}`);
	return source.slice(start, end + 1);
}

test("聊天界面使用原始控件尺寸鋪滿整個視口", () => {
	const layout = getStyleRule(chatPage, ".chat-layout");
	assert.match(layout, /width:\s*100%;/);
	assert.match(layout, /height:\s*var\(--chat-viewport-height,\s*100dvh\);/);
	assert.match(layout, /position:\s*fixed;/);
	assert.match(layout, /top:\s*var\(--chat-viewport-offset-top,\s*0px\);/);
	assert.match(layout, /overflow:\s*hidden;/);
	assert.match(indexHtml, /interactive-widget=resizes-content/);
	assert.doesNotMatch(chatPage, /--chat-interface-scale/);
	assert.doesNotMatch(chatPage, /zoom\s*:/);
	assert.doesNotMatch(chatPage, /width:\s*80%;/);
	assert.doesNotMatch(chatPage, /height:\s*80vh;/);
});

test("移動端附件預覽不會擠出發送按鈕", () => {
	assert.match(messageComposer, /\.composer-attachment\s*{[^}]*min-width:\s*0;/s);
	assert.match(messageComposer, /\.composer-row\s*{[^}]*min-width:\s*0;/s);
	assert.match(messageComposer, /\.composer-btn,\s*\.composer-send\s*{[^}]*flex-shrink:\s*0;/s);
	assert.match(attachmentStyles, /\.pending-attachment\s*{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s);
	assert.match(attachmentStyles, /\.pending-attachment__name\s*{[^}]*min-width:\s*0;[^}]*text-overflow:\s*ellipsis;/s);
});

test("移動端前臺滾動區允許縱向觸摸滑動", () => {
	assert.match(conversationList, /\.sidebar-list\s*{[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s);
	assert.match(chatPage, /\.chat-messages\s*{[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s);
	assert.match(mobileDrawer, /\.mobile-navigation-drawer\s*{[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s);
});

test("移動端聊天頁只顯示會話列表或當前聊天中的一個視圖", () => {
	assert.match(chatPage, /'chat-layout--mobile-list': isMobileViewport && mobileView === 'list'/);
	assert.match(chatPage, /'chat-layout--mobile-chat': isMobileViewport && mobileView === 'chat'/);
	assert.match(
		chatPage,
		/\.chat-layout--mobile-list \.chat-main,\s*\.chat-layout--mobile-chat \.left-sidebar\s*{\s*display:\s*none;/s,
	);
	assert.match(chatPage, /class="chat-header__back"/);
	assert.match(chatPage, /@click="returnToMobileConversationList"/);
});

test("移動端主要操作保留四十四像素觸控區域且文字發送按鈕可自然擴展", () => {
	assert.match(chatPage, /\.mobile-menu-action\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
	assert.match(chatPage, /\.chat-header__back\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
	assert.match(chatPage, /\.chat-header__button\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
	assert.match(messageComposer, /\.composer-btn,\s*\.composer-send\s*{[^}]*height:\s*44px;/s);
	assert.match(messageComposer, /\.composer-send\s*{[^}]*width:\s*auto;[^}]*min-width:\s*(?:44|[5-9]\d)px;/s);
	assert.match(messageComposer, /\.composer-send\s*{[^}]*white-space:\s*nowrap;/s);
	assert.match(messageComposer, /font-size:\s*16px;/);
});

test("窄屏演示導航避開輸入區和聊天覆蓋層", () => {
	assert.match(
		demoNavigator,
		/bottom:\s*calc\(116px \+ env\(safe-area-inset-bottom\)\);/,
	);
	for (const selector of [
		"body:has(.room-management-layer) .demo-navigator",
		"body:has(.composer-rich-editor) .demo-navigator",
		"body:has(.composer-attachment) .demo-navigator",
		"body:has(.composer-reply) .demo-navigator",
	]) {
		assert.ok(demoNavigator.includes(selector), `演示導航缺少避讓規則：${selector}`);
	}
});

test("演示 Star 入口保留安全外鏈、無障礙標籤與窄屏觸控區域", () => {
	assert.match(demoNavigator, /class="demo-navigator__star"[^>]*href="https:\/\/github\.com\/aozorae\/Edgechat"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*:title="t\('demo\.star'\)"[^>]*:aria-label="t\('demo\.star'\)"/s);
	assert.match(demoNavigator, /<Star[^>]*aria-hidden="true"/);
	assert.match(getStyleRule(demoNavigator, ".demo-navigator__star:focus-visible"), /outline:\s*2px solid/);
	const mobileStyles = demoNavigator.slice(demoNavigator.indexOf("@media (max-width: 640px)"));
	assert.match(getStyleRule(mobileStyles, ".demo-navigator__star"), /width:\s*44px;\s*height:\s*44px;/);
	assert.match(getStyleRule(mobileStyles, ".demo-navigator__star span"), /display:\s*none;/);
});

test("聊天側欄跟隨全屏根節點且不汙染後臺根節點", () => {
	for (const selector of [
		".left-sidebar",
		".right-sidebar",
		".room-management-sidebar",
	]) {
		assert.match(getStyleRule(chatPage, selector), /height:\s*100%;/);
	}

	assert.doesNotMatch(chatPage, /(?:html|body|#app|\.admin-page)\s*{[^}]*zoom:/s);
});

test("桌面側欄提供明確的個人設置入口並保留移動端入口", () => {
	const sidebar = chatPage.slice(chatPage.indexOf('<aside class="right-sidebar">'), chatPage.indexOf('<aside class="left-sidebar">'));
	assert.match(sidebar, /<button[^>]*class="[^"]*right-sidebar-action--settings[^>]*:data-tooltip="t\('nav\.personalSettings'\)"[^>]*:aria-label="t\('nav\.personalSettings'\)"[^>]*@click="openSettings"\s*>\s*<Settings :size="20" aria-hidden="true" \/>\s*<span class="right-sidebar-action__label">\{\{ t\('nav\.personalSettings'\) \}\}<\/span>/s);
	assert.match(chatPage, /function openSettings\(\) \{ router\.push\('\/settings'\); \}/);
	assert.match(getStyleRule(chatPage, ".right-sidebar-action--settings .right-sidebar-action__label"), /white-space:\s*normal;/);
	assert.match(sidebar, /class="right-sidebar-user tooltip"/);
	assert.match(mobileDrawer, /@click="emit\('settings'\)"/);
	assert.match(chatPage, /@settings="navigateFromMobileDrawer\(openSettings\)"/);
});

	test("桌面端管理後臺入口在圖標下方顯示文字", () => {
		assert.match(chatPage, /class="right-sidebar-action right-sidebar-action--admin tooltip"/);
		assert.match(chatPage, /<span class="right-sidebar-action__label">\{\{ t\('nav\.admin'\) \}\}<\/span>/);
	assert.match(chatPage, /\.right-sidebar-action--admin\s*{[^}]*flex-direction:\s*column;/s);
		assert.match(chatPage, /\.right-sidebar-action__label\s*{[^}]*font-size:\s*11px;/s);
});

	test("GitHub 倉庫入口位於添加人員左側並複用相同按鈕尺寸", () => {
		const githubLink = chatPage.indexOf('href="https://github.com/aozorae/Edgechat"');
		const addConversation = chatPage.indexOf(':title="t(\'chat.addPeople\')"');
	assert.notEqual(githubLink, -1);
	assert.ok(githubLink < addConversation);
	assert.match(chatPage, /src="\/github\.svg"/);
	assert.match(chatPage, /rel="noopener noreferrer"/);

	const headerAction = getStyleRule(chatPage, ".header-action");
		assert.match(headerAction, /flex:\s*0 0 var\(--chat-control\);/);
		assert.match(headerAction, /width:\s*var\(--chat-control\);/);
		assert.match(headerAction, /height:\s*var\(--chat-control\);/);
	});

	test("語言切換入口位於聊天頁右上區域且移動端保持可達", () => {
		assert.doesNotMatch(chatPage, /right-sidebar-action--language/);
		assert.match(chatPage, /<LanguageSwitch class="chat-header__language-switch" \/>/);
		assert.match(chatPage, /<LanguageSwitch class="chat-empty__language-switch" \/>/);
		assert.match(chatPage, /<LanguageSwitch class="mobile-language-switch" \/>/);
		assert.match(chatPage, /\.chat-empty__language-switch\s*{[^}]*position:\s*absolute;[^}]*right:\s*16px;/s);
		});

test("聊天頁面通過專用組件編排會話列表和消息輸入區", () => {
	assert.match(chatPage, /<ConversationList/);
	assert.match(chatPage, /:is-room-muted="isRoomMuted"/);
	assert.match(chatPage, /<MessageComposer/);
	assert.match(chatPage, /v-model="composerText"/);
	assert.match(chatPage, /@upload="uploadAttachment"/);
});

test("消息輸入區常駐獨立的文字發送和語音按鈕", () => {
	assert.match(messageComposer, /class="[^"]*composer-voice[^"]*"[\s\S]*class="composer-send"/);
	assert.match(messageComposer, /class="composer-send"[\s\S]*\{\{ t\('chat\.send'\) \}\}/);
	assert.doesNotMatch(
		messageComposer,
		/v-(?:if|else-if)="[^"]*modelValue[^"]*"[^>]*class="composer-(?:voice|send)"/,
	);
});

test("輸入法 Enter 不發送，原生權限拒絕可打開設置且設置失敗有專用錯誤", () => {
	assert.match(
		messageComposer,
		/if \(composing\.value \|\| event\.isComposing \|\| event\.keyCode === 229\) return;/,
	);
	assert.match(messageComposer, /@compositionstart="composing = true"/);
	assert.match(messageComposer, /@compositionend="composing = false"/);
	assert.match(messageComposer, /error\?\.message === "native_microphone_permission_denied"/);
	assert.match(messageComposer, /showPermissionSettings\.value = isCapacitorAndroid && permissionDenied;/);
	assert.match(messageComposer, /recordingError\.value = t\("voice\.settingsFailed"\);/);
});
