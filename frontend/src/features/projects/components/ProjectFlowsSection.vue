<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  attachProjectFlow,
  detachProjectFlow,
  listProjectFlows,
  updateProject,
  type AttachedFlow,
} from "@/api/projects.api";

const props = defineProps<{
  projectId: string;
  allFlows: { id: string; slug: string; name: string }[];
}>();

const emit = defineEmits<{ changed: [] }>();

const attached = ref<AttachedFlow[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

async function load() {
  error.value = null;
  try {
    attached.value = await listProjectFlows(props.projectId);
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load flows";
  }
}

watch(() => props.projectId, load, { immediate: true });

const unattached = computed(() =>
  props.allFlows.filter((f) => !attached.value.some((a) => a.id === f.id)),
);

async function handleAttach(flowId: string) {
  if (!flowId) return;
  error.value = null;
  busy.value = true;
  try {
    attached.value = await attachProjectFlow(props.projectId, flowId);
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to attach flow";
  } finally {
    busy.value = false;
  }
}

async function handleDetach(flowId: string) {
  error.value = null;
  busy.value = true;
  try {
    attached.value = await detachProjectFlow(props.projectId, flowId);
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to detach flow";
  } finally {
    busy.value = false;
  }
}

async function setDefault(flowId: string) {
  error.value = null;
  busy.value = true;
  try {
    await updateProject(props.projectId, { defaultFlowId: flowId });
    await load();
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to set default";
  } finally {
    busy.value = false;
  }
}

const selectedToAttach = ref("");
</script>

<template>
  <section class="flows">
    <h2>Flows</h2>
    <p class="flows__hint">
      Flows attached here are selectable when creating tasks on this project.
    </p>
    <p v-if="error" class="flows__error">{{ error }}</p>

    <ul v-if="attached.length" class="flows__list">
      <li v-for="f in attached" :key="f.id" class="flows__item">
        <label class="flows__default">
          <input
            type="radio"
            name="default-flow"
            :checked="f.isDefault"
            :disabled="busy"
            @change="setDefault(f.id)"
          />
          <span>default</span>
        </label>
        <span class="flows__name">{{ f.name }}</span>
        <span class="flows__slug">{{ f.slug }}</span>
        <button
          type="button"
          class="flows__detach"
          :disabled="busy"
          @click="handleDetach(f.id)"
        >
          Detach
        </button>
      </li>
    </ul>
    <p v-else class="flows__empty">No flows attached yet.</p>

    <div v-if="unattached.length" class="flows__attach">
      <select v-model="selectedToAttach" :disabled="busy">
        <option value="">— attach flow —</option>
        <option v-for="f in unattached" :key="f.id" :value="f.id">
          {{ f.name }} ({{ f.slug }})
        </option>
      </select>
      <button
        type="button"
        :disabled="busy || !selectedToAttach"
        @click="handleAttach(selectedToAttach); selectedToAttach = ''"
      >
        Attach
      </button>
    </div>
  </section>
</template>

<style scoped>
.flows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
}
.flows h2 {
  font-size: 1rem;
  font-weight: 600;
}
.flows__hint {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.flows__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
}
.flows__list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  list-style: none;
  padding: 0;
  margin: 0;
}
.flows__item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
}
.flows__default {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.flows__name {
  font-weight: 500;
}
.flows__slug {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.flows__detach,
.flows__attach button {
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  cursor: pointer;
}
.flows__attach {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.flows__attach select {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.875rem;
}
.flows__empty {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-style: italic;
}
</style>
