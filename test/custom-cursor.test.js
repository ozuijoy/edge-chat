import assert from "node:assert/strict";
import test from "node:test";

import { calculateCursorLeft } from "../frontend/src/composables/useCursor.js";

test("自定义光标会抵消输入框横向滚动并保持在可视范围内", () => {
	assert.equal(
		calculateCursorLeft({
			textWidth: 120,
			scrollLeft: 0,
			paddingLeft: 4,
			paddingRight: 4,
			viewportWidth: 320,
			cursorWidth: 3,
		}),
		124,
	);

	assert.equal(
		calculateCursorLeft({
			textWidth: 480,
			scrollLeft: 160,
			paddingLeft: 4,
			paddingRight: 4,
			viewportWidth: 320,
			cursorWidth: 3,
		}),
		313,
	);

	assert.equal(
		calculateCursorLeft({
			textWidth: 0,
			scrollLeft: 160,
			paddingLeft: 4,
			paddingRight: 4,
			viewportWidth: 320,
			cursorWidth: 3,
		}),
		4,
	);
});
