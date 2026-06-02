<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import TaskCreateForm from "@/features/tasks/components/TaskCreateForm.vue";
import type { Task } from "@/api/tasks.api";

const route = useRoute();
const router = useRouter();

const presetFlow = computed(() =>
  typeof route.query.flow === "string" ? route.query.flow : undefined,
);
const presetParent = computed(() =>
  typeof route.query.parent === "string" ? route.query.parent : undefined,
);

function handleCreated(task: Task) {
  router.push(`/tasks/${task.flow.slug}/${task.id}`);
}

function handleCancel() {
  router.push("/flows");
}
</script>

<template>
  <section class="task-new">
    <h1>New Task</h1>
    <p class="task-new__hint">
      Choose a project, flow, initial status, assignee, and any tags. The task is
      created at the flow's first status by default — pick a different one to land
      somewhere else.
    </p>
    <TaskCreateForm
      :flow="presetFlow"
      :parent-id="presetParent"
      @created="handleCreated"
      @cancel="handleCancel"
    />
  </section>
</template>

<style scoped>
.task-new {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem;
}

.task-new h1 {
  font-size: 1.5rem;
  margin: 0;
}

.task-new__hint {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0;
}
</style>
