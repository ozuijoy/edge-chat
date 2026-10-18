import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const activity = read("../android/app/src/main/java/com/aozorae/edgechat/MainActivity.kt");
const manifest = read("../android/app/src/main/AndroidManifest.xml");
const chatPane = read("../android/app/src/main/java/com/aozorae/edgechat/feature/chat/ChatPane.kt");

test("Android chat consumes IME and navigation insets once in edge-to-edge mode", () => {
	assert.match(activity, /WindowCompat\.setDecorFitsSystemWindows\(window, false\)/);
	assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
	assert.match(chatPane, /WindowInsets\.navigationBars\.union\(WindowInsets\.ime\)/);
	assert.match(chatPane, /\.windowInsetsPadding\(bottomInsets\)/);
	assert.doesNotMatch(chatPane, /\.(?:navigationBarsPadding|imePadding)\(\)/);
});
