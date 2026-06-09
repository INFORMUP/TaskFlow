<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getTasks, type Task } from "@/api/tasks.api";
import { listFlows, listFlowStatuses, type FlowStatus } from "@/api/flows.api";
import TaskCard from "../components/TaskCard.vue";
import ProjectChip from "@/components/visual/ProjectChip.vue";
import FlowIcon from "@/components/visual/FlowIcon.vue";
import StageBadge from "@/components/visual/StageBadge.vue";
import FilterBar from "../components/FilterBar.vue";
import { useTaskFilters } from "../composables/useTaskFilters";

type GroupKey = "in_progress" | "todo" | "done";
type GroupBy = "status" | "project";
type ReasonKind = "overdue" | "due-soon" | "critical" | "stale" | "almost-done";

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

interface ProjectGroup {
  key: string;
  name: string;
  color: string | null;
  tasks: Task[];
}

const router = useRouter();
const tasks = ref<Task[]>([]);
const flowStatuses = ref<Record<string, FlowStatus[]>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const groupBy = ref<GroupBy>("status");

const { filters } = useTaskFilters();

const expanded = ref<Record<GroupKey, boolean>>({
  in_progress: true,
  todo: false,
  done: false,
});

const DONE_CAP = 20;
const DONE_WINDOW_DAYS = 14;
const UP_NEXT_CAP = 5;
const UP_NEXT_MIN_SCORE = 20;
const STALE_DAYS = 7;

interface StatusMeta {
  sortOrder: number;
  totalStages: number;
}

const statusMeta = computed<Record<string, StatusMeta>>(() => {
  const map: Record<string, StatusMeta> = {};
  for (const statuses of Object.values(flowStatuses.value)) {
    const total = statuses.length;
    for (const s of statuses) map[s.id] = { sortOrder: s.sortOrder, totalStages: total };
  }
  return map;
});

const flowInitialStatusSlug = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const [flowId, statuses] of Object.entries(flowStatuses.value)) {
    const sorted = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder);
    if (sorted[0]) map[flowId] = sorted[0].slug;
  }
  return map;
});

const allStatuses = computed(() => {
  const seen = new Map<string, { slug: string; name: string }>();
  for (const statuses of Object.values(flowStatuses.value)) {
    for (const s of statuses) {
      if (!seen.has(s.slug)) seen.set(s.slug, { slug: s.slug, name: s.name });
    }
  }
  return [...seen.values()];
});

const filteredTasks = computed(() => {
  const f = filters.value;
  const q = f.q.toLowerCase().trim();
  return tasks.value.filter((t) => {
    if (f.projectId && !t.projects.some((p) => p.id === f.projectId)) return false;
    if (f.status.length > 0 && !f.status.includes(t.currentStatus.slug)) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (f.dueAfter && (!t.dueDate || t.dueDate < f.dueAfter)) return false;
    if (f.dueBefore && (!t.dueDate || t.dueDate > f.dueBefore)) return false;
    if (f.labelIds.length > 0 && !f.labelIds.some((id) => t.labels.some((l) => l.id === id))) return false;
    return true;
  });
});

interface RankedTask {
  task: Task;
  score: number;
  reason: { kind: ReasonKind; label: string };
}

function dayDiff(a: number, b: number) {
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}

function rank(t: Task, now: number): RankedTask | null {
  if (t.resolution !== null) return null;
  let score = 0;
  const reasons: RankedTask["reason"][] = [];

  if (t.dueDate) {
    const due = Date.parse(t.dueDate);
    const days = dayDiff(due, now);
    if (days < 0) {
      score += 100;
      reasons.push({ kind: "overdue", label: `Overdue ${Math.abs(days)}d` });
    } else if (days <= 3) {
      score += 50;
      reasons.push({
        kind: "due-soon",
        label: days === 0 ? "Due today" : `Due in ${days}d`,
      });
    }
  }

  if (t.priority === "critical") {
    score += 40;
    reasons.push({ kind: "critical", label: "Critical" });
  } else if (t.priority === "high") {
    score += 20;
  } else if (t.priority === "medium") {
    score += 5;
  }

  const updated = Date.parse(t.updatedAt);
  const updatedDays = dayDiff(now, updated);
  if (updatedDays > STALE_DAYS) {
    score += 15;
    reasons.push({ kind: "stale", label: `Stale ${updatedDays}d` });
  }

  const meta = statusMeta.value[t.currentStatus.id];
  if (meta) {
    score += 10 * (meta.sortOrder - 1);
    const nearTerminal = meta.sortOrder >= meta.totalStages - 1;
    if (nearTerminal && ["validate", "review", "approve"].includes(t.currentStatus.slug)) {
      score += 5;
      reasons.push({ kind: "almost-done", label: "Almost done" });
    }
  }

  if (score < UP_NEXT_MIN_SCORE) return null;

  const order: ReasonKind[] = ["overdue", "due-soon", "critical", "stale", "almost-done"];
  const reason =
    reasons.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0] ??
    ({ kind: "critical", label: t.priority } as RankedTask["reason"]);

  return { task: t, score, reason };
}

// Up next ignores the filter strip on purpose — overdue work shouldn't hide.
const upNext = computed<RankedTask[]>(() => {
  const now = Date.now();
  const ranked: RankedTask[] = [];
  for (const t of tasks.value) {
    const r = rank(t, now);
    if (r) ranked.push(r);
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, UP_NEXT_CAP);
});

const groups = computed<Group[]>(() => {
  const inProgress: Task[] = [];
  const todo: Task[] = [];
  const done: Task[] = [];

  const cutoff = Date.now() - DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const t of filteredTasks.value) {
    if (t.resolution !== null) {
      if (Date.parse(t.updatedAt) >= cutoff) done.push(t);
      continue;
    }
    const initial = flowInitialStatusSlug.value[t.flow.id];
    if (initial && t.currentStatus.slug === initial) todo.push(t);
    else inProgress.push(t);
  }

  done.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const now = Date.now();
  inProgress.sort((a, b) => (rank(b, now)?.score ?? 0) - (rank(a, now)?.score ?? 0));

  const doneFlows = new Map<string, FlowRef>();
  for (const t of done) {
    if (!doneFlows.has(t.flow.id))
      doneFlows.set(t.flow.id, { id: t.flow.id, slug: t.flow.slug, name: t.flow.name });
  }

  return [
    { key: "in_progress", label: "In progress", tasks: inProgress },
    { key: "todo", label: "To do", tasks: todo },
    {
      key: "done",
      label: `Done (last ${DONE_WINDOW_DAYS} days)`,
      tasks: done.slice(0, DONE_CAP),
      flows: [...doneFlows.values()],
    },
  ];
});

function lifecycleRank(t: Task): number {
  if (t.resolution !== null) return 2;
  const initial = flowInitialStatusSlug.value[t.flow.id];
  if (initial && t.currentStatus.slug === initial) return 1;
  return 0;
}

const projectGroups = computed<ProjectGroup[]>(() => {
  const map = new Map<string, ProjectGroup>();
  const order: string[] = [];
  const orphan: ProjectGroup = { key: "none", name: "No project", color: null, tasks: [] };

  for (const t of filteredTasks.value) {
    if (!t.projects.length) {
      orphan.tasks.push(t);
      continue;
    }
    for (const p of t.projects) {
      let g = map.get(p.key);
      if (!g) {
        g = { key: p.key, name: p.name, color: p.color ?? null, tasks: [] };
        map.set(p.key, g);
        order.push(p.key);
      }
      g.tasks.push(t);
    }
  }

  const out = order.map((k) => map.get(k)!);
  for (const g of out) g.tasks.sort((a, b) => lifecycleRank(a) - lifecycleRank(b));
  out.sort((a, b) => a.name.localeCompare(b.name));
  if (orphan.tasks.length) {
    orphan.tasks.sort((a, b) => lifecycleRank(a) - lifecycleRank(b));
    out.push(orphan);
  }
  return out;
});

const isEmpty = computed(() => {
  if (loading.value || error.value) return false;
  return tasks.value.length === 0;
});

function dueLabel(t: Task): string | null {
  if (!t.dueDate) return null;
  return new Date(t.dueDate).toLocaleDateString();
}

function reasonClass(kind: ReasonKind) {
  return `up-next__card--${kind}`;
}

function onCardClick(t: Task) {
  router.push(`/tasks/${t.flow.slug}/${t.id}`);
}

function toggle(key: GroupKey) {
  expanded.value[key] = !expanded.value[key];
}

async function loadFlowMeta(flowIds: string[]) {
  const flows = await listFlows();
  const present = flows.filter((f) => flowIds.includes(f.id));
  const lists = await Promise.all(
    present.map(async (f) => [f.id, await listFlowStatuses(f.id)] as const),
  );
  const map: Record<string, FlowStatus[]> = {};
  for (const [flowId, statuses] of lists) map[flowId] = statuses;
  flowStatuses.value = map;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await getTasks({ assignee: "me", limit: "100" });
    tasks.value = res.data;
    const uniqueFlowIds = [...new Set(res.data.map((t) => t.flow.id))];
    if (uniqueFlowIds.length > 0) await loadFlowMeta(uniqueFlowIds);
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
      <div class="my-work__header-actions">
        <div
          class="my-work__toggle"
          role="group"
          aria-label="Group tasks by"
          data-testid="my-work-group-toggle"
        >
          <button
            type="button"
            class="my-work__toggle-btn"
            :class="{ 'my-work__toggle-btn--active': groupBy === 'status' }"
            :aria-pressed="groupBy === 'status' ? 'true' : 'false'"
            data-testid="my-work-toggle-status"
            @click="groupBy = 'status'"
          >
            Status
          </button>
          <button
            type="button"
            class="my-work__toggle-btn"
            :class="{ 'my-work__toggle-btn--active': groupBy === 'project' }"
            :aria-pressed="groupBy === 'project' ? 'true' : 'false'"
            data-testid="my-work-toggle-project"
            @click="groupBy = 'project'"
          >
            Project
          </button>
        </div>
        <button
          type="button"
          class="my-work__refresh"
          :disabled="loading"
          @click="load"
          data-testid="my-work-refresh"
        >
          Refresh
        </button>
      </div>
    </header>

    <p v-if="loading" class="my-work__status">Loading…</p>
    <p v-else-if="error" class="my-work__error" data-testid="my-work-error">{{ error }}</p>

    <div v-else-if="isEmpty" class="my-work__empty" data-testid="my-work-empty">
      <p>You have no assigned tasks right now.</p>
      <p>
        Browse <router-link to="/flows" data-testid="my-work-empty-flows-link">all flows</router-link> or check your
        <router-link to="/projects" data-testid="my-work-empty-projects-link">projects</router-link>.
      </p>
    </div>

    <template v-else>
      <!-- Up next: top-ranked open tasks. Renders only when something qualifies, and ignores filters. -->
      <section
        v-if="upNext.length > 0"
        class="up-next"
        data-testid="my-work-up-next"
        aria-labelledby="up-next-heading"
      >
        <h2 id="up-next-heading" class="up-next__heading">Up next</h2>
        <ul class="up-next__list">
          <li
            v-for="r in upNext"
            :key="r.task.id"
            class="up-next__card"
            :class="reasonClass(r.reason.kind)"
            :data-testid="`my-work-up-next-${r.task.displayId}`"
            :data-reason="r.reason.kind"
            role="button"
            tabindex="0"
            @click="onCardClick(r.task)"
            @keydown.enter.prevent="onCardClick(r.task)"
            @keydown.space.prevent="onCardClick(r.task)"
          >
            <div class="up-next__top">
              <span class="up-next__id">{{ r.task.displayId }}</span>
              <span class="up-next__reason">{{ r.reason.label }}</span>
            </div>
            <div class="up-next__title">{{ r.task.title }}</div>
            <div class="up-next__meta">
              <span class="up-next__flow">
                <FlowIcon :icon="r.task.flow.icon" :flow-name="r.task.flow.name" />
                <span>{{ r.task.flow.name }}</span>
              </span>
              <StageBadge :name="r.task.currentStatus.name" :color="r.task.currentStatus.color" />
              <ProjectChip
                v-for="p in r.task.projects"
                :key="p.id"
                :project-key="p.key"
                :name="p.name"
                :color="p.color"
              />
            </div>
          </li>
        </ul>
      </section>

      <!-- Filter bar. Applies to status/project groups, not Up next. -->
      <FilterBar :statuses="allStatuses" />

      <!-- Status grouping: collapsible groups (In progress expanded by default). -->
      <div v-if="groupBy === 'status'" class="my-work__groups">
        <section
          v-for="g in groups"
          :key="g.key"
          class="my-work__group"
          :class="{ 'my-work__group--collapsed': !expanded[g.key] }"
          :data-testid="`my-work-group-${g.key}`"
        >
          <button
            type="button"
            class="my-work__group-heading"
            :aria-expanded="expanded[g.key]"
            :data-testid="`my-work-group-heading-${g.key}`"
            @click="toggle(g.key)"
          >
            <span class="my-work__chevron" aria-hidden="true">{{ expanded[g.key] ? "▼" : "▶" }}</span>
            <span class="my-work__group-label">{{ g.label }}</span>
            <span class="my-work__count">{{ g.tasks.length }}</span>
            <span
              v-if="g.flows && g.flows.length && expanded[g.key]"
              class="my-work__view-all"
              @click.stop
            >
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
          </button>
          <ul v-if="expanded[g.key] && g.tasks.length > 0" class="my-work__list">
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
          <p
            v-else-if="expanded[g.key]"
            class="my-work__group-empty"
            :data-testid="`my-work-group-empty-${g.key}`"
          >
            Nothing here.
          </p>
        </section>
      </div>

      <!-- Project grouping: same visual treatment, no collapse (already flat). -->
      <div v-else class="my-work__groups">
        <section
          v-for="pg in projectGroups"
          :key="pg.key"
          class="my-work__group"
          :data-testid="`my-work-project-group-${pg.key}`"
        >
          <h2
            :data-testid="`my-work-project-heading-${pg.key}`"
            class="my-work__group-heading my-work__group-heading--project"
          >
            <span
              v-if="pg.color"
              class="my-work__project-swatch"
              :style="{ background: pg.color }"
              aria-hidden="true"
            />
            {{ pg.name }}
            <span class="my-work__count">{{ pg.tasks.length }}</span>
          </h2>
          <ul class="my-work__list">
            <li
              v-for="t in pg.tasks"
              :key="`${pg.key}-${t.id}`"
              class="my-work__item"
              :data-testid="`my-work-card-${pg.key}-${t.displayId}`"
              @click="onCardClick(t)"
            >
              <TaskCard :task="t" />
              <div class="my-work__meta" data-testid="my-work-meta">
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
    </template>
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

.my-work__header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.my-work__toggle {
  display: inline-flex;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  overflow: hidden;
}

.my-work__toggle-btn {
  padding: 0.375rem 0.75rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.my-work__toggle-btn + .my-work__toggle-btn {
  border-left: 1px solid var(--border-primary);
}

.my-work__toggle-btn--active {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.06));
  color: var(--text-primary, inherit);
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

/* ---- Up next ---- */
.up-next {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.up-next__heading {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.up-next__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.up-next__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem 0.875rem 0.75rem 1.125rem;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius, 8px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}

.up-next__card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.up-next__card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.up-next__card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-top-left-radius: var(--radius, 8px);
  border-bottom-left-radius: var(--radius, 8px);
  background: var(--stripe, #94a3b8);
}

.up-next__card--overdue { --stripe: #dc2626; }
.up-next__card--due-soon { --stripe: #f59e0b; }
.up-next__card--critical { --stripe: #ef4444; }
.up-next__card--stale { --stripe: #0ea5e9; }
.up-next__card--almost-done { --stripe: #10b981; }

.up-next__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.up-next__id {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.up-next__reason {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--stripe, #475569);
}

.up-next__title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.up-next__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.up-next__flow {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: var(--text-secondary);
}

/* ---- Groups ---- */
.my-work__groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.my-work__group-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  background: transparent;
  border: 0;
  padding: 0.25rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.my-work__group-heading--project {
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.95rem;
  color: var(--text-primary, inherit);
  cursor: default;
}

.my-work__chevron {
  display: inline-block;
  width: 0.875rem;
  font-size: 0.625rem;
}

.my-work__project-swatch {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 2px;
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

.my-work__group-empty {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-style: italic;
}
</style>
