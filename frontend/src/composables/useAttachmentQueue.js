import { computed, onScopeDispose, ref } from "vue";

export function useAttachmentQueue(uploadFile) {
	const pendingAttachments = ref([]);
	const attachmentsReady = computed(() =>
		pendingAttachments.value.every((entry) => entry.status === "ready"),
	);
	let nextId = 0;

	function clearAttachment(id) {
		const entry = pendingAttachments.value.find((item) => item.id === id);
		if (!entry) return;
		if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
		pendingAttachments.value = pendingAttachments.value.filter((item) => item.id !== id);
	}

	function clearAttachments() {
		for (const entry of pendingAttachments.value) {
			if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
		}
		pendingAttachments.value = [];
	}

	async function uploadEntry(entry) {
		entry.status = "uploading";
		entry.error = "";
		try {
			const payload = await uploadFile(entry.file);
			entry.attachment = payload.file;
			entry.status = "ready";
		} catch (error) {
			entry.error = error.message;
			entry.status = "failed";
		}
	}

	async function uploadAttachment(files) {
		if (Array.isArray(files) && !files.length) return;
		const entries = Array.from(Array.isArray(files) ? files : [files], (file) => ({
			id: ++nextId,
			file,
			previewUrl: URL.createObjectURL(file),
			attachment: null,
			status: "uploading",
			error: "",
		}));
		pendingAttachments.value.push(...entries);
		// Read the reactive entries so upload progress reaches the composer.
		await Promise.all(pendingAttachments.value.slice(-entries.length).map(uploadEntry));
	}

	async function retryAttachment(id) {
		const entry = pendingAttachments.value.find((item) => item.id === id);
		if (entry?.status === "failed") await uploadEntry(entry);
	}

	function addReadyAttachment(attachment) {
		pendingAttachments.value.push({
			id: ++nextId,
			attachment,
			status: "ready",
			previewUrl: "",
			error: "",
		});
	}

	onScopeDispose(clearAttachments, true);
	return {
		pendingAttachments,
		attachmentsReady,
		uploadAttachment,
		retryAttachment,
		clearAttachment,
		clearAttachments,
		addReadyAttachment,
	};
}
