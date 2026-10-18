import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const composer = readFileSync(
	new URL("../frontend/src/components/chat/MessageComposer.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const editor = readFileSync(
	new URL("../frontend/src/components/chat/VditorComposerEditor.vue", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const runtime = readFileSync(
	new URL("../frontend/src/vditor-runtime.ts", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const contentSafety = readFileSync(
	new URL("../frontend/src/vditor-content-safety.ts", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");
const main = readFileSync(new URL("../frontend/src/main.js", import.meta.url), "utf8");
const assetScript = readFileSync(
	new URL("../.github/scripts/prepare-vditor-assets.mjs", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

test("Vditor 只能由富文本按鈕點擊路徑動態加載", () => {
	assert.match(composer, /async function openRichEditor\(\)/);
	assert.match(composer, /import\("\.\.\/\.\.\/vditor-runtime\.ts"\)/);
	assert.match(composer, /import\("\.\/VditorComposerEditor\.vue"\)/);
	assert.match(composer, /@click="toggleRichEditor"/);
	assert.doesNotMatch(main, /vditor/i);
	assert.match(runtime, /import Vditor from "vditor";/);
	assert.match(runtime, /import "vditor\/dist\/index\.css";/);
});

test("加載時保留普通輸入並用代際阻止過期回調", () => {
	assert.match(composer, /v-if="richEditorLoading"[\s\S]*v-else-if="richEditorOpen"/);
	assert.match(composer, /generation !== richEditorLoadGeneration/);
	assert.match(composer, /watch\([\s\S]*props\.contextKey[\s\S]*collapseRichEditor/);
	assert.match(composer, /richEditor\.value\?\.syncValue\(\);[\s\S]*await nextTick\(\);[\s\S]*emit\("send"\)/);
});

test("編輯器複用 Markdown 草稿、提及候選和原發送快捷鍵約束", () => {
	assert.match(editor, /cache:\s*\{ enable: false \}/);
	assert.match(editor, /mode:\s*"wysiwyg"/);
	assert.match(editor, /extend:\s*\[\{ key: "@", hint: mentionHints \}\]/);
	assert.match(editor, /ctrlEnter\(value\)[\s\S]*emit\("send"\)/);
	assert.match(editor, /installVditorContentSafety\(editor\.vditor\.lute\)/);
	assert.match(editor, /transferTarget = editor\.vditor\.wysiwyg\.element/);
	assert.match(editor, /transferTarget\.addEventListener\("paste", insertTransferredText, true\)/);
	assert.match(editor, /image\.replaceWith/);
	assert.match(contentSafety, /lute\.Md2VditorDOM = \(markdown\) =>/);
	assert.match(contentSafety, /lute\.SpinVditorDOM = \(html\) =>/);
	assert.match(contentSafety, /data-type="html-block"/);
	assert.match(contentSafety, /codeBlock\.dataset\.type = "code-block"/);
	assert.match(contentSafety, /codeBlock\.after\(trailingParagraph\)/);
	assert.match(contentSafety, /querySelectorAll\("img"\)/);
	assert.match(contentSafety, /querySelectorAll\("\.vditor-wysiwyg__preview"\)/);
	assert.match(contentSafety, /pre:not\(\.vditor-wysiwyg__preview\) code/);
	assert.match(contentSafety, /preview\.replaceChildren\(document\.createTextNode/);
	assert.match(contentSafety, /iframe, object, embed, video, audio/);
	assert.match(editor, /render:\s*\{ media: \{ enable: false \} \}/);
	assert.match(editor, /mathBlockPreview:\s*false/);
	assert.match(editor, /codeBlockPreview:\s*false/);
	const toolbar = editor.match(/toolbar:\s*\[([\s\S]*?)\]/)?.[1];
	assert.ok(toolbar);
	assert.doesNotMatch(toolbar, /"fullscreen"|"upload"|"record"|"export"|"outline"/);
});

test("構建只準備自託管的最小 Vditor 運行時", () => {
	for (const path of [
		"dist/css/content-theme/light.css",
		"dist/js/icons/ant.js",
		"dist/js/i18n/en_US.js",
		"dist/js/i18n/zh_CN.js",
		"dist/js/lute/lute.min.js",
	]) {
		assert.ok(assetScript.includes(`"${path}"`));
	}
	assert.doesNotMatch(assetScript, /katex|mathjax|mermaid|highlight\.js|echarts/);
	assert.match(runtime, /const cdn = `\$\{baseUrl\}vendor\/vditor`/);
});
