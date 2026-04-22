<script setup lang="ts">
import { ref, watch } from "vue";
import {
  clearStatusDefault,
  listStatusDefaults,
  setStatusDefault,
  type StatusDefault,
} from "@/api/projects.api";
import { listFlowStatuses, type FlowStatus } from "@/api/flows.api";

const props = defineProps<{
  projectId: string;
  defaultFlowId: string | null;
  users: { id: string; displayName: string }[];
}>();

const statuses = ref<FlowStatus[]>([]);
const defaults = ref<Map<string, string>>(new Map());
const error = ref<string | null>(null);
const busy = ref(false);

async function load() {
  error.value = null;
  if (!props.defaultFlowId) {
    statuses.value = [];
    defaults.value = new Map();
    return;
  }
  try {
    const [fetchedStatuses, fetchedDefaults] = await Promise.all([
      listFlowStatuses(props.defaultFlowId),
      listStatusDefaults(props.projectId),
    ]);
    statuses.value = fetchedStatuses;
    defaults.value = new Map(fetchedDefaults.map((d: StatusDefault) => [d.flowStatusId, d.userId]));
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load status defaults";
  }
}

watch(
  () => [props.projectId, props.defaultFlowId] as const,
  () => { void load(); },
  { immediate: true },
);

async function handleChange(flowStatusId: string, userId: string) {
  error.value = null;
  busy.value = true;
  try {
    if (userId) {
      await setStatusDefault(props.projectId, flowStatusId, userId);
      defaults.value = new Map(defaults.value).set(flowStatusId, userId);
    } else {
      await clearStatusDefault(props.projectId, flowStatusId);
      const next = new Map(defaults.value);
      next.delete(flowStatusId);
      defaults.value = next;
    }
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to update default";
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="status-defaults">
    <h2>Status defaults</h2>
    <p class="status-defaults__hint">
      Pick a default assignee for each status on this project's default flow. When a
      task enters a status with no assignee set, it gets auto-assigned to the chosen user.
    </p>
    <p v-if="error" class="status-defaults__error">{{ error }}</p>

    <p v-if="!defaultFlowId" class="status-defaults__empty">
      Pick a default flow for this project to configure status defaults.
    </p>
    <ul v-else-if="statuses.length" class="status-defaults__list">
      <li
        v-for="status in statuses"
        :key="status.id"
        class="status-defaults__item"
        :data-testid="`status-default-row-${status.slug}`"
      >
        <span class="status-defaults__name">{{ status.name }}</span>
        <span class="status-defaults__slug">{{ status.slug }}</span>
        <select
          :value="defaults.get(status.id) ?? ''"
          :disabled="busy"
          :data-testid="`status-default-select-${status.slug}`"
          @change="handleChange(status.id, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">— no default —</option>
          <option v-for="user in users" :key="user.id" :value="user.id">
            {{ user.displayName }}
          </option>
        </select>
      </li>
    </ul>
    <p v-else class="status-defaults__empty">No statuses on this flow.</p>
  </section>
</template>

<style scoped>
.status-defaults {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
}
.status-defaults h2 {
  font-size: 1rem;
  font-weight: 600;
}
.status-defaults__hint {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.status-defaults__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
}
.status-defaults__list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  list-style: none;
  padding: 0;
  margin: 0;
}
.status-defaults__item {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
}
.status-defaults__name {
  font-weight: 500;
}
.status-defaults__slug {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.status-defaults__item select {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8125rem;
}
.status-defaults__empty {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-style: italic;
}
</style>
