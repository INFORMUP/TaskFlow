<script setup lang="ts">
import { onMounted, ref } from "vue";
import { listProjects, type Project } from "@/api/projects.api";
import { useTaskFilters, type TaskFilters } from "../composables/useTaskFilters";

defineProps<{
  statuses: { slug: string; name: string }[];
}>();

const { filters, setFilters, resetFilters } = useTaskFilters();

const projects = ref<Project[]>([]);

onMounted(async () => {
  projects.value = await listProjects();
});

function update<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
  setFilters({ [key]: value } as Partial<TaskFilters>);
}

function toggleAssignedToMe() {
  update("assigneeUserId", filters.value.assigneeUserId === "me" ? "" : "me");
}
</script>

<template>
  <div class="filter-bar">
    <select
      :value="filters.projectId"
      @change="update('projectId', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">All projects</option>
      <option v-for="p in projects" :key="p.id" :value="p.id">
        {{ p.key }} · {{ p.name }}
      </option>
    </select>

    <select
      :value="filters.status"
      @change="update('status', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Any status</option>
      <option v-for="s in statuses" :key="s.slug" :value="s.slug">
        {{ s.name }}
      </option>
    </select>

    <select
      :value="filters.priority"
      @change="update('priority', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Any priority</option>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>

    <button
      class="filter-bar__me"
      :class="{ 'filter-bar__me--on': filters.assigneeUserId === 'me' }"
      @click="toggleAssignedToMe"
    >
      Assigned to me
    </button>

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
.filter-bar__me {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
}
.filter-bar__me--on {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
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
