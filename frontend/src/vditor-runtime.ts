import Vditor from "vditor";
import "vditor/dist/index.css";

type VditorLanguage = "en_US" | "zh_CN";

export type EdgeChatVditorRuntime = {
	Vditor: typeof Vditor;
	cdn: string;
	i18n: Record<string, string>;
};

const baseUrl = import.meta.env.BASE_URL.endsWith("/")
	? import.meta.env.BASE_URL
	: `${import.meta.env.BASE_URL}/`;
const cdn = `${baseUrl}vendor/vditor`;
const languageCache = new Map<VditorLanguage, Record<string, string>>();
const languagePromises = new Map<VditorLanguage, Promise<Record<string, string>>>();
let sharedRuntimePromise: Promise<void> | null = null;

function loadScript(source: string, id: string) {
	const existing = document.getElementById(id) as HTMLScriptElement | null;
	if (existing) return Promise.resolve();

	return new Promise<void>((resolve, reject) => {
		const script = document.createElement("script");
		script.id = id;
		script.src = source;
		script.async = true;
		script.addEventListener("load", () => resolve(), { once: true });
		script.addEventListener(
			"error",
			() => {
				script.remove();
				reject(new Error(`Failed to load ${source}`));
			},
			{ once: true },
		);
		document.head.appendChild(script);
	});
}

function loadSharedRuntime() {
	if (!sharedRuntimePromise) {
		sharedRuntimePromise = Promise.all([
			loadScript(`${cdn}/dist/js/lute/lute.min.js`, "vditorLuteScript"),
			loadScript(`${cdn}/dist/js/icons/ant.js`, "edgechatVditorIconScript"),
		])
			.then(() => undefined)
			.catch((error) => {
				sharedRuntimePromise = null;
				throw error;
			});
	}
	return sharedRuntimePromise;
}

async function loadLanguage(language: VditorLanguage) {
	const cached = languageCache.get(language);
	if (cached) return cached;
	const pending = languagePromises.get(language);
	if (pending) return pending;

	const request = loadScript(
		`${cdn}/dist/js/i18n/${language}.js`,
		`edgechatVditorI18n-${language}`,
	)
		.then(() => {
			const translations = (
				window as typeof window & { VditorI18n?: Record<string, string> }
			).VditorI18n;
			if (!translations) {
				throw new Error(`Vditor ${language} translations were not initialized`);
			}
			languageCache.set(language, translations);
			return translations;
		})
		.catch((error) => {
			languagePromises.delete(language);
			throw error;
		});
	languagePromises.set(language, request);
	return request;
}

export async function loadVditorRuntime(locale: string): Promise<EdgeChatVditorRuntime> {
	// Vditor 暂无繁中语言包，两种中文界面共用中文编辑器，避免繁中用户退回英文工具栏。
	const language: VditorLanguage = locale.startsWith("zh-") ? "zh_CN" : "en_US";
	const [, i18n] = await Promise.all([loadSharedRuntime(), loadLanguage(language)]);
	return { Vditor, cdn, i18n };
}
