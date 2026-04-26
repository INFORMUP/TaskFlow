<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getTasks, updateTask, type Task } from "@/api/tasks.api";
import { createTransition } from "@/api/transitions.api";
import { apiFetch } from "@/api/client";
import TaskColumn from "../components/TaskColumn.vue";
import TaskCreateForm from "../components/TaskCreateForm.vue";
import FilterBar from "../components/FilterBar.vue";
import SavedViewsBar from "../components/SavedViewsBar.vue";
import ViewToggle from "../components/ViewToggle.vue";
import AssigneePicker from "../components/AssigneePicker.vue";
import TaskListView from "./TaskListView.vue";
import { useTaskFilters, toApiParams } from "../composables/useTaskFilters";
import { useOnboardingTour } from "@/composables/useOnboardingTour";
import { useCurrentUser } from "@/composables/useCurrentUser";
import { defaultTourSteps } from "@/data/tourSteps";

const tour = useOnboardingTour();
const currentUser = useCurrentUser();

const route = useRoute();
const router = useRouter();
const tasks = ref<Task[]>([]);
const statuses = ref<{ id: string; slug: string; name: string; sortOrder: number }[]>([]);
const loading = ref(false);
const showCreateForm = ref(false);
const flowSlug = ref(route.params.flow as string);

const { filters } = useTaskFilters();

interface FlowStatus {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

interface UserSummary {
  id: string;
  displayName: string;
  actorType: string;
}

const users = ref<UserSummary[]>([]);
const errorBanner = ref<string | null>(null);
let errorTimer: ReturnType<typeof setTimeout> | null = null;

function showError(message: string) {
  errorBanner.value = message;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorBanner.value = null;
  }, 5000);
}

const dragSourceStatusSlug = ref<string | null>(null);

interface PickerState {
  taskId: string;
  position: { top: number; left: number };
  selectedId: string | null;
}
const picker = ref<PickerState | null>(null);

async function loadStatuses() {
  await apiFetch<{ data: any[] }>("/api/v1/teams");
  const FLOW_STATUSES: Record<string, FlowStatus[]> = {
    bug: [
      { id: "1", slug: "triage", name: "Triage", sortOrder: 1 },
      { id: "2", slug: "investigate", name: "Investigate", sortOrder: 2 },
      { id: "3", slug: "approve", name: "Approve", sortOrder: 3 },
      { id: "4", slug: "resolve", name: "Resolve", sortOrder: 4 },
      { id: "5", slug: "validate", name: "Validate", sortOrder: 5 },
      { id: "6", slug: "closed", name: "Closed", sortOrder: 6 },
    ],
    feature: [
      { id: "1", slug: "discuss", name: "Discuss", sortOrder: 1 },
      { id: "2", slug: "design", name: "Design", sortOrder: 2 },
      { id: "3", slug: "prototype", name: "Prototype", sortOrder: 3 },
      { id: "4", slug: "implement", name: "Implement", sortOrder: 4 },
      { id: "5", slug: "validate", name: "Validate", sortOrder: 5 },
      { id: "6", slug: "review", name: "Review", sortOrder: 6 },
      { id: "7", slug: "closed", name: "Closed", sortOrder: 7 },
    ],
    improvement: [
      { id: "1", slug: "propose", name: "Propose", sortOrder: 1 },
      { id: "2", slug: "approve", name: "Approve", sortOrder: 2 },
      { id: "3", slug: "implement", name: "Implement", sortOrder: 3 },
      { id: "4", slug: "validate", name: "Validate", sortOrder: 4 },
      { id: "5", slug: "closed", name: "Closed", sortOrder: 5 },
    ],
  };
  statuses.value = FLOW_STATUSES[flowSlug.value] || [];
}

async function loadTasks() {
  loading.value = true;
  try {
    const baseParams = toApiParams(filters.value, { flow: flowSlug.value });
    const collected: Task[] = [];
    let cursor: string | null = null;
    do {
      const params: Record<string, string> = { ...baseParams, limit: "100" };
      if (cursor) params.cursor = cursor;
      const res = await getTasks(params);
      collected.push(...res.data);
      cursor = res.pagination.hasMore ? res.pagination.cursor : null;
    } while (cursor);
    tasks.value = collected;
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  try {
    users.value = (await apiFetch<{ data: UserSummary[] }>("/api/v1/users")).data;
  } catch {
    users.value = [];
  }
}

function tasksForStatus(statusSlug: string): Task[] {
  return tasks.value.filter((t) => t.currentStatus.slug === statusSlug);
}

function handleTaskClick(task: Task) {
  router.push(`/tasks/${flowSlug.value}/${task.id}`);
}

function handleTaskCreated() {
  showCreateForm.value = false;
  loadTasks();
}

function handleDragStart(task: Task) {
  dragSourceStatusSlug.value = task.currentStatus.slug;
  closePicker();
}

function clearDragState() {
  dragSourceStatusSlug.value = null;
}

async function handleTaskDropped(taskId: string, fromStatus: string, toStatus: string) {
  clearDragState();
  if (fromStatus === toStatus) return;
  const idx = tasks.value.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  const original = tasks.value[idx];
  const targetStatus = statuses.value.find((s) => s.slug === toStatus);
  if (!targetStatus) return;

  tasks.value = tasks.value.map((t, i) =>
    i === idx
      ? {
          ...t,
          currentStatus: { id: targetStatus.id, slug: targetStatus.slug, name: targetStatus.name },
        }
      : t
  );

  try {
    await createTransition(taskId, { toStatus, note: "Moved via board" });
    await loadTasks();
  } catch (err) {
    tasks.value = tasks.value.map((t, i) => (i === idx ? original : t));
    showError(extractErrorMessage(err, "Could not move task"));
  }
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { error?: { message?: string }; message?: string };
    return e.error?.message ?? e.message ?? fallback;
  }
  return fallback;
}

async function handleTitleUpdate(task: Task, title: string) {
  const idx = tasks.value.findIndex((t) => t.id === task.id);
  if (idx === -1) return;
  const original = tasks.value[idx];
  tasks.value = tasks.value.map((t, i) => (i === idx ? { ...t, title } : t));
  try {
    const updated = await updateTask(task.id, { title });
    tasks.value = tasks.value.map((t, i) => (i === idx ? updated : t));
  } catch (err) {
    tasks.value = tasks.value.map((t, i) => (i === idx ? original : t));
    showError(extractErrorMessage(err, "Could not update title"));
  }
}

function handleAssigneePick(task: Task, anchor: HTMLElement) {
  if (picker.value && picker.value.taskId === task.id) {
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
  const optimisticAssignee = userId ? users.value.find((u) => u.id === userId) ?? null : null;
  tasks.value = tasks.value.map((t, i) =>
    i === idx ? { ...t, assignee: optimisticAssignee } : t
  );
  try {
    const updated = await updateTask(taskId, { assigneeUserId: userId });
    tasks.value = tasks.value.map((t, i) => (i === idx ? updated : t));
  } catch (err) {
    tasks.value = tasks.value.map((t, i) => (i === idx ? original : t));
    showError(extractErrorMessage(err, "Could not update assignee"));
  }
}

watch(() => route.params.flow, (newFlow) => {
  flowSlug.value = newFlow as string;
  loadStatuses();
  loadTasks();
});

watch(
  () => [
    filters.value.projectId,
    filters.value.projectOwnerUserId,
    filters.value.status,
    filters.value.priority,
    filters.value.assigneeUserId,
    filters.value.dueAfter,
    filters.value.dueBefore,
    filters.value.q,
  ],
  () => loadTasks(),
);

onMounted(async () => {
  await Promise.all([loadStatuses(), loadTasks(), loadUsers()]);
  if (!tour.hasCompletedTour.value && !currentUser.needsTeamSelection.value) {
    await nextTick();
    tour.startTour(defaultTourSteps);
  }
  window.addEventListener("dragend", clearDragState);
});
</script>

<template>
  <div class="board">
    <div class="board__header">
      <h2>{{ flowSlug.charAt(0).toUpperCase() + flowSlug.slice(1) }} Tasks</h2>
      <div class="board__toolbar">
        <ViewToggle />
        <button type="button" class="board__create-btn" @click="showCreateForm = true">+ New Task</button>
      </div>
    </div>

    <FilterBar :statuses="statuses" />
    <SavedViewsBar />

    <div
      v-if="errorBanner"
      class="board__error"
      role="alert"
      data-testid="board-error-banner"
    >
      {{ errorBanner }}
      <button
        type="button"
        class="board__error-dismiss"
        aria-label="Dismiss error"
        @click="errorBanner = null"
      >
        ×
      </button>
    </div>

    <TaskCreateForm
      v-if="showCreateForm"
      :flow="flowSlug"
      @created="handleTaskCreated"
      @cancel="showCreateForm = false"
    />

    <div v-if="loading" class="board__loading">Loading...</div>
    <TaskListView
      v-else-if="filters.view === 'list'"
      :tasks="tasks"
      :flow="flowSlug"
    />
    <div v-else class="board__columns">
      <TaskColumn
        v-for="status in statuses"
        :key="status.slug"
        :status="status"
        :tasks="tasksForStatus(status.slug)"
        :flow-slug="flowSlug"
        :interactive="true"
        :default-collapsed="status.slug === 'closed'"
        :drag-in-progress="dragSourceStatusSlug !== null"
        :drag-source-status-slug="dragSourceStatusSlug"
        @task-click="handleTaskClick"
        @task-drag-start="handleDragStart"
        @task-dropped="handleTaskDropped"
        @request-title-update="handleTitleUpdate"
        @request-assignee-pick="handleAssigneePick"
      />
    </div>

    <div
      v-if="picker"
      class="board__picker-layer"
      :style="{ top: `${picker.position.top}px`, left: `${picker.position.left}px` }"
    >
      <AssigneePicker
        :users="users"
        :selected-id="picker.selectedId"
        @select="handleAssigneeSelect"
        @close="closePicker"
      />
    </div>
  </div>
</template>

<style scoped>
.board__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.board__header h2 {
  font-size: 1.25rem;
  font-weight: 600;
}

.board__toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.board__create-btn {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-weight: 500;
}

.board__create-btn:hover {
  background: var(--accent-hover);
}

.board__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--priority-high, #fee);
  color: var(--text-primary);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: var(--radius);
  font-size: 0.875rem;
}

.board__error-dismiss {
  background: none;
  border: none;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  color: inherit;
}

.board__columns {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 1rem;
}

.board__loading {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.board__picker-layer {
  position: absolute;
  z-index: 50;
}
</style>
