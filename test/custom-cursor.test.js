import assert from "node:assert/strict";
import test from "node:test";

import { calculateCursorLeft } from "../frontend/src/composables/useCursor.js";

test("自定義光標會抵消輸入框橫向滾動並保持在可視範圍內", () => {
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
