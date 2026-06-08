<template>
  <div class="file-strip">
    <div v-if="files.length" class="file-strip__list">
      <div v-for="f in files" :key="f.id" class="file-strip__row">
        <span class="file-strip__name">{{ f.filename }}</span>
        <span class="file-strip__size">{{ formatSize(f.size) }}</span>
        <button
          type="button"
          class="file-strip__download"
          :disabled="busy"
          :aria-label="`Download ${f.filename}`"
          @click="handleDownload(f)"
        >
          ↓
        </button>
        <button
          type="button"
          class="file-strip__delete"
          :disabled="busy"
          :aria-label="`Delete ${f.filename}`"
          @click="emit('delete', f.id)"
        >
          ×
        </button>
      </div>
    </div>
    <label class="file-strip__upload-label">
      + File
      <input
        type="file"
        class="file-strip__file-input"
        :disabled="busy"
        @change="handleFileChange"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import type { FileMeta } from "@/api/files.api";
import { downloadTaskFile } from "@/api/files.api";

const props = defineProps<{
  taskId: string;
  files: FileMeta[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: "upload", file: File): void;
  (e: "delete", fileId: string): void;
}>();

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleDownload(f: FileMeta) {
  await downloadTaskFile(f.id, f.filename);
}

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    emit("upload", file);
    (event.target as HTMLInputElement).value = "";
  }
}
</script>

<style scoped>
.file-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-strip__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-strip__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: var(--color-surface-raised, #f5f5f5);
  border-radius: 4px;
  font-size: 0.85rem;
}

.file-strip__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-strip__size {
  color: var(--color-text-muted, #888);
  font-size: 0.8rem;
  white-space: nowrap;
}

.file-strip__download,
.file-strip__delete {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  color: var(--color-text-muted, #888);
  font-size: 1rem;
  line-height: 1;
}

.file-strip__download:hover,
.file-strip__delete:hover {
  color: var(--color-text, #333);
}

.file-strip__download:disabled,
.file-strip__delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.file-strip__upload-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-primary, #4a90d9);
  padding: 4px 2px;
}

.file-strip__file-input {
  display: none;
}
</style>
