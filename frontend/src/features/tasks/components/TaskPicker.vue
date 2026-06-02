<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from "vue";
import { getTasks, type Task } from "@/api/tasks.api";

const props = defineProps<{
  excludeId?: string | null;
}>();

const emit = defineEmits<{
  select: [taskId: string];
  close: [];
}>();

const filter = ref("");
const candidates = ref<Task[]>([]);
const rootRef = ref<HTMLDivElement | null>(null);
const filterInputRef = ref<HTMLInputElement | null>(null);

const filteredTasks = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return candidates.value.filter((t) => {
    if (props.excludeId && t.id === props.excludeId) return false;
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.displayId.toLowerCase().includes(q)
    );
  });
});

async function loadCandidates() {
  try {
    const res = await getTasks({ q: "" });
    candidates.value = res.data;
  } catch {
    candidates.value = [];
  }
}

function handleDocumentClick(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    emit("close");
  }
}

function handleKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
  }
}

onMounted(async () => {
  await loadCandidates();
  await nextTick();
  filterInputRef.value?.focus();
  document.addEventListener("mousedown", handleDocumentClick);
  document.addEventListener("keydown", handleKey);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleDocumentClick);
  document.removeEventListener("keydown", handleKey);
});
</script>

<template>
  <div ref="rootRef" class="picker" role="dialog" aria-label="Pick a parent task">
    <input
      ref="filterInputRef"
      v-model="filter"
      class="picker__filter"
      type="text"
      placeholder="Search tasks…"
      aria-label="Filter tasks"
    />
    <ul class="picker__list">
      <li v-if="filteredTasks.length === 0" class="picker__empty">
        No matching tasks
      </li>
      <li v-for="task in filteredTasks" :key="task.id">
        <button
          type="button"
          class="picker__option"
          @click="emit('select', task.id)"
        >
          {{ task.displayId }} — {{ task.title }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker {
  position: absolute;
  z-index: 50;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  width: 280px;
  max-height: 280px;
  display: flex;
  flex-direction: column;
}

.picker__filter {
  margin: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font: inherit;
  background: var(--bg-secondary);
  color: inherit;
}

.picker__list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  overflow-y: auto;
}

.picker__empty {
  padding: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.picker__option {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0.375rem 0.5rem;
  font: inherit;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
}

.picker__option:hover,
.picker__option:focus-visible {
  background: var(--bg-secondary);
  outline: none;
}
</style>
