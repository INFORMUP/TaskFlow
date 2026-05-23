<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  listUserActivity,
  type ActivityEvent,
  type ActivityUserRef,
  type ListUserActivityParams,
} from "@/api/user-activity.api";
import { listProjects, type Project } from "@/api/projects.api";

const route = useRoute();
const userId = computed(() => String(route.params.id));

const user = ref<ActivityUserRef | null>(null);
const events = ref<ActivityEvent[]>([]);
const projects = ref<Project[]>([]);
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const selectedProjectId = ref<string>("");
const fromDate = ref<string>("");
const toDate = ref<string>("");

const PAGE_SIZE = 20;

function buildParams(nextCursor?: string): ListUserActivityParams {
  const params: ListUserActivityParams = { limit: PAGE_SIZE };
  if (selectedProjectId.value) params.projectId = selectedProjectId.value;
  if (fromDate.value) params.from = fromDate.value;
  if (toDate.value) params.to = toDate.value;
  if (nextCursor) params.cursor = nextCursor;
  return params;
}

async function fetchPage(reset: boolean) {
  if (reset) loading.value = true;
  else loadingMore.value = true;
  error.value = null;
  try {
    const res = await listUserActivity(
      userId.value,
      buildParams(reset ? undefined : cursor.value ?? undefined),
    );
    user.value = res.user;
    events.value = reset ? res.data : [...events.value, ...res.data];
    cursor.value = res.pagination.cursor;
    hasMore.value = res.pagination.hasMore;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load activity";
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function load() {
  return fetchPage(true);
}

function loadMore() {
  return fetchPage(false);
}

async function loadProjects() {
  try {
    projects.value = await listProjects();
  } catch {
    projects.value = [];
  }
}

watch(userId, () => load(), { immediate: true });
loadProjects();

watch([selectedProjectId, fromDate, toDate], () => load());

const isEmpty = computed(() => !loading.value && events.value.length === 0);

function taskHref(task: { id: string; flow: { slug: string } }) {
  return `/tasks/${task.flow.slug}/${task.id}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const eventVerb: Record<ActivityEvent["type"], string> = {
  task_created: "created",
  status_transition: "moved",
  comment: "commented on",
};
</script>

<template>
  <div class="profile">
    <header class="profile__header">
      <div class="profile__identity">
        <h1 class="profile__name" data-testid="user-profile-name">
          {{ user?.displayName ?? "User" }}
        </h1>
        <span v-if="user" class="profile__badge" :class="`badge--${user.actorType}`">
          {{ user.actorType }}
        </span>
      </div>
      <p class="profile__subtitle">Activity timeline</p>
    </header>

    <div class="profile__filters">
      <label class="profile__filter">
        <span class="profile__filter-label">Project</span>
        <select
          v-model="selectedProjectId"
          data-testid="activity-project-filter"
          aria-label="Filter activity by project"
        >
          <option value="">All projects</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.key }} · {{ p.name }}
          </option>
        </select>
      </label>
      <label class="profile__filter">
        <span class="profile__filter-label">From</span>
        <input
          v-model="fromDate"
          type="date"
          data-testid="activity-from"
          aria-label="Activity from date"
        />
      </label>
      <label class="profile__filter">
        <span class="profile__filter-label">To</span>
        <input
          v-model="toDate"
          type="date"
          data-testid="activity-to"
          aria-label="Activity to date"
        />
      </label>
    </div>

    <p v-if="error" class="profile__error" role="alert">{{ error }}</p>

    <p v-if="loading && events.length === 0" class="profile__loading">Loading activity…</p>

    <p v-else-if="isEmpty" class="profile__empty" data-testid="activity-empty">
      No activity to show.
    </p>

    <ol v-else class="timeline" data-testid="activity-list">
      <li
        v-for="event in events"
        :key="event.id"
        class="timeline__item"
        :class="`timeline__item--${event.type}`"
        data-testid="activity-item"
        :data-event-type="event.type"
      >
        <span class="timeline__time">{{ formatTime(event.timestamp) }}</span>
        <div class="timeline__body">
          <p class="timeline__line">
            <span class="timeline__verb">{{ eventVerb[event.type] }}</span>
            <router-link :to="taskHref(event.task)" class="timeline__task">
              {{ event.task.displayId }} · {{ event.task.title }}
            </router-link>
          </p>
          <p
            v-if="event.type === 'status_transition' && event.toStatus"
            class="timeline__detail"
          >
            <span class="timeline__status">{{ event.fromStatus?.name ?? "—" }}</span>
            <span class="timeline__arrow" aria-hidden="true">→</span>
            <span class="timeline__status">{{ event.toStatus.name }}</span>
          </p>
          <p
            v-else-if="event.type === 'comment' && event.bodyPreview"
            class="timeline__detail timeline__comment"
          >
            “{{ event.bodyPreview }}”
          </p>
        </div>
      </li>
    </ol>

    <button
      v-if="hasMore"
      type="button"
      class="profile__load-more"
      data-testid="activity-load-more"
      :disabled="loadingMore"
      @click="loadMore"
    >
      {{ loadingMore ? "Loading…" : "Load more" }}
    </button>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  max-width: 760px;
  margin: 0 auto;
}
.profile__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.profile__identity {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.profile__name {
  font-size: 1.375rem;
  font-weight: 700;
  margin: 0;
}
.profile__badge {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--bg-secondary, #eee);
  color: var(--text-secondary);
}
.profile__badge.badge--agent {
  background: var(--accent, #6f42c1);
  color: white;
}
.profile__subtitle {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0;
}
.profile__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
}
.profile__filter {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
}
.profile__filter-label {
  color: var(--text-secondary);
}
.profile__filter select,
.profile__filter input {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.8125rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.profile__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
}
.profile__loading,
.profile__empty {
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-style: italic;
}
.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.timeline__item {
  display: grid;
  grid-template-columns: 11rem 1fr;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-primary);
  border-left: 3px solid var(--border-primary);
  border-radius: 6px;
}
.timeline__item--task_created {
  border-left-color: var(--accent, #6f42c1);
}
.timeline__item--status_transition {
  border-left-color: #0df2b9;
}
.timeline__item--comment {
  border-left-color: #004de6;
}
.timeline__time {
  color: var(--text-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}
.timeline__body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.timeline__line {
  margin: 0;
  font-size: 0.875rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: baseline;
}
.timeline__verb {
  color: var(--text-secondary);
}
.timeline__task {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 500;
}
.timeline__task:hover {
  text-decoration: underline;
}
.timeline__detail {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.timeline__comment {
  font-style: italic;
}
.timeline__status {
  font-weight: 500;
}
.profile__load-more {
  align-self: center;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: pointer;
  font-size: 0.8125rem;
}
.profile__load-more:hover:not(:disabled) {
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}
.profile__load-more:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
