<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { Task } from "@/api/tasks.api";

const props = defineProps<{ tasks: Task[]; flow: string }>();
const router = useRouter();

type SortKey = "title" | "priority" | "status" | "assignee" | "dueDate" | "updatedAt";
const sortKey = ref<SortKey>("updatedAt");
const sortDir = ref<"asc" | "desc">("desc");

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const sorted = computed(() => {
  const list = [...props.tasks];
  list.sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    switch (sortKey.value) {
      case "title": av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
      case "priority": av = PRIORITY_ORDER[a.priority] ?? 99; bv = PRIORITY_ORDER[b.priority] ?? 99; break;
      case "status": av = a.currentStatus.name; bv = b.currentStatus.name; break;
      case "assignee": av = a.assignee?.displayName ?? ""; bv = b.assignee?.displayName ?? ""; break;
      case "dueDate": av = a.dueDate ?? ""; bv = b.dueDate ?? ""; break;
      case "updatedAt": av = a.updatedAt; bv = b.updatedAt; break;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir.value === "asc" ? cmp : -cmp;
  });
  return list;
});

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "asc";
  }
}

function sortIndicator(key: SortKey) {
  if (sortKey.value !== key) return "";
  return sortDir.value === "asc" ? " ▲" : " ▼";
}

function openTask(task: Task) {
  router.push(`/tasks/${props.flow}/${task.id}`);
}
</script>

<template>
  <table class="task-list">
    <thead>
      <tr>
        <th>ID</th>
        <th class="task-list__sortable" @click="toggleSort('title')">
          Title{{ sortIndicator("title") }}
        </th>
        <th>Projects</th>
        <th class="task-list__sortable" @click="toggleSort('assignee')">
          Assignee{{ sortIndicator("assignee") }}
        </th>
        <th class="task-list__sortable" @click="toggleSort('status')">
          Status{{ sortIndicator("status") }}
        </th>
        <th class="task-list__sortable" @click="toggleSort('priority')">
          Priority{{ sortIndicator("priority") }}
        </th>
        <th class="task-list__sortable" @click="toggleSort('dueDate')">
          Due{{ sortIndicator("dueDate") }}
        </th>
        <th class="task-list__sortable" @click="toggleSort('updatedAt')">
          Updated{{ sortIndicator("updatedAt") }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="t in sorted"
        :key="t.id"
        class="task-list__row"
        @click="openTask(t)"
      >
        <td class="task-list__id">{{ t.displayId }}</td>
        <td>{{ t.title }}</td>
        <td>
          <span
            v-for="p in t.projects"
            :key="p.id"
            class="task-list__chip"
          >
            {{ p.key }}
          </span>
        </td>
        <td>{{ t.assignee?.displayName ?? "—" }}</td>
        <td>{{ t.currentStatus.name }}</td>
        <td :class="`priority--${t.priority}`">{{ t.priority }}</td>
        <td>{{ t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—" }}</td>
        <td>{{ new Date(t.updatedAt).toLocaleDateString() }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.task-list {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  background: var(--bg-primary);
  box-shadow: var(--shadow-card);
  border-radius: var(--radius);
  overflow: hidden;
}
.task-list th,
.task-list td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-soft);
}
.task-list th {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
  font-weight: 600;
  color: var(--text-secondary);
}
.task-list__sortable {
  cursor: pointer;
  user-select: none;
}
.task-list__row {
  cursor: pointer;
}
.task-list__row:hover {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
}
.task-list__id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.task-list__chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  margin-right: 0.25rem;
  border-radius: 999px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.6875rem;
  color: var(--accent);
  font-weight: 600;
}
.priority--critical { color: var(--priority-critical); }
.priority--high { color: var(--priority-high); }
.priority--medium { color: var(--priority-medium); }
.priority--low { color: var(--priority-low); }
</style>
