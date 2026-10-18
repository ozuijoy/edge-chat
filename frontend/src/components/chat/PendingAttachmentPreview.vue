<script setup>
import { File, FileText, LoaderCircle, Mic, RotateCcw, X } from '@lucide/vue';
import { computed, ref } from 'vue';
import api from '../../api.js';
import { isPdfAttachment, isPreviewableImageAttachment, isVideoAttachment } from './attachment-utils.js';
import { t } from '../../i18n.js';
import { formatVoiceDuration, isAudioAttachment } from '../../voice-message.js';

const props = defineProps({
  entry: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['clear', 'retry']);
const mediaFailed = ref(false);
const attachment = computed(() => props.entry.attachment || props.entry.file);
const isImage = computed(() => isPreviewableImageAttachment(attachment.value));
const isVideo = computed(() => isVideoAttachment(attachment.value));
const isAudio = computed(() => isAudioAttachment(attachment.value));
const isPdf = computed(() => isPdfAttachment(attachment.value));
const displayName = computed(() => attachment.value?.name || t('attachments.fallback'));
const attachmentUrl = computed(() => props.entry.previewUrl || api.getFileUrl(attachment.value?.key || attachment.value?.url));
const isVoice = computed(() => attachment.value?.kind === 'voice');
</script>

<template>
  <div class="pending-attachment" :class="{ 'pending-attachment--image': isImage }" :aria-busy="entry.status === 'uploading'">
	    <img
		      v-if="isImage && !isVoice && !mediaFailed"
      class="pending-attachment__thumb"
      :src="attachmentUrl"
      :alt="displayName"
      loading="lazy"
	      @error="mediaFailed = true"
	    />
	    <span v-else-if="isVoice" class="pending-attachment__voice">
	      <Mic :size="18" aria-hidden="true" />
	      {{ formatVoiceDuration(attachment.durationMs) }}
	    </span>
    <video
      v-else-if="isVideo && !mediaFailed"
      class="pending-attachment__video"
      :src="attachmentUrl"
      preload="metadata"
      muted
      playsinline
      controls
      :aria-label="displayName"
      @error="mediaFailed = true"
    ></video>
    <!-- biome-ignore lint/a11y/useMediaCaption: Uploaded files do not include caption tracks. -->
    <audio
      v-else-if="isAudio"
      class="pending-attachment__audio"
      :src="attachmentUrl"
      preload="metadata"
      controls
      :aria-label="displayName"
    ></audio>
    <FileText v-else-if="isPdf" :size="24" class="pending-attachment__icon" aria-hidden="true" />
    <File v-else :size="24" class="pending-attachment__icon" aria-hidden="true" />
    <div class="pending-attachment__details">
      <span class="pending-attachment__name" :title="displayName">{{ displayName }}</span>
      <span v-if="entry.status === 'uploading'" class="pending-attachment__status" role="status">
        <LoaderCircle :size="14" class="pending-attachment__spinner" aria-hidden="true" />{{ t('common.uploading') }}
      </span>
      <span v-else-if="entry.error" class="pending-attachment__error" role="alert">{{ entry.error }}</span>
    </div>
    <button v-if="entry.status === 'failed'" type="button" class="pending-attachment__clear" :title="t('common.retry')" :aria-label="t('common.retry')" @click="emit('retry')">
      <RotateCcw :size="18" aria-hidden="true" />
    </button>
    <button type="button" class="pending-attachment__clear" :title="t('common.remove')" :aria-label="t('common.remove')" @click="emit('clear')">
      <X :size="18" aria-hidden="true" />
    </button>
  </div>
</template>
