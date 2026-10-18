import { nextTick, onBeforeUnmount, watch } from "vue";

let openOverlayCount = 0;
let previousBodyOverflow = "";
const overlayStack = [];

function lockPageScroll() {
	if (openOverlayCount === 0) {
		previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
	}
	openOverlayCount += 1;
}

function unlockPageScroll() {
	openOverlayCount = Math.max(0, openOverlayCount - 1);
	if (openOverlayCount === 0) {
		document.body.style.overflow = previousBodyOverflow;
	}
}

export function useOverlayLifecycle({ open, onClose, focusTarget, container, restoreFocus = true }) {
	let active = false;
	let previousFocus = null;
	const entry = {};
	const resolveElement = (value) => typeof value === "function" ? value() : value?.value;
	const dialog = () => resolveElement(container) || resolveElement(focusTarget)?.closest('[role="dialog"]');
	const isTop = () => overlayStack.at(-1) === entry;

	function focusInside(event) {
		const root = dialog();
		if (isTop() && root && !root.contains(event.target)) root.focus();
	}

	function handleKeydown(event) {
		if (!isTop() || event.defaultPrevented) return;
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
		}
		if (event.key !== "Tab") return;
		const root = dialog();
		if (!root) return;
		const targets = [...root.querySelectorAll(
			'button, a[href], input, select, textarea, [tabindex]',
		)].filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
		const first = targets[0];
		const last = targets.at(-1);
		if (!first || !root.contains(document.activeElement) || document.activeElement === root ||
			(event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
			event.preventDefault();
			(event.shiftKey ? last : first)?.focus();
			if (!first) root.focus();
		}
	}

	async function activate() {
		if (active) {
			return;
		}

		active = true;
		overlayStack.push(entry);
		previousFocus = document.activeElement;
		lockPageScroll();
		window.addEventListener("keydown", handleKeydown);
		window.addEventListener("focusin", focusInside);
		await nextTick();
		if (active && isTop()) {
			const root = dialog();
			if (root && !root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
			const target = typeof focusTarget === "function" ? focusTarget() : focusTarget?.value;
			target?.focus();
		}
	}

	function deactivate({ restoreFocus: shouldRestore = true } = {}) {
		if (!active) {
			return;
		}

		active = false;
		overlayStack.splice(overlayStack.indexOf(entry), 1);
		window.removeEventListener("keydown", handleKeydown);
		window.removeEventListener("focusin", focusInside);
		unlockPageScroll();
		const allowRestore = typeof restoreFocus === "boolean" ? restoreFocus : restoreFocus.value;
		if (shouldRestore && allowRestore && previousFocus instanceof HTMLElement && previousFocus.isConnected) {
			previousFocus.focus();
		}
		previousFocus = null;
	}

	watch(
		open,
		(isOpen) => {
			if (isOpen) {
				void activate();
				return;
			}
			deactivate();
		},
		{ immediate: true },
	);

	onBeforeUnmount(() => deactivate({ restoreFocus: false }));
}
