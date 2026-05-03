<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getTasks, type Task } from "@/api/tasks.api";
import { listFlows, listFlowStatuses, type FlowStatus } from "@/api/flows.api";
import TaskCard from "../components/TaskCard.vue";
import ProjectChip from "@/components/visual/ProjectChip.vue";
import FlowIcon from "@/components/visual/FlowIcon.vue";
import StageBadge from "@/components/visual/StageBadge.vue";

type GroupKey = "in_progress" | "todo" | "done";

interface FlowRef {
  id: string;
  slug: string;
  name: string;
}

interface Group {
  key: GroupKey;
  label: string;
  tasks: Task[];
  flows?: FlowRef[];
}

const router = useRouter();
const tasks = ref<Task[]>([]);
const flowInitialStatusSlug = ref<Record<string, string>>({});
const loading = ref(true);
const error = ref<string | null>(null);

const DONE_CAP = 20;
const DONE_WINDOW_DAYS = 14;

const groups = computed<Group[]>(() => {
  const inProgress: Task[] = [];
  const todo: Task[] = [];
  const done: Task[] = [];

  const cutoff = Date.now() - DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const t of tasks.value) {
    if (t.resolution !== null) {
      if (Date.parse(t.updatedAt) >= cutoff) done.push(t);
      continue;
    }
    const initial = flowInitialStatusSlug.value[t.flow.id];
    if (initial && t.currentStatus.slug === initial) {
      todo.push(t);
    } else {
      inProgress.push(t);
    }
  }

  done.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const out: Group[] = [];
  if (inProgress.length) out.push({ key: "in_progress", label: "In progress", tasks: inProgress });
  if (todo.length) out.push({ key: "todo", label: "To do", tasks: todo });
  if (done.length) {
    const seen = new Map<string, FlowRef>();
    for (const t of done) {
      if (!seen.has(t.flow.id)) seen.set(t.flow.id, { id: t.flow.id, slug: t.flow.slug, name: t.flow.name });
    }
    out.push({
      key: "done",
      label: `Done (last ${DONE_WINDOW_DAYS} days)`,
      tasks: done.slice(0, DONE_CAP),
      flows: [...seen.values()],
    });
  }
  return out;
});

const isEmpty = computed(() => !loading.value && !error.value && groups.value.length === 0);

function dueLabel(t: Task): string | null {
  if (!t.dueDate) return null;
  return new Date(t.dueDate).toLocaleDateString();
}

function onCardClick(t: Task) {
  router.push(`/tasks/${t.flow.slug}/${t.id}`);
}

async function loadFlowMeta(flowIds: string[]) {
  const flows = await listFlows();
  const present = flows.filter((f) => flowIds.includes(f.id));
  const lists = await Promise.all(
    present.map(async (f) => [f.id, await listFlowStatuses(f.id)] as const),
  );
  const map: Record<string, string> = {};
  for (const [flowId, statuses] of lists) {
    const sorted = [...statuses].sort((a: FlowStatus, b: FlowStatus) => a.sortOrder - b.sortOrder);
    if (sorted[0]) map[flowId] = sorted[0].slug;
  }
  flowInitialStatusSlug.value = map;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await getTasks({ assignee: "me", limit: "100" });
    tasks.value = res.data;
    const uniqueFlowIds = [...new Set(res.data.map((t) => t.flow.id))];
    if (uniqueFlowIds.length > 0) {
      await loadFlowMeta(uniqueFlowIds);
    }
  } catch (e: any) {
    error.value = e?.error?.message ?? e?.message ?? "Failed to load your work";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="my-work">
    <header class="my-work__header">
      <h1>My Work</h1>
      <button
        type="button"
        class="my-work__refresh"
        :disabled="loading"
        @click="load"
        data-testid="my-work-refresh"
      >
        Refresh
      </button>
    </header>

    <p v-if="loading" class="my-work__status">Loading…</p>
    <p v-else-if="error" class="my-work__error" data-testid="my-work-error">{{ error }}</p>

    <div
      v-else-if="isEmpty"
      class="my-work__empty"
      data-testid="my-work-empty"
    >
      <p>You have no assigned tasks right now.</p>
      <p>
        Browse <router-link to="/flows" data-testid="my-work-empty-flows-link">all flows</router-link> or check your
        <router-link to="/projects" data-testid="my-work-empty-projects-link">projects</router-link>.
      </p>
    </div>

    <div v-else class="my-work__groups">
      <section
        v-for="g in groups"
        :key="g.key"
        class="my-work__group"
        :data-testid="`my-work-group-${g.key}`"
      >
        <h2 :data-testid="`my-work-group-heading-${g.key}`" class="my-work__group-heading">
          {{ g.label }}
          <span class="my-work__count">{{ g.tasks.length }}</span>
          <span v-if="g.flows && g.flows.length" class="my-work__view-all">
            <router-link
              v-for="f in g.flows"
              :key="f.id"
              :to="`/tasks/${f.slug}`"
              :data-testid="`my-work-view-all-${f.slug}`"
              class="my-work__view-all-link"
            >
              View all in {{ f.name }}
            </router-link>
          </span>
        </h2>
        <ul class="my-work__list">
          <li
            v-for="t in g.tasks"
            :key="t.id"
            class="my-work__item"
            :data-testid="`my-work-card-${t.displayId}`"
            @click="onCardClick(t)"
          >
            <TaskCard :task="t" hide-projects />
            <div class="my-work__meta" data-testid="my-work-meta">
              <ProjectChip
                v-for="p in t.projects"
                :key="p.id"
                :project-key="p.key"
                :name="p.name"
                :color="p.color"
              />
              <span class="my-work__flow" data-testid="my-work-flow">
                <FlowIcon :icon="t.flow.icon" :flow-name="t.flow.name" />
                <span class="my-work__flow-name">{{ t.flow.name }}</span>
              </span>
              <StageBadge :name="t.currentStatus.name" :color="t.currentStatus.color" />
              <span v-if="dueLabel(t)" class="my-work__chip my-work__chip--due">Due {{ dueLabel(t) }}</span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.my-work {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.my-work__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.my-work__header h1 {
  font-size: 1.25rem;
  font-weight: 600;
}

.my-work__refresh {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
}

.my-work__refresh:disabled {
  cursor: default;
  opacity: 0.6;
}

.my-work__status,
.my-work__empty {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.my-work__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.875rem;
}

.my-work__empty a {
  color: var(--accent);
}

.my-work__groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.my-work__group-heading {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.my-work__view-all {
  margin-left: auto;
  display: inline-flex;
  gap: 0.5rem;
  text-transform: none;
  letter-spacing: 0;
}

.my-work__view-all-link {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--accent);
}

.my-work__count {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  text-transform: none;
  letter-spacing: 0;
}

.my-work__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.my-work__item {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.my-work__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.25rem;
}

.my-work__flow {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: var(--text-secondary);
}

.my-work__flow-name {
  font-weight: 500;
}

.my-work__chip {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
  color: var(--text-secondary);
}

.my-work__chip--due {
  color: var(--priority-high, #b35900);
}
</style>
