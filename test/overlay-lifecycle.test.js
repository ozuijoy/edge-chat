import assert from "node:assert/strict";
import test from "node:test";
import { createRenderer, nextTick, ref, shallowRef } from "vue";
import { useOverlayLifecycle } from "../frontend/src/composables/useOverlayLifecycle.js";

test("弹层堆叠仅顶层响应 Esc/Tab，滚动锁计数与焦点恢复正确", async () => {
	const original = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
	const handlers = new Map();
	const document = { body: { style: { overflow: "auto" } }, activeElement: null };
	function dispatch(type, event) {
		for (const listener of [...(handlers.get(type) || [])]) listener(event);
	}
	class Element {
		constructor(root = null) {
			this.root = root;
			this.isConnected = true;
			this.tabIndex = 0;
			this.children = [];
		}
		contains(element) { return element === this || this.children.includes(element); }
		closest() { return this.root; }
		querySelectorAll() { return this.children; }
		getClientRects() { return [{}]; }
		hasAttribute() { return true; }
		focus() { document.activeElement = this; dispatch("focusin", { target: this }); }
	}
	const renderer = createRenderer({
		createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {},
	});
	const apps = [];
	globalThis.HTMLElement = Element;
	globalThis.document = document;
	globalThis.window = {
		addEventListener(type, listener) {
			if (!handlers.has(type)) handlers.set(type, new Set());
			handlers.get(type).add(listener);
		},
		removeEventListener(type, listener) { handlers.get(type)?.delete(listener); },
	};
	function mount() {
		const open = ref(false);
		const root = new Element();
		const first = new Element(root);
		const last = new Element(root);
		root.children = [first, last];
		const restoreFocus = ref(true);
		const app = renderer.createApp({
			setup() {
				useOverlayLifecycle({ open, onClose: () => { open.value = false; }, focusTarget: shallowRef(first), container: shallowRef(root), restoreFocus });
				return () => null;
			},
		});
		app.mount({});
		apps.push(app);
		return { open, root, first, last, restoreFocus };
	}
	function key(key, shiftKey = false) {
		const event = { key, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
		dispatch("keydown", event);
	}
	try {
		const trigger = new Element();
		trigger.focus();
		const lower = mount();
		const upper = mount();
		lower.open.value = true;
		await nextTick(); await nextTick();
		assert.equal(document.activeElement, lower.first);
		upper.open.value = true;
		await nextTick(); await nextTick();
		assert.equal(document.activeElement, upper.first);
		assert.equal(document.body.style.overflow, "hidden");
		key("Tab", true);
		assert.equal(document.activeElement, upper.last);
		key("Tab");
		assert.equal(document.activeElement, upper.first);
		trigger.focus();
		assert.equal(document.activeElement, upper.root);
		key("Escape");
		await nextTick();
		assert.equal(upper.open.value, false);
		assert.equal(lower.open.value, true);
		assert.equal(document.activeElement, lower.first);
		assert.equal(document.body.style.overflow, "hidden");
		key("Escape");
		await nextTick();
		assert.equal(document.activeElement, trigger);
		assert.equal(document.body.style.overflow, "auto");
		lower.open.value = true;
		await nextTick(); await nextTick();
		lower.restoreFocus.value = false;
		lower.open.value = false;
		await nextTick();
		assert.equal(document.activeElement, lower.first);
		assert.equal(handlers.get("keydown").size, 0);
		assert.equal(handlers.get("focusin").size, 0);
	} finally {
		for (const app of apps) app.unmount();
		for (const [name, value] of Object.entries(original)) {
			if (value === undefined) delete globalThis[name];
			else globalThis[name] = value;
		}
	}
});
