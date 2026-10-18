export function getClipboardFiles(data) {
	if (!data) return [];
	const files = Array.from(data.files || []);
	if (files.length) return files;
	return Array.from(data.items || [])
		.filter((item) => item.kind === "file")
		.map((item) => item.getAsFile())
		.filter(Boolean);
}
