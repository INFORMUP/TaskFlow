<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { listProjects, type Project } from "@/api/projects.api";
import { listOrgMembers, type OrgMember } from "@/api/org-members.api";
import { useTaskFilters, type TaskFilters } from "../composables/useTaskFilters";

defineProps<{
  statuses: { slug: string; name: string }[];
}>();

const { filters, setFilters, resetFilters } = useTaskFilters();

const projects = ref<Project[]>([]);
const members = ref<OrgMember[]>([]);

// Local mirror of `q` so typing is responsive; debounce-flush to the URL.
const qLocal = ref(filters.value.q);
let qTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => filters.value.q,
  (next) => {
    if (next !== qLocal.value) qLocal.value = next;
  },
);
function onQInput(e: Event) {
  qLocal.value = (e.target as HTMLInputElement).value;
  if (qTimer) clearTimeout(qTimer);
  qTimer = setTimeout(() => update("q", qLocal.value), 300);
}
onUnmounted(() => {
  if (qTimer) clearTimeout(qTimer);
});

onMounted(async () => {
  const [projectList, memberList] = await Promise.all([
    listProjects(),
    listOrgMembers(),
  ]);
  projects.value = projectList;
  members.value = memberList;
});

function update<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
  setFilters({ [key]: value } as Partial<TaskFilters>);
}
</script>

<template>
  <div class="filter-bar">
    <input
      type="search"
      class="filter-bar__search"
      :value="qLocal"
      placeholder="Search title or description"
      aria-label="Search tasks"
      @input="onQInput"
    />

    <select
      :value="filters.projectId"
      aria-label="Filter by project"
      @change="update('projectId', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">All projects</option>
      <option v-for="p in projects" :key="p.id" :value="p.id">
        {{ p.key }} · {{ p.name }}
      </option>
    </select>

    <select
      :value="filters.status"
      aria-label="Filter by status"
      @change="update('status', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Any status</option>
      <option v-for="s in statuses" :key="s.slug" :value="s.slug">
        {{ s.name }}
      </option>
    </select>

    <select
      :value="filters.priority"
      aria-label="Filter by priority"
      @change="update('priority', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Any priority</option>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>

    <select
      :value="filters.assigneeUserId"
      aria-label="Filter by assignee"
      @change="update('assigneeUserId', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Anyone</option>
      <option value="me">Me</option>
      <option v-for="m in members" :key="m.id" :value="m.id">
        {{ m.displayName }}
      </option>
    </select>

    <label class="filter-bar__date">
      Due after
      <input
        type="date"
        :value="filters.dueAfter"
        @change="update('dueAfter', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="filter-bar__date">
      Due before
      <input
        type="date"
        :value="filters.dueBefore"
        @change="update('dueBefore', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <button class="filter-bar__clear" @click="resetFilters">Clear</button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
}
.filter-bar__search {
  flex: 1;
  min-width: 12rem;
  max-width: 22rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.8125rem;
  background: var(--bg-primary);
}
.filter-bar select,
.filter-bar input[type="date"] {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.8125rem;
  background: var(--bg-primary);
}
.filter-bar__date {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--text-secondary);
}
.filter-bar__clear {
  margin-left: auto;
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
