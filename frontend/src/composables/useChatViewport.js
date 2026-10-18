import { ref } from "vue";

export function useChatViewport({ activeRoom }) {
	const isMobileViewport = ref(false);
	const mobileView = ref("list");
	let viewportInitialized = false;

	function syncViewportState() {
		const nextIsMobile = window.innerWidth <= 960;
		if (viewportInitialized && nextIsMobile === isMobileViewport.value) {
			return;
		}

		viewportInitialized = true;
		isMobileViewport.value = nextIsMobile;
		mobileView.value = nextIsMobile && !activeRoom.value ? "list" : "chat";
	}

	function syncViewportHeight() {
		const visualViewport = window.visualViewport;
		const viewportHeight = visualViewport?.height || window.innerHeight;
		// 部分移动浏览器会在键盘弹出时平移视觉视口，只同步高度会让输入栏停在旧位置。
		document.documentElement.style.setProperty(
			"--chat-viewport-height",
			`${Math.round(viewportHeight)}px`,
		);
		document.documentElement.style.setProperty(
			"--chat-viewport-offset-top",
			`${Math.round(visualViewport?.offsetTop || 0)}px`,
		);
	}

	function startViewportSync() {
		syncViewportState();
		syncViewportHeight();
		window.addEventListener("resize", syncViewportState);
		window.addEventListener("resize", syncViewportHeight);
		window.visualViewport?.addEventListener("resize", syncViewportHeight);
		window.visualViewport?.addEventListener("scroll", syncViewportHeight);
	}

	function stopViewportSync() {
		window.removeEventListener("resize", syncViewportState);
		window.removeEventListener("resize", syncViewportHeight);
		window.visualViewport?.removeEventListener("resize", syncViewportHeight);
		window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
		document.documentElement.style.removeProperty("--chat-viewport-height");
		document.documentElement.style.removeProperty("--chat-viewport-offset-top");
	}

	function openConversationView() {
		if (isMobileViewport.value) {
			mobileView.value = "chat";
		}
	}

	function returnToConversationList() {
		if (isMobileViewport.value) {
			mobileView.value = "list";
		}
	}

	return {
		isMobileViewport,
		mobileView,
		startViewportSync,
		stopViewportSync,
		openConversationView,
		returnToConversationList,
	};
}
