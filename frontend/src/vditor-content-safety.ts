type VditorLute = {
	Md2VditorDOM(markdown: string): string;
	SpinVditorDOM(html: string): string;
};

function escapeImageLabel(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
}

function escapeImageDestination(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll(")", "\\)");
}

function imageMarkdown(image: HTMLImageElement) {
	const label = escapeImageLabel(image.alt || "圖片");
	const source = image.getAttribute("src") || image.getAttribute("data-src") || "";
	return source ? `![${label}](${escapeImageDestination(source)})` : label;
}

function replaceHtmlBlocksWithCode(root: DocumentFragment) {
	for (const htmlBlock of root.querySelectorAll<HTMLElement>(
		'.vditor-wysiwyg__block[data-type="html-block"]',
	)) {
		const isLastBlock = !htmlBlock.nextElementSibling;
		const source =
			htmlBlock.querySelector("pre:not(.vditor-wysiwyg__preview) code")?.textContent || "";
		const codeBlock = document.createElement("div");
		codeBlock.className = "vditor-wysiwyg__block";
		codeBlock.dataset.type = "code-block";
		codeBlock.dataset.block = htmlBlock.dataset.block || "0";
		codeBlock.dataset.marker = "```";

		const pre = document.createElement("pre");
		pre.className = "vditor-wysiwyg__pre";
		const code = document.createElement("code");
		code.className = "language-html";
		code.textContent = source.endsWith("\n") ? source : `${source}\n`;
		pre.appendChild(code);
		codeBlock.appendChild(pre);
		htmlBlock.replaceWith(codeBlock);
		if (isLastBlock) {
			// 末尾空段讓光標離開整體代碼塊，避免用戶繼續輸入時把後續正文併入 HTML 源碼。
			const trailingParagraph = document.createElement("p");
			trailingParagraph.dataset.block = "0";
			trailingParagraph.appendChild(document.createElement("br"));
			codeBlock.after(trailingParagraph);
		}
	}
}

function removeRemoteContentBeforeMount(html: string) {
	const template = document.createElement("template");
	template.innerHTML = html;
	replaceHtmlBlocksWithCode(template.content);

	// 未開放的動態預覽只顯示源碼，避免其後續渲染器加載第三方腳本或媒體。
	for (const preview of template.content.querySelectorAll(".vditor-wysiwyg__preview")) {
		const source = preview.parentElement?.querySelector("pre:not(.vditor-wysiwyg__preview) code");
		preview.replaceChildren(document.createTextNode(source?.textContent || ""));
	}
	for (const image of template.content.querySelectorAll("img")) {
		image.replaceWith(document.createTextNode(imageMarkdown(image)));
	}
	for (const element of template.content.querySelectorAll(
		"iframe, object, embed, video, audio, source, track, script, link, meta",
	)) {
		element.remove();
	}

	return template.innerHTML;
}

export function installVditorContentSafety(lute: VditorLute) {
	const renderMarkdown = lute.Md2VditorDOM.bind(lute);
	const normalizeEditorDom = lute.SpinVditorDOM.bind(lute);
	// Vditor 沒有覆蓋 WYSIWYG 全部寫入路徑的圖片禁用開關，因此在其統一轉換出口前淨化。
	lute.Md2VditorDOM = (markdown) => removeRemoteContentBeforeMount(renderMarkdown(markdown));
	lute.SpinVditorDOM = (html) => removeRemoteContentBeforeMount(normalizeEditorDom(html));
}
