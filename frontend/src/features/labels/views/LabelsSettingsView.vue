<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  createLabel as createLabelApi,
  deleteLabel as deleteLabelApi,
  updateLabel as updateLabelApi,
} from "@/api/labels.api";
import { useLabels } from "../composables/useLabels";
import LabelChip from "../components/LabelChip.vue";

const { labels, refresh } = useLabels();

const newName = ref("");
const newColor = ref("#3366ff");
const error = ref("");
const editingId = ref<string | null>(null);
const editName = ref("");
const editColor = ref("#000000");

onMounted(async () => {
  await refresh();
});

async function create() {
  error.value = "";
  if (!newName.value.trim()) {
    error.value = "Name is required";
    return;
  }
  try {
    await createLabelApi(newName.value.trim(), newColor.value);
    newName.value = "";
    newColor.value = "#3366ff";
    await refresh();
  } catch (e: any) {
    error.value = e?.error?.message || "Could not create label";
  }
}

function startEdit(id: string, name: string, color: string) {
  editingId.value = id;
  editName.value = name;
  editColor.value = color;
  error.value = "";
}

async function commitEdit() {
  if (!editingId.value) return;
  try {
    await updateLabelApi(editingId.value, { name: editName.value.trim(), color: editColor.value });
    editingId.value = null;
    await refresh();
  } catch (e: any) {
    error.value = e?.error?.message || "Could not update label";
  }
}

function cancelEdit() {
  editingId.value = null;
}

async function remove(id: string, name: string) {
  if (!confirm(`Delete label "${name}"? This will detach it from all tasks.`)) return;
  try {
    await deleteLabelApi(id);
    await refresh();
  } catch (e: any) {
    error.value = e?.error?.message || "Could not delete label";
  }
}
</script>

<template>
  <div class="labels-settings">
    <h1>Labels</h1>
    <p class="labels-settings__hint">
      Org-wide labels. Use them to tag tasks and filter the board.
    </p>

    <div v-if="error" class="labels-settings__error" role="alert">{{ error }}</div>

    <form class="labels-settings__create" @submit.prevent="create">
      <input
        v-model="newName"
        type="text"
        aria-label="New label name"
        placeholder="Label name"
      />
      <input
        v-model="newColor"
        type="color"
        aria-label="New label color"
      />
      <button type="submit">Add</button>
    </form>

    <ul class="labels-settings__list">
      <li v-for="label in labels" :key="label.id" class="labels-settings__row">
        <template v-if="editingId === label.id">
          <input v-model="editName" type="text" aria-label="Edit name" />
          <input v-model="editColor" type="color" aria-label="Edit color" />
          <button type="button" @click="commitEdit">Save</button>
          <button type="button" @click="cancelEdit">Cancel</button>
        </template>
        <template v-else>
          <LabelChip :name="label.name" :color="label.color" />
          <span class="labels-settings__color-code">{{ label.color }}</span>
          <button
            type="button"
            class="labels-settings__edit"
            @click="startEdit(label.id, label.name, label.color)"
          >
            Edit
          </button>
          <button
            type="button"
            class="labels-settings__delete"
            @click="remove(label.id, label.name)"
          >
            Delete
          </button>
        </template>
      </li>
      <li v-if="labels.length === 0" class="labels-settings__empty">
        No labels yet. Create one above.
      </li>
    </ul>
  </div>
</template>

<style scoped>
.labels-settings {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1.5rem;
}
.labels-settings__hint {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}
.labels-settings__error {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
.labels-settings__create {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.labels-settings__create input[type="text"] {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.875rem;
}
.labels-settings__create input[type="color"] {
  width: 2.5rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
}
.labels-settings__create button,
.labels-settings__row button {
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
}
.labels-settings__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.labels-settings__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  background: var(--bg-primary);
}
.labels-settings__color-code {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.labels-settings__edit {
  margin-left: auto;
}
.labels-settings__delete {
  color: #b91c1c;
}
.labels-settings__empty {
  color: var(--text-secondary);
  font-size: 0.875rem;
  padding: 1rem;
  text-align: center;
}
</style>
