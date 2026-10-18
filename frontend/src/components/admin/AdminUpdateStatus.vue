<script setup>
import { computed, onMounted, ref } from "vue";
import { checkForUpdates, getBuildInfo } from "../../update-check.js";
import { formatDateTime, t } from "../../i18n.js";
import UiButton from "../ui/Button.vue";
import UiSurface from "../ui/Surface.vue";

const build = getBuildInfo();
const checking = ref(false);
const result = ref(null);
const error = ref("");

const shortCommit = computed(() => build.commit.slice(0, 7) || t('updates.unknown'));
const statusTone = computed(() => {
	if (error.value) {
		return "error";
	}
	if (checking.value || !result.value) {
		return "neutral";
	}
	return result.value.updateAvailable ? "warning" : "success";
});
const statusTitle = computed(() => {
	if (checking.value) {
			return t('updates.checkingTitle');
	}
	if (error.value) {
			return t('updates.unavailableTitle');
	}
	if (!result.value) {
			return t('updates.waitingTitle');
	}
	if (result.value.state === "local-ahead") {
			return t('updates.localAheadTitle');
	}
		return result.value.updateAvailable ? t('updates.availableTitle') : t('updates.currentTitle');
});
const statusDetail = computed(() => {
	if (checking.value) {
			return t('updates.comparing', {
				repository: build.repository || t('updates.repositoryFallback'),
				branch: build.branch || t('updates.branchFallback'),
			});
	}
	if (error.value) {
		return error.value;
	}
	if (!result.value) {
		return "";
	}
	if (result.value.state === "local-ahead") {
			return t('updates.localAheadDetail', { count: result.value.localCommitCount });
	}
	if (result.value.state === "diverged") {
			return t('updates.divergedDetail', { count: result.value.remoteCommitCount });
	}
	if (result.value.updateAvailable) {
			return t('updates.availableDetail', { count: result.value.remoteCommitCount });
	}
		return t('updates.currentDetail', { branch: build.branch });
});

function formatDate(value) {
	const date = new Date(value);
		return Number.isNaN(date.getTime()) ? "" : formatDateTime(date);
}

async function checkUpdates() {
	checking.value = true;
	error.value = "";
	try {
		result.value = await checkForUpdates({ build });
	} catch (currentError) {
		result.value = null;
			error.value = currentError instanceof Error ? currentError.message : t('updates.checkFailed');
	} finally {
		checking.value = false;
	}
}

onMounted(checkUpdates);
</script>

<template>
	<UiSurface class="panel admin-update-panel">
		<div class="admin-update-panel__header">
			<div>
					<h3 class="panel-title">{{ t('updates.title') }}</h3>
				<p class="admin-update-panel__repository">
					<a
						v-if="build.repository"
						:href="`https://github.com/${build.repository}`"
						target="_blank"
						rel="noreferrer"
					>
						{{ build.repository }}
					</a>
						<span v-else>{{ t('updates.unknownRepository') }}</span>
				</p>
			</div>
			<UiButton variant="secondary" size="sm" :disabled="checking" @click="checkUpdates">
					{{ checking ? t('updates.checking') : t('updates.check') }}
			</UiButton>
		</div>

		<div
			class="admin-update-panel__status"
			:class="`admin-update-panel__status--${statusTone}`"
			role="status"
			aria-live="polite"
		>
			<span class="admin-update-panel__indicator" aria-hidden="true"></span>
			<div>
				<strong>{{ statusTitle }}</strong>
				<span>{{ statusDetail }}</span>
			</div>
		</div>

		<div class="admin-update-panel__meta">
			<div>
					<span>{{ t('updates.currentCommit') }}</span>
				<code>{{ shortCommit }}</code>
			</div>
			<div>
					<span>{{ t('updates.trackedBranch') }}</span>
					<strong>{{ build.branch || t('updates.unknown') }}</strong>
			</div>
		</div>

		<div v-if="result?.latestCommit" class="admin-update-panel__latest">
			<div>
					<span>{{ t('updates.latestCommit') }}</span>
				<strong>{{ result.latestCommit.message || result.latestCommit.sha.slice(0, 7) }}</strong>
				<small v-if="result.latestCommit.committedAt">
					{{ formatDate(result.latestCommit.committedAt) }}
				</small>
			</div>
				<a :href="result.compareUrl" target="_blank" rel="noreferrer">{{ t('updates.viewChanges') }}</a>
		</div>
	</UiSurface>
</template>

<style scoped src="../../styles/admin/update-status.css"></style>
