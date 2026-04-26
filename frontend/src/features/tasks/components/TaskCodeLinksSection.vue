<script setup lang="ts">
import { ref, watch } from "vue";
import {
  createTaskCommit,
  createTaskPullRequest,
  deleteTaskCommit,
  deleteTaskPullRequest,
  listTaskCommits,
  listTaskPullRequests,
  type TaskCommit,
  type TaskPullRequest,
} from "@/api/task-code-links.api";

const props = defineProps<{ taskId: string }>();

const commits = ref<TaskCommit[]>([]);
const pullRequests = ref<TaskPullRequest[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

const newCommitInput = ref("");
const newPrInput = ref("");

async function load() {
  error.value = null;
  try {
    const [c, p] = await Promise.all([
      listTaskCommits(props.taskId),
      listTaskPullRequests(props.taskId),
    ]);
    commits.value = c;
    pullRequests.value = p;
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load code links";
  }
}

watch(() => props.taskId, load, { immediate: true });

function buildCommitPayload(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed };
  if (/^[a-f0-9]{7,40}$/i.test(trimmed)) return { sha: trimmed };
  return null;
}

function buildPrPayload(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed };
  const num = parseInt(trimmed.replace(/^#/, ""), 10);
  if (Number.isInteger(num) && num > 0) return { number: num };
  return null;
}

async function handleAddCommit() {
  const payload = buildCommitPayload(newCommitInput.value);
  if (!payload) {
    error.value = "Enter a commit URL or SHA";
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const created = await createTaskCommit(props.taskId, payload);
    commits.value = [created, ...commits.value];
    newCommitInput.value = "";
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to link commit";
  } finally {
    busy.value = false;
  }
}

async function handleAddPr() {
  const payload = buildPrPayload(newPrInput.value);
  if (!payload) {
    error.value = "Enter a PR URL or number";
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    const created = await createTaskPullRequest(props.taskId, payload);
    pullRequests.value = [created, ...pullRequests.value];
    newPrInput.value = "";
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to link pull request";
  } finally {
    busy.value = false;
  }
}

async function handleRemoveCommit(id: string) {
  busy.value = true;
  error.value = null;
  try {
    await deleteTaskCommit(props.taskId, id);
    commits.value = commits.value.filter((c) => c.id !== id);
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to remove commit";
  } finally {
    busy.value = false;
  }
}

async function handleRemovePr(id: string) {
  busy.value = true;
  error.value = null;
  try {
    await deleteTaskPullRequest(props.taskId, id);
    pullRequests.value = pullRequests.value.filter((p) => p.id !== id);
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to remove pull request";
  } finally {
    busy.value = false;
  }
}

function shortSha(sha: string) {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}
</script>

<template>
  <section class="code-links">
    <h3>Code</h3>
    <p v-if="error" class="code-links__error" role="alert">{{ error }}</p>

    <div class="code-links__group">
      <h4>Pull requests</h4>
      <ul v-if="pullRequests.length" class="code-links__list">
        <li
          v-for="p in pullRequests"
          :key="p.id"
          :data-testid="`pr-row-${p.id}`"
          class="code-links__item"
        >
          <a :href="p.url" target="_blank" rel="noopener" class="code-links__link">
            <span class="code-links__repo" v-if="p.repository">
              {{ p.repository.owner }}/{{ p.repository.name }}
            </span>
            <span class="code-links__number">#{{ p.number }}</span>
            <span v-if="p.title" class="code-links__title">{{ p.title }}</span>
            <span class="code-links__state" :class="`state--${p.state}`">{{ p.state }}</span>
          </a>
          <button
            type="button"
            class="code-links__remove"
            :data-testid="`pr-remove-${p.id}`"
            :disabled="busy"
            :aria-label="`Unlink pull request #${p.number}`"
            @click="handleRemovePr(p.id)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="code-links__empty">No pull requests linked yet.</p>

      <div class="code-links__add">
        <input
          v-model="newPrInput"
          type="text"
          placeholder="PR URL or number"
          data-testid="pr-input"
          aria-label="Pull request URL or number"
          :disabled="busy"
          @keydown.enter.prevent="handleAddPr"
        />
        <button
          type="button"
          data-testid="pr-add-button"
          :disabled="busy || !newPrInput.trim()"
          @click="handleAddPr"
        >
          Link PR
        </button>
      </div>
    </div>

    <div class="code-links__group">
      <h4>Commits</h4>
      <ul v-if="commits.length" class="code-links__list">
        <li
          v-for="c in commits"
          :key="c.id"
          :data-testid="`commit-row-${c.id}`"
          class="code-links__item"
        >
          <a :href="c.url" target="_blank" rel="noopener" class="code-links__link">
            <span class="code-links__repo" v-if="c.repository">
              {{ c.repository.owner }}/{{ c.repository.name }}
            </span>
            <span class="code-links__sha">{{ shortSha(c.sha) }}</span>
            <span v-if="c.message" class="code-links__title">{{ c.message }}</span>
          </a>
          <button
            type="button"
            class="code-links__remove"
            :data-testid="`commit-remove-${c.id}`"
            :disabled="busy"
            :aria-label="`Unlink commit ${shortSha(c.sha)}`"
            @click="handleRemoveCommit(c.id)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="code-links__empty">No commits linked yet.</p>

      <div class="code-links__add">
        <input
          v-model="newCommitInput"
          type="text"
          placeholder="Commit URL or SHA"
          data-testid="commit-input"
          aria-label="Commit URL or SHA"
          :disabled="busy"
          @keydown.enter.prevent="handleAddCommit"
        />
        <button
          type="button"
          data-testid="commit-add-button"
          :disabled="busy || !newCommitInput.trim()"
          @click="handleAddCommit"
        >
          Link commit
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.code-links {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.code-links h3 {
  font-size: 1rem;
  font-weight: 600;
}
.code-links h4 {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0.5rem 0 0.25rem;
}
.code-links__group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.code-links__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
}
.code-links__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.code-links__item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
}
.code-links__link {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex: 1;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}
.code-links__link:hover .code-links__title,
.code-links__link:hover .code-links__sha,
.code-links__link:hover .code-links__number {
  text-decoration: underline;
}
.code-links__repo {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.code-links__sha,
.code-links__number {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
}
.code-links__title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}
.code-links__state {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: var(--bg-secondary, #f1f1f1);
}
.code-links__state.state--merged {
  background: var(--accent, #6f42c1);
  color: white;
}
.code-links__state.state--closed {
  background: var(--priority-low, #888);
  color: white;
}
.code-links__empty {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-style: italic;
}
.code-links__add {
  display: flex;
  gap: 0.375rem;
  align-items: center;
}
.code-links__add input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 0.875rem;
}
.code-links__add button,
.code-links__remove {
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  cursor: pointer;
}
.code-links__add button:disabled,
.code-links__remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
