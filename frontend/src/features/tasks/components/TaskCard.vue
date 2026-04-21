<script setup lang="ts">
import type { Task } from "@/api/tasks.api";
import ActorLabel from "@/components/ActorLabel.vue";

defineProps<{
  task: Task;
}>();

const priorityColors: Record<string, string> = {
  critical: "var(--priority-critical)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};
</script>

<template>
  <button
    type="button"
    class="card"
    :aria-label="`${task.displayId} — ${task.title}, priority ${task.priority}`"
    @click="$emit('click')"
  >
    <span class="card__header">
      <span class="card__id">{{ task.displayId }}</span>
      <span
        class="card__priority"
        :style="{ color: priorityColors[task.priority] }"
      >
        {{ task.priority }}
      </span>
    </span>
    <span class="card__title">{{ task.title }}</span>
    <span class="card__footer" v-if="task.assignee">
      <span class="card__assignee">
        <ActorLabel :actor="task.assignee" />
      </span>
    </span>
  </button>
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

.card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.card__title {
  display: block;
}

.card__footer {
  display: block;
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

.card__title {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
}

.card__footer {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
</style>
