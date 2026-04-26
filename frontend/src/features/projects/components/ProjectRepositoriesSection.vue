<script setup lang="ts">
import { ref, watch } from "vue";
import {
  addProjectRepository,
  listProjectRepositories,
  removeProjectRepository,
  type ProjectRepository,
  type RepoProvider,
} from "@/api/projects.api";

const props = defineProps<{ projectId: string }>();

const repos = ref<ProjectRepository[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

const newProvider = ref<RepoProvider>("GITHUB");
const newOwner = ref("");
const newName = ref("");

async function load() {
  error.value = null;
  try {
    repos.value = await listProjectRepositories(props.projectId);
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load repositories";
  }
}

watch(() => props.projectId, load, { immediate: true });

async function handleAdd() {
  const owner = newOwner.value.trim();
  const name = newName.value.trim();
  if (!owner || !name) return;
  busy.value = true;
  error.value = null;
  try {
    const created = await addProjectRepository(props.projectId, {
      provider: newProvider.value,
      owner,
      name,
    });
    repos.value = [...repos.value, created];
    newOwner.value = "";
    newName.value = "";
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to add repository";
  } finally {
    busy.value = false;
  }
}

async function handleRemove(id: string) {
  busy.value = true;
  error.value = null;
  try {
    await removeProjectRepository(props.projectId, id);
    repos.value = repos.value.filter((r) => r.id !== id);
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to remove repository";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="repos">
    <h2>Repositories</h2>
    <p class="repos__hint">Associate source repositories with this project.</p>
    <p v-if="error" class="repos__error">{{ error }}</p>

    <ul v-if="repos.length" class="repos__list">
      <li
        v-for="r in repos"
        :key="r.id"
        :data-testid="`repo-row-${r.id}`"
        class="repos__item"
      >
        <span class="repos__provider">{{ r.provider }}</span>
        <span class="repos__name">{{ r.owner }}/{{ r.name }}</span>
        <button
          type="button"
          class="repos__remove"
          :data-testid="`repo-remove-${r.id}`"
          :disabled="busy"
          @click="handleRemove(r.id)"
        >
          Remove
        </button>
      </li>
    </ul>
    <p v-else class="repos__empty">No repositories attached yet.</p>

    <div class="repos__add">
      <select v-model="newProvider" :disabled="busy">
        <option value="GITHUB">GitHub</option>
      </select>
      <input
        v-model="newOwner"
        type="text"
        placeholder="owner"
        data-testid="repo-owner-input"
        :disabled="busy"
      />
      <span class="repos__sep">/</span>
      <input
        v-model="newName"
        type="text"
        placeholder="repo"
        data-testid="repo-name-input"
        :disabled="busy"
      />
      <button
        type="button"
        data-testid="repo-add-button"
        :disabled="busy || !newOwner.trim() || !newName.trim()"
        @click="handleAdd"
      >
        Add
      </button>
    </div>
  </section>
</template>

<style scoped>
.repos {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
}
.repos h2 {
  font-size: 1rem;
  font-weight: 600;
}
.repos__hint {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.repos__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
}
.repos__list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  list-style: none;
  padding: 0;
  margin: 0;
}
.repos__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
}
.repos__provider {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.repos__name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.repos__remove,
.repos__add button {
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  cursor: pointer;
}
.repos__empty {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-style: italic;
}
.repos__add {
  display: flex;
  gap: 0.375rem;
  align-items: center;
}
.repos__add select,
.repos__add input {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.875rem;
}
.repos__add input {
  min-width: 0;
  flex: 1;
}
.repos__sep {
  color: var(--text-secondary);
}
</style>
