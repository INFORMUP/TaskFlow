<script setup lang="ts">
import { ref, nextTick } from "vue";
import type { Task } from "@/api/tasks.api";
import ActorLabel from "@/components/ActorLabel.vue";
import LabelChip from "@/features/labels/components/LabelChip.vue";

const MAX_VISIBLE_LABELS = 3;

const props = withDefaults(
  defineProps<{
    task: Task;
    interactive?: boolean;
  }>(),
  { interactive: false }
);

const emit = defineEmits<{
  click: [];
  "drag-start": [task: Task];
  "request-title-update": [task: Task, title: string];
  "request-assignee-pick": [task: Task, anchor: HTMLElement];
}>();

const priorityColors: Record<string, string> = {
  critical: "var(--priority-critical)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

const editingTitle = ref(false);
const titleDraft = ref("");
const titleInputRef = ref<HTMLInputElement | null>(null);

async function startTitleEdit() {
  if (!props.interactive) return;
  titleDraft.value = props.task.title;
  editingTitle.value = true;
  await nextTick();
  titleInputRef.value?.focus();
  titleInputRef.value?.select();
}

function commitTitle() {
  if (!editingTitle.value) return;
  const trimmed = titleDraft.value.trim();
  if (!trimmed) return;
  if (trimmed === props.task.title) {
    editingTitle.value = false;
    return;
  }
  editingTitle.value = false;
  emit("request-title-update", props.task, trimmed);
}

function cancelTitle() {
  editingTitle.value = false;
}

function handleClick(e: MouseEvent) {
  if (editingTitle.value) {
    e.stopPropagation();
    return;
  }
  emit("click");
}

function handleKey(e: KeyboardEvent) {
  if (editingTitle.value) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emit("click");
  }
}

function handleDragStart(e: DragEvent) {
  if (!props.interactive) return;
  if (editingTitle.value) {
    e.preventDefault();
    return;
  }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-taskflow-task-id", props.task.id);
    e.dataTransfer.setData("text/x-taskflow-from-status", props.task.currentStatus.slug);
  }
  emit("drag-start", props.task);
}

function handleAssigneeClick(e: MouseEvent) {
  if (!props.interactive) return;
  e.stopPropagation();
  emit("request-assignee-pick", props.task, e.currentTarget as HTMLElement);
}
</script>

<template>
  <div
    class="card"
    :class="{ 'card--interactive': interactive }"
    role="button"
    tabindex="0"
    :draggable="interactive && !editingTitle"
    :aria-label="`${task.displayId} — ${task.title}, priority ${task.priority}`"
    @click="handleClick"
    @keydown="handleKey"
    @dragstart="handleDragStart"
  >
    <span class="card__header">
      <span class="card__id">{{ task.displayId }}</span>
      <span
        v-if="(task.openBlockerCount ?? 0) > 0"
        class="card__blocked-badge"
        :title="`${task.openBlockerCount} open blocker${task.openBlockerCount === 1 ? '' : 's'}`"
        :aria-label="`${task.openBlockerCount} open blocker${task.openBlockerCount === 1 ? '' : 's'}`"
        data-testid="blocked-badge"
      >
        Blocked
      </span>
      <span
        class="card__priority"
        :style="{ color: priorityColors[task.priority] }"
      >
        {{ task.priority }}
      </span>
    </span>
    <input
      v-if="editingTitle"
      ref="titleInputRef"
      v-model="titleDraft"
      class="card__title-input"
      type="text"
      aria-label="Edit task title"
      @click.stop
      @keydown.enter.prevent="commitTitle"
      @keydown.escape.prevent="cancelTitle"
      @blur="commitTitle"
    />
    <span
      v-else
      class="card__title"
      :class="{ 'card__title--interactive': interactive }"
      @dblclick.stop="startTitleEdit"
    >
      {{ task.title }}
    </span>
    <span v-if="task.projects && task.projects.length > 0" class="card__projects">
      <span
        v-for="p in task.projects"
        :key="p.id"
        class="card__project-chip"
        data-testid="project-chip"
        :title="p.name"
      >
        {{ p.key }}
      </span>
    </span>
    <span v-if="task.labels && task.labels.length > 0" class="card__labels">
      <LabelChip
        v-for="label in task.labels.slice(0, MAX_VISIBLE_LABELS)"
        :key="label.id"
        :name="label.name"
        :color="label.color"
      />
      <span
        v-if="task.labels.length > MAX_VISIBLE_LABELS"
        class="card__labels-overflow"
        :title="task.labels.slice(MAX_VISIBLE_LABELS).map((l) => l.name).join(', ')"
      >
        +{{ task.labels.length - MAX_VISIBLE_LABELS }}
      </span>
    </span>
    <span class="card__footer">
      <button
        v-if="interactive"
        type="button"
        class="card__assignee-btn"
        :aria-label="task.assignee ? `Reassign — currently ${task.assignee.displayName}` : 'Assign'"
        @click="handleAssigneeClick"
      >
        <ActorLabel v-if="task.assignee" :actor="task.assignee" />
        <span v-else class="card__assignee-empty">Unassigned</span>
      </button>
      <span v-else-if="task.assignee" class="card__assignee">
        <ActorLabel :actor="task.assignee" />
      </span>
    </span>
  </div>
</template>

<style scoped>
.card {
  display: block;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--bg-primary);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  padding: 0.75rem;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: box-shadow 0.15s;
}

.card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.card--interactive[draggable="true"] {
  cursor: grab;
}

.card--interactive[draggable="true"]:active {
  cursor: grabbing;
}

.card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.card__id {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.card__priority {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
}

.card__blocked-badge {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.05rem 0.35rem;
  border-radius: 0.25rem;
  background: var(--priority-high, #b54708);
  color: #fff;
  margin-left: auto;
  margin-right: 0.5rem;
}

.card__title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
}

.card__title--interactive {
  cursor: text;
}

.card__title-input {
  display: block;
  width: 100%;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
  padding: 0.125rem 0.25rem;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--bg-primary);
  color: inherit;
}

.card__labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.375rem;
}

.card__projects {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.375rem;
}

.card__project-chip {
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.05rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-secondary);
  border: 1px solid var(--border-soft);
  line-height: 1.3;
}

.card__labels-overflow {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.2;
  align-self: center;
}

.card__footer {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.card__assignee-btn {
  background: none;
  border: 1px dashed transparent;
  border-radius: 4px;
  padding: 0.125rem 0.25rem;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.card__assignee-btn:hover,
.card__assignee-btn:focus-visible {
  border-color: var(--border-primary);
  outline: none;
}

.card__assignee-empty {
  font-style: italic;
  color: var(--text-secondary);
}
</style>
