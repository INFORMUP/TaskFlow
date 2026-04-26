<script setup lang="ts">
import type { Task } from "@/api/tasks.api";
import TaskCard from "./TaskCard.vue";
import TaskColumnEmptyState from "./TaskColumnEmptyState.vue";

defineProps<{
  status: { slug: string; name: string };
  tasks: Task[];
  flowSlug: string;
}>();

const emit = defineEmits<{
  taskClick: [task: Task];
}>();
</script>

<template>
  <div class="column">
    <div class="column__header">
      <span class="column__name">{{ status.name }}</span>
      <span class="column__count">{{ tasks.length }}</span>
    </div>
    <div class="column__cards">
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @click="emit('taskClick', task)"
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
}

.column__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--border-primary);
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
