<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getTasks, type Task } from "@/api/tasks.api";
import { apiFetch } from "@/api/client";
import TaskColumn from "../components/TaskColumn.vue";
import TaskCreateForm from "../components/TaskCreateForm.vue";

const route = useRoute();
const router = useRouter();
const tasks = ref<Task[]>([]);
const statuses = ref<{ id: string; slug: string; name: string; sortOrder: number }[]>([]);
const loading = ref(false);
const showCreateForm = ref(false);
const flowSlug = ref(route.params.flow as string);

interface FlowStatus {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
}

async function loadStatuses() {
  const res = await apiFetch<{ data: any[] }>("/api/v1/teams");
  // We need a flows endpoint — for now, load statuses from tasks
  // Actually let's add a minimal flows API. For now, hardcode status order
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
    const res = await getTasks({ flow: flowSlug.value });
    tasks.value = res.data;
  } finally {
    loading.value = false;
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

watch(() => route.params.flow, (newFlow) => {
  flowSlug.value = newFlow as string;
  loadStatuses();
  loadTasks();
});

onMounted(() => {
  loadStatuses();
  loadTasks();
});
</script>

<template>
  <div class="board">
    <div class="board__header">
      <h2>{{ flowSlug.charAt(0).toUpperCase() + flowSlug.slice(1) }} Tasks</h2>
      <button class="board__create-btn" @click="showCreateForm = true">+ New Task</button>
    </div>

    <TaskCreateForm
      v-if="showCreateForm"
      :flow="flowSlug"
      @created="handleTaskCreated"
      @cancel="showCreateForm = false"
    />

    <div class="board__columns" v-if="!loading">
      <TaskColumn
        v-for="status in statuses"
        :key="status.slug"
        :status="status"
        :tasks="tasksForStatus(status.slug)"
        @task-click="handleTaskClick"
      />
    </div>
    <div v-else class="board__loading">Loading...</div>
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
</style>
