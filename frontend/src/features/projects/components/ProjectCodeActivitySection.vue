<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  listProjectCommits,
  listProjectPullRequests,
  type ProjectCommit,
  type ProjectPullRequest,
} from "@/api/project-code-activity.api";
import { listProjectRepositories, type ProjectRepository } from "@/api/projects.api";

const props = defineProps<{ projectId: string }>();

const repositories = ref<ProjectRepository[]>([]);
const selectedRepoId = ref<string>("");
const commits = ref<ProjectCommit[]>([]);
const pullRequests = ref<ProjectPullRequest[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const showRepoFilter = computed(() => repositories.value.length > 1);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const repoFilter = selectedRepoId.value || undefined;
    const [c, p] = await Promise.all([
      listProjectCommits(props.projectId, { repositoryId: repoFilter, limit: 10 }),
      listProjectPullRequests(props.projectId, {
        repositoryId: repoFilter,
        state: "open",
        limit: 10,
      }),
    ]);
    commits.value = c.data;
    pullRequests.value = p.data;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load code activity";
  } finally {
    loading.value = false;
  }
}

async function loadRepositories() {
  try {
    repositories.value = await listProjectRepositories(props.projectId);
  } catch {
    repositories.value = [];
  }
}

watch(
  () => props.projectId,
  async () => {
    selectedRepoId.value = "";
    await loadRepositories();
    if (repositories.value.length > 0) await load();
  },
  { immediate: true },
);

watch(selectedRepoId, () => {
  if (repositories.value.length > 0) load();
});

function shortSha(sha: string) {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

function taskHref(task: { id: string; flow: { slug: string } }) {
  return `/tasks/${task.flow.slug}/${task.id}`;
}
</script>

<template>
  <section v-if="repositories.length > 0" class="activity">
    <div class="activity__header">
      <h2>Code activity</h2>
      <label v-if="showRepoFilter" class="activity__filter">
        <span class="activity__filter-label">Repository</span>
        <select
          v-model="selectedRepoId"
          data-testid="activity-repo-filter"
          aria-label="Filter by repository"
        >
          <option value="">All repositories</option>
          <option v-for="r in repositories" :key="r.id" :value="r.id">
            {{ r.owner }}/{{ r.name }}
          </option>
        </select>
      </label>
    </div>

    <p v-if="error" class="activity__error" role="alert">{{ error }}</p>

    <div class="activity__panels">
      <div class="activity__panel">
        <h3>Open pull requests</h3>
        <ul v-if="pullRequests.length" class="activity__list" data-testid="activity-prs">
          <li
            v-for="pr in pullRequests"
            :key="pr.id"
            :data-testid="`activity-pr-${pr.id}`"
            class="activity__item"
          >
            <a :href="pr.url" target="_blank" rel="noopener" class="activity__link">
              <span v-if="pr.repository" class="activity__repo">
                {{ pr.repository.owner }}/{{ pr.repository.name }}
              </span>
              <span class="activity__number">#{{ pr.number }}</span>
              <span v-if="pr.title" class="activity__title">{{ pr.title }}</span>
              <span class="activity__state" :class="`state--${pr.state}`">{{ pr.state }}</span>
            </a>
            <router-link
              v-if="pr.task"
              :to="taskHref(pr.task)"
              class="activity__task"
              :data-testid="`activity-pr-task-${pr.id}`"
            >
              {{ pr.task.displayId }} · {{ pr.task.title }}
            </router-link>
          </li>
        </ul>
        <p v-else class="activity__empty" data-testid="activity-prs-empty">
          No open pull requests.
        </p>
      </div>

      <div class="activity__panel">
        <h3>Recent commits</h3>
        <ul v-if="commits.length" class="activity__list" data-testid="activity-commits">
          <li
            v-for="c in commits"
            :key="c.id"
            :data-testid="`activity-commit-${c.id}`"
            class="activity__item"
          >
            <a :href="c.url" target="_blank" rel="noopener" class="activity__link">
              <span v-if="c.repository" class="activity__repo">
                {{ c.repository.owner }}/{{ c.repository.name }}
              </span>
              <span class="activity__sha">{{ shortSha(c.sha) }}</span>
              <span v-if="c.message" class="activity__title">{{ c.message }}</span>
            </a>
            <router-link
              v-if="c.task"
              :to="taskHref(c.task)"
              class="activity__task"
              :data-testid="`activity-commit-task-${c.id}`"
            >
              {{ c.task.displayId }} · {{ c.task.title }}
            </router-link>
          </li>
        </ul>
        <p v-else class="activity__empty" data-testid="activity-commits-empty">
          No commits linked yet.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.activity {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.activity__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.activity__header h2 {
  font-size: 1rem;
  font-weight: 600;
}
.activity__filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}
.activity__filter-label {
  color: var(--text-secondary);
}
.activity__filter select {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.8125rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.activity__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
}
.activity__panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 720px) {
  .activity__panels {
    grid-template-columns: 1fr;
  }
}
.activity__panel {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}
.activity__panel h3 {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0;
}
.activity__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.activity__item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
  min-width: 0;
}
.activity__link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}
.activity__link:hover .activity__title,
.activity__link:hover .activity__sha,
.activity__link:hover .activity__number {
  text-decoration: underline;
}
.activity__repo {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.activity__sha,
.activity__number {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
}
.activity__title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}
.activity__state {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: var(--bg-secondary, #f1f1f1);
}
.activity__state.state--merged {
  background: var(--accent, #6f42c1);
  color: white;
}
.activity__state.state--closed {
  background: var(--priority-low, #888);
  color: white;
}
.activity__task {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-decoration: none;
}
.activity__task:hover {
  text-decoration: underline;
}
.activity__empty {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-style: italic;
}
</style>
