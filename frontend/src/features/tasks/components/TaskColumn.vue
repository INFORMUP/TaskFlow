<script setup lang="ts">
import { ref } from "vue";
import type { Task } from "@/api/tasks.api";
import TaskCard from "./TaskCard.vue";
import TaskColumnEmptyState from "./TaskColumnEmptyState.vue";

const props = defineProps<{
  status: { slug: string; name: string };
  tasks: Task[];
  flowSlug: string;
  interactive?: boolean;
  defaultCollapsed?: boolean;
  dragInProgress?: boolean;
  dragSourceStatusSlug?: string | null;
}>();

const collapsed = ref(props.defaultCollapsed ?? false);

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
}

const emit = defineEmits<{
  taskClick: [task: Task];
  taskDragStart: [task: Task];
  taskDropped: [taskId: string, fromStatus: string, toStatus: string];
  requestTitleUpdate: [task: Task, title: string];
  requestAssigneePick: [task: Task, anchor: HTMLElement];
}>();

const isDragOver = ref(false);

const isDropTarget = () =>
  Boolean(
    props.interactive &&
      props.dragInProgress &&
      props.dragSourceStatusSlug &&
      props.dragSourceStatusSlug !== props.status.slug
  );

function handleDragOver(e: DragEvent) {
  if (!isDropTarget()) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  isDragOver.value = true;
}

function handleDragLeave() {
  isDragOver.value = false;
}

function handleDrop(e: DragEvent) {
  isDragOver.value = false;
  if (!isDropTarget()) return;
  e.preventDefault();
  const taskId = e.dataTransfer?.getData("text/x-taskflow-task-id");
  const fromStatus = e.dataTransfer?.getData("text/x-taskflow-from-status");
  if (!taskId || !fromStatus) return;
  if (fromStatus === props.status.slug) return;
  emit("taskDropped", taskId, fromStatus, props.status.slug);
}
</script>

<template>
  <div
    class="column"
    :class="{
      'column--candidate': isDropTarget(),
      'column--drag-over': isDragOver,
      'column--collapsed': collapsed,
    }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <button
      type="button"
      class="column__header"
      :aria-expanded="!collapsed"
      :aria-label="`${collapsed ? 'Expand' : 'Collapse'} ${status.name} column`"
      @click="toggleCollapsed"
    >
      <span class="column__chevron" aria-hidden="true">{{ collapsed ? "▸" : "▾" }}</span>
      <span class="column__name">{{ status.name }}</span>
      <span class="column__count">{{ tasks.length }}</span>
    </button>
    <div v-if="!collapsed" class="column__cards">
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :interactive="interactive"
        @click="emit('taskClick', task)"
        @drag-start="(t) => emit('taskDragStart', t)"
        @request-title-update="(t, title) => emit('requestTitleUpdate', t, title)"
        @request-assignee-pick="(t, anchor) => emit('requestAssigneePick', t, anchor)"
      />
      <TaskColumnEmptyState
        v-if="tasks.length === 0"
        :flow-slug="flowSlug"
        :status-slug="status.slug"
      />
    </div>
  </div>
</template>

<style scoped>
.column {
  min-width: 220px;
  flex: 1;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  padding: 0.75rem;
  transition: outline 0.1s, background 0.1s;
}

.column--candidate {
  outline: 1px dashed var(--border-primary);
  outline-offset: -2px;
}

.column--drag-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.column--collapsed {
  min-width: 180px;
  flex: 0 0 auto;
}

.column__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  margin-bottom: 0.75rem;
  padding: 0 0 0.5rem 0;
  border: none;
  border-bottom: 2px solid var(--border-primary);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.column--collapsed .column__header {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.column__chevron {
  font-size: 0.75rem;
  color: var(--text-secondary);
  width: 0.75rem;
  display: inline-block;
}

.column__name {
  flex: 1;
}

.column__name {
  font-weight: 600;
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.column__count {
  background: var(--border-primary);
  border-radius: 10px;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.column__cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
