<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { listProjects, type Project } from "@/api/projects.api";
import { listOrgMembers, type OrgMember } from "@/api/org-members.api";
import { useTaskFilters, type TaskFilters } from "../composables/useTaskFilters";
import { useLabels } from "@/features/labels/composables/useLabels";
import LabelChip from "@/features/labels/components/LabelChip.vue";

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

const { labels, ensureLoaded } = useLabels();
const labelMenuOpen = ref(false);

onMounted(async () => {
  const [projectList, memberList] = await Promise.all([
    listProjects(),
    listOrgMembers(),
  ]);
  projects.value = projectList;
  members.value = memberList;
  await ensureLoaded();
});

function toggleLabel(id: string) {
  const current = filters.value.labelIds;
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  update("labelIds", next);
}

function update<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
  setFilters({ [key]: value } as Partial<TaskFilters>);
}
function toggleStatus(slug: string) {
  const current = filters.value.status;
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
  update("status", next);
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

    <div
      class="filter-bar__status-group"
      role="group"
      aria-label="Filter by status"
    >
      <button
        v-for="s in statuses"
        :key="s.slug"
        type="button"
        class="filter-bar__chip"
        :class="{ 'filter-bar__chip--on': filters.status.includes(s.slug) }"
        :aria-pressed="filters.status.includes(s.slug)"
        @click="toggleStatus(s.slug)"
      >
        {{ s.name }}
      </button>
    </div>

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

    <div class="filter-bar__labels">
      <button
        type="button"
        class="filter-bar__labels-toggle"
        :aria-expanded="labelMenuOpen"
        :aria-pressed="filters.labelIds.length > 0"
        :class="{ 'filter-bar__me--on': filters.labelIds.length > 0 }"
        @click="labelMenuOpen = !labelMenuOpen"
      >
        Labels{{ filters.labelIds.length > 0 ? ` (${filters.labelIds.length})` : "" }}
      </button>
      <div v-if="labelMenuOpen" class="filter-bar__labels-menu" role="listbox">
        <ul>
          <li v-for="label in labels" :key="label.id">
            <button
              type="button"
              class="filter-bar__labels-option"
              :aria-pressed="filters.labelIds.includes(label.id)"
              @click="toggleLabel(label.id)"
            >
              <span class="filter-bar__labels-check">
                {{ filters.labelIds.includes(label.id) ? "✓" : "" }}
              </span>
              <LabelChip :name="label.name" :color="label.color" />
            </button>
          </li>
          <li v-if="labels.length === 0" class="filter-bar__labels-empty">No labels.</li>
        </ul>
      </div>
    </div>

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
.filter-bar__status-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.filter-bar__chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}
.filter-bar__chip--on {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.filter-bar__labels {
  position: relative;
}
.filter-bar__labels-toggle {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
}
.filter-bar__labels-menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 10;
  background: var(--bg-primary);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 0.375rem;
  min-width: 14rem;
  max-height: 18rem;
  overflow-y: auto;
  box-shadow: var(--shadow-card);
}
.filter-bar__labels-menu ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.filter-bar__labels-option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  background: none;
  border: none;
  padding: 0.25rem 0.375rem;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 0.8125rem;
  border-radius: 4px;
}
.filter-bar__labels-option:hover,
.filter-bar__labels-option:focus-visible {
  background: var(--bg-secondary, #f3f4f6);
  outline: none;
}
.filter-bar__labels-check {
  width: 0.875rem;
  font-weight: 600;
}
.filter-bar__labels-empty {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  padding: 0.25rem 0.375rem;
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
