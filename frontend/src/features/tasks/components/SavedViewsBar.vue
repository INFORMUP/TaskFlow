<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSavedViews } from "../composables/useSavedViews";
import { useTaskFilters } from "../composables/useTaskFilters";
import type { SavedView } from "@/api/saved-views.api";

const router = useRouter();
const { filters } = useTaskFilters();
const { views, loaded, refresh, create, remove } = useSavedViews();

const showSaveForm = ref(false);
const saveName = ref("");
const saveError = ref<string | null>(null);
const saving = ref(false);

const hasAnyFilter = computed(() => {
  const f = filters.value;
  return Boolean(
    f.projectId ||
      f.projectOwnerUserId ||
      f.status ||
      f.priority ||
      f.assigneeUserId ||
      f.dueAfter ||
      f.dueBefore ||
      f.q,
  );
});

onMounted(() => {
  if (!loaded.value) refresh().catch(() => {/* swallow — empty state shown */});
});

function applyView(view: SavedView) {
  router.replace({ query: { ...view.filters } });
}

async function handleSave() {
  if (!saveName.value.trim()) {
    saveError.value = "Name is required";
    return;
  }
  saving.value = true;
  saveError.value = null;
  try {
    const f = filters.value;
    const filterPayload: Record<string, string> = {};
    if (f.projectId) filterPayload.projectId = f.projectId;
    if (f.projectOwnerUserId) filterPayload.projectOwnerUserId = f.projectOwnerUserId;
    if (f.status) filterPayload.status = f.status;
    if (f.priority) filterPayload.priority = f.priority;
    if (f.assigneeUserId) filterPayload.assigneeUserId = f.assigneeUserId;
    if (f.dueAfter) filterPayload.dueAfter = f.dueAfter;
    if (f.dueBefore) filterPayload.dueBefore = f.dueBefore;
    if (f.q) filterPayload.q = f.q;
    if (f.view) filterPayload.view = f.view;

    await create(saveName.value.trim(), filterPayload);
    saveName.value = "";
    showSaveForm.value = false;
  } catch (err: any) {
    saveError.value = err?.body?.error?.message ?? "Failed to save view";
  } finally {
    saving.value = false;
  }
}

async function handleDelete(view: SavedView) {
  if (!confirm(`Delete saved view "${view.name}"?`)) return;
  await remove(view.id);
}
</script>

<template>
  <div class="saved-views" v-if="views.length > 0 || hasAnyFilter">
    <div class="saved-views__list" v-if="views.length > 0">
      <span class="saved-views__label">Saved:</span>
      <button
        v-for="v in views"
        :key="v.id"
        type="button"
        class="saved-views__chip"
        :title="`Apply view: ${v.name}`"
        @click="applyView(v)"
      >
        {{ v.name }}
        <span
          class="saved-views__chip-delete"
          role="button"
          aria-label="Delete saved view"
          @click.stop="handleDelete(v)"
        >×</span>
      </button>
    </div>

    <div v-if="hasAnyFilter" class="saved-views__save">
      <button
        v-if="!showSaveForm"
        type="button"
        class="saved-views__save-btn"
        @click="showSaveForm = true"
      >+ Save current as view</button>

      <form v-else class="saved-views__form" @submit.prevent="handleSave">
        <input
          v-model="saveName"
          class="saved-views__input"
          type="text"
          placeholder="View name"
          aria-label="Saved view name"
          maxlength="200"
          autofocus
        />
        <button type="submit" class="saved-views__form-save" :disabled="saving">
          {{ saving ? "Saving…" : "Save" }}
        </button>
        <button type="button" class="saved-views__form-cancel" @click="showSaveForm = false; saveError = null">Cancel</button>
        <span v-if="saveError" class="saved-views__error">{{ saveError }}</span>
      </form>
    </div>
  </div>
</template>

<style scoped>
.saved-views {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
}
.saved-views__list {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.saved-views__label {
  color: var(--text-secondary);
}
.saved-views__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
}
.saved-views__chip:hover {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}
.saved-views__chip-delete {
  color: var(--text-secondary);
  font-weight: 700;
  line-height: 1;
}
.saved-views__chip-delete:hover {
  color: var(--accent);
}
.saved-views__save {
  margin-left: auto;
}
.saved-views__save-btn {
  padding: 0.25rem 0.625rem;
  background: transparent;
  border: 1px dashed var(--border-soft);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.saved-views__form {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.saved-views__input {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.8125rem;
}
.saved-views__form-save,
.saved-views__form-cancel {
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  border: 1px solid var(--border-primary);
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
}
.saved-views__form-save {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.saved-views__error {
  color: var(--danger, #c0392b);
  font-size: 0.75rem;
}
</style>
