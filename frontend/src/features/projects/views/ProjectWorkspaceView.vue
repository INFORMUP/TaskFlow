<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getProject,
  listProjectFlows,
  type AttachedFlow,
  type Project,
} from "@/api/projects.api";
import { getTasks, updateTask, type Task } from "@/api/tasks.api";
import { listOrgMembers, type OrgMember } from "@/api/org-members.api";
import { useCurrentUser } from "@/composables/useCurrentUser";
import TaskListView from "@/features/tasks/views/TaskListView.vue";
import AssigneePicker from "@/features/tasks/components/AssigneePicker.vue";

const route = useRoute();
const router = useRouter();
const { user } = useCurrentUser();

const projectId = computed(() => route.params.id as string);

const project = ref<Project | null>(null);
const flows = ref<AttachedFlow[]>([]);
const tasks = ref<Task[]>([]);
const users = ref<OrgMember[]>([]);
const selectedFlow = ref<string>("");
const loading = ref(false);
const error = ref<string | null>(null);

// Mirrors the write-permission gating used by ProjectListView / ProjectForm.
const canEditSettings = computed(
  () => !!user.value?.teams.some((t) => t.slug === "engineer" || t.slug === "product"),
);

function pickInitialFlow(): string {
  const queryFlow = typeof route.query.flow === "string" ? route.query.flow : "";
  if (queryFlow && flows.value.some((f) => f.slug === queryFlow)) return queryFlow;
  const def = flows.value.find((f) => f.isDefault);
  if (def) return def.slug;
  const projectDefault = project.value?.defaultFlow?.slug;
  if (projectDefault && flows.value.some((f) => f.slug === projectDefault)) {
    return projectDefault;
  }
  return flows.value[0]?.slug ?? "";
}

async function loadTasks() {
  if (!selectedFlow.value) {
    tasks.value = [];
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const collected: Task[] = [];
    let cursor: string | null = null;
    do {
      const params: Record<string, string> = {
        flow: selectedFlow.value,
        projectId: projectId.value,
        limit: "100",
      };
      if (cursor) params.cursor = cursor;
      const res = await getTasks(params);
      collected.push(...res.data);
      cursor = res.pagination.hasMore ? res.pagination.cursor : null;
    } while (cursor);
    tasks.value = collected;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load tasks";
  } finally {
    loading.value = false;
  }
}

function selectFlow(slug: string) {
  if (slug === selectedFlow.value) return;
  selectedFlow.value = slug;
  router.replace({ query: { ...route.query, flow: slug } });
  loadTasks();
}

// Inline assignee picker — same pattern as TaskBoardView, for parity.
interface PickerState {
  taskId: string;
  position: { top: number; left: number };
  selectedId: string | null;
}
const picker = ref<PickerState | null>(null);

function handleAssigneePick(task: Task, anchor: HTMLElement) {
  if (picker.value?.taskId === task.id) {
    closePicker();
    return;
  }
  const rect = anchor.getBoundingClientRect();
  picker.value = {
    taskId: task.id,
    position: { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX },
    selectedId: task.assignee?.id ?? null,
  };
}

function closePicker() {
  picker.value = null;
}

async function handleAssigneeSelect(userId: string | null) {
  if (!picker.value) return;
  const taskId = picker.value.taskId;
  closePicker();
  const idx = tasks.value.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  const original = tasks.value[idx];
  const optimistic = userId ? users.value.find((u) => u.id === userId) ?? null : null;
  tasks.value = tasks.value.map((t, i) => (i === idx ? { ...t, assignee: optimistic } : t));
  try {
    const updated = await updateTask(taskId, { assigneeUserId: userId });
    tasks.value = tasks.value.map((t, i) => (i === idx ? updated : t));
  } catch {
    tasks.value = tasks.value.map((t, i) => (i === idx ? original : t));
  }
}

onMounted(async () => {
  loading.value = true;
  try {
    const [proj, attachedFlows] = await Promise.all([
      getProject(projectId.value),
      listProjectFlows(projectId.value),
    ]);
    project.value = proj;
    flows.value = attachedFlows;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load project";
  }
  selectedFlow.value = pickInitialFlow();
  try {
    users.value = await listOrgMembers();
  } catch {
    users.value = [];
  }
  await loadTasks();
});
</script>

<template>
  <section class="project-workspace">
    <header class="project-workspace__header">
      <h1 data-testid="workspace-title" class="project-workspace__title">
        <span class="project-workspace__key">{{ project?.key }}</span>
        <span class="project-workspace__sep">·</span>
        <span>{{ project?.name }}</span>
      </h1>
      <div class="project-workspace__actions">
        <router-link
          v-if="canEditSettings"
          :to="`/projects/${projectId}/settings`"
          class="project-workspace__gear"
          data-testid="workspace-settings-gear"
          aria-label="Project settings"
          title="Project settings"
        >
          <span aria-hidden="true">⚙</span> Settings
        </router-link>
      </div>
    </header>

    <nav class="project-workspace__tabs" aria-label="Project flows">
      <button
        v-for="f in flows"
        :key="f.slug"
        type="button"
        class="project-workspace__tab"
        :class="{ 'project-workspace__tab--active': f.slug === selectedFlow }"
        :aria-pressed="f.slug === selectedFlow ? 'true' : 'false'"
        :data-testid="`workspace-flow-tab-${f.slug}`"
        @click="selectFlow(f.slug)"
      >
        {{ f.name }}
      </button>
    </nav>

    <p v-if="error" class="project-workspace__error" data-testid="workspace-error">
      {{ error }}
    </p>
    <p v-else-if="loading" class="project-workspace__loading">Loading…</p>
    <p
      v-else-if="tasks.length === 0"
      class="project-workspace__empty"
      data-testid="workspace-empty"
    >
      No tasks in this flow yet.
    </p>
    <TaskListView
      v-else
      :tasks="tasks"
      :flow="selectedFlow"
      @request-assignee-pick="handleAssigneePick"
    />

    <div
      v-if="picker"
      class="project-workspace__picker-layer"
      :style="{ top: `${picker.position.top}px`, left: `${picker.position.left}px` }"
    >
      <AssigneePicker
        :users="users"
        :selected-id="picker.selectedId"
        @select="handleAssigneeSelect"
        @close="closePicker"
      />
    </div>
  </section>
</template>

<style scoped>
.project-workspace {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.project-workspace__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.project-workspace__title {
  font-size: 1.25rem;
  font-weight: 600;
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
}
.project-workspace__key {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--accent);
}
.project-workspace__sep {
  color: var(--text-secondary);
}
.project-workspace__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.project-workspace__gear {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.8125rem;
}
.project-workspace__gear:hover {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
}
.project-workspace__tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-soft);
}
.project-workspace__tab {
  padding: 0.5rem 0.875rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.project-workspace__tab--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.project-workspace__empty,
.project-workspace__loading,
.project-workspace__error {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.project-workspace__error {
  color: var(--priority-critical, #c0392b);
}
.project-workspace__picker-layer {
  position: absolute;
  z-index: 50;
}
</style>
