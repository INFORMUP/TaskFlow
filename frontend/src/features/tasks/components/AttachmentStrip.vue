<template>
  <div class="attachment-strip">
    <div v-if="images.length" class="attachment-strip__thumbs">
      <div
        v-for="img in images"
        :key="img.id"
        class="attachment-strip__thumb-wrap"
      >
        <img
          v-if="blobUrls[img.id]"
          :src="blobUrls[img.id]"
          :alt="img.filename"
          class="attachment-strip__thumb"
        />
        <button
          type="button"
          class="attachment-strip__delete"
          :disabled="busy"
          :aria-label="`Delete ${img.filename}`"
          @click="emit('delete', img.id)"
        >
          ×
        </button>
      </div>
    </div>
    <label class="attachment-strip__upload-label">
      + Image
      <input
        type="file"
        accept="image/*"
        class="attachment-strip__file-input"
        :disabled="busy"
        @change="handleFileChange"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { ImageMeta } from "@/api/attachments.api";
import { getImageBlobUrl } from "@/api/attachments.api";

const props = defineProps<{
  images: ImageMeta[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: "upload", file: File): void;
  (e: "delete", imageId: string): void;
}>();

const blobUrls = ref<Record<string, string>>({});

watch(
  () => props.images,
  async (imgs) => {
    for (const img of imgs) {
      if (!blobUrls.value[img.id]) {
        blobUrls.value[img.id] = await getImageBlobUrl(img.id);
      }
    }
    const currentIds = new Set(imgs.map((i) => i.id));
    for (const id of Object.keys(blobUrls.value)) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(blobUrls.value[id]);
        delete blobUrls.value[id];
      }
    }
  },
  { immediate: true, deep: true }
);

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    emit("upload", file);
    (event.target as HTMLInputElement).value = "";
  }
}
</script>

<style scoped>
.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.attachment-strip__thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachment-strip__thumb-wrap {
  position: relative;
  width: 64px;
  height: 64px;
}

.attachment-strip__thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--color-border, #e5e7eb);
}

.attachment-strip__delete {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-danger, #ef4444);
  color: white;
  border: none;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.attachment-strip__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attachment-strip__upload-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--color-text-secondary, #6b7280);
}

.attachment-strip__upload-label:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.attachment-strip__file-input {
  display: none;
}
</style>
