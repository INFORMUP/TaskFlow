<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getTask, type Task } from "@/api/tasks.api";
import { getTransitions, createTransition, type Transition } from "@/api/transitions.api";
import { getComments, createComment, deleteComment, type Comment } from "@/api/comments.api";
import { apiFetch } from "@/api/client";
import MarkdownView from "@/features/tasks/components/MarkdownView.vue";
import ActorLabel from "@/components/ActorLabel.vue";

const route = useRoute();
const router = useRouter();
const taskId = route.params.taskId as string;

const task = ref<Task | null>(null);
const transitions = ref<Transition[]>([]);
const comments = ref<Comment[]>([]);
const loading = ref(true);

// Transition form state
const transitionStatus = ref("");
const transitionNote = ref("");
const transitionResolution = ref("");
const transitionReassignee = ref("");
const transitionError = ref("");

// Comment form state
const newComment = ref("");

// Users (for reassign dropdown)
const users = ref<{ id: string; displayName: string }[]>([]);

const RESOLUTIONS: Record<string, string[]> = {
  bug: ["fixed", "invalid", "duplicate", "wont_fix", "cannot_reproduce"],
  feature: ["completed", "rejected", "duplicate", "deferred"],
  improvement: ["completed", "wont_fix", "deferred"],
};

async function loadAll() {
  loading.value = true;
  try {
    const [t, tr, c] = await Promise.all([
      getTask(taskId),
      getTransitions(taskId),
      getComments(taskId),
    ]);
    task.value = t;
    transitions.value = tr.data;
    comments.value = c.data;
  } finally {
    loading.value = false;
  }
}

async function handleTransition() {
  if (!transitionNote.value.trim()) {
    transitionError.value = "Note is required";
    return;
  }
  transitionError.value = "";
  try {
    await createTransition(taskId, {
      toStatus: transitionStatus.value,
      note: transitionNote.value,
      ...(transitionStatus.value === "closed" && { resolution: transitionResolution.value }),
      ...(transitionReassignee.value && { newAssigneeUserId: transitionReassignee.value }),
    });
    transitionStatus.value = "";
    transitionNote.value = "";
    transitionResolution.value = "";
    transitionReassignee.value = "";
    await loadAll();
  } catch (e: any) {
    transitionError.value = e?.error?.message || "Transition failed";
  }
}

async function handleAddComment() {
  if (!newComment.value.trim()) return;
  await createComment(taskId, newComment.value);
  newComment.value = "";
  const c = await getComments(taskId);
  comments.value = c.data;
}

async function handleDeleteComment(commentId: string) {
  await deleteComment(taskId, commentId);
  const c = await getComments(taskId);
  comments.value = c.data;
}

function goBack() {
  router.push(`/tasks/${route.params.flow}`);
}

onMounted(async () => {
  await loadAll();
  try {
    users.value = (await apiFetch<{ data: any[] }>("/api/v1/users")).data;
  } catch {
    users.value = [];
  }
});
</script>

<template>
  <div v-if="loading" class="detail__loading">Loading...</div>
  <div v-else-if="task" class="detail">
    <button class="detail__back" @click="goBack">&larr; Back</button>

    <div class="detail__header">
      <span class="detail__id">{{ task.displayId }}</span>
      <span class="detail__status">{{ task.currentStatus.name }}</span>
      <span class="detail__priority" :class="`priority--${task.priority}`">
        {{ task.priority }}
      </span>
    </div>

    <h1 class="detail__title">{{ task.title }}</h1>

    <div v-if="task.projects.length > 0" class="detail__projects">
      <span
        v-for="p in task.projects"
        :key="p.id"
        class="detail__project-chip"
        :title="`Owner: ${p.owner.displayName}`"
      >
        <strong>{{ p.key }}</strong> · {{ p.name }}
      </span>
    </div>

    <MarkdownView
      v-if="task.description"
      :source="task.description"
      class="detail__description"
    />

    <div class="detail__meta">
      <div>Created by: <ActorLabel :actor="task.creator" /></div>
      <div v-if="task.assignee">
        Assigned to: <ActorLabel :actor="task.assignee" />
      </div>
      <div v-if="task.dueDate">Due: {{ new Date(task.dueDate).toLocaleDateString() }}</div>
      <div v-if="task.resolution">Resolution: {{ task.resolution }}</div>
    </div>

    <!-- Transition form -->
    <div class="detail__section" v-if="task.currentStatus.slug !== 'closed'">
      <h3>Transition</h3>
      <div v-if="transitionError" class="detail__error">{{ transitionError }}</div>
      <select v-model="transitionStatus" class="detail__select">
        <option value="">Select status...</option>
        <option value="closed">Closed</option>
      </select>
      <textarea
        v-model="transitionNote"
        placeholder="Transition note (required)"
        class="detail__textarea"
        rows="2"
      />
      <select
        v-if="transitionStatus === 'closed'"
        v-model="transitionResolution"
        class="detail__select"
      >
        <option value="">Select resolution...</option>
        <option
          v-for="r in RESOLUTIONS[task.flow.slug] || []"
          :key="r"
          :value="r"
        >
          {{ r }}
        </option>
      </select>
      <select v-model="transitionReassignee" class="detail__select">
        <option value="">Reassign to... (optional)</option>
        <option v-for="u in users" :key="u.id" :value="u.id">
          {{ u.displayName }}
        </option>
      </select>
      <button
        class="detail__btn"
        :disabled="!transitionStatus || !transitionNote.trim()"
        @click="handleTransition"
      >
        Transition
      </button>
    </div>

    <!-- Transition history -->
    <div class="detail__section">
      <h3>History</h3>
      <div class="timeline">
        <div v-for="t in transitions" :key="t.id" class="timeline__item">
          <div class="timeline__header">
            <span class="timeline__actor">
              <ActorLabel :actor="t.actor" />
            </span>
            <span class="timeline__date">{{ new Date(t.createdAt).toLocaleString() }}</span>
          </div>
          <div class="timeline__transition">
            <span v-if="t.fromStatus">{{ t.fromStatus.name }}</span>
            <span v-else>Created</span>
            &rarr; {{ t.toStatus.name }}
            <span v-if="t.newAssignee" class="timeline__reassign">
              · reassigned to <ActorLabel :actor="t.newAssignee" />
            </span>
          </div>
          <div class="timeline__note">{{ t.note }}</div>
        </div>
      </div>
    </div>

    <!-- Comments -->
    <div class="detail__section">
      <h3>Comments</h3>
      <div class="comments">
        <div v-for="c in comments" :key="c.id" class="comment">
          <div class="comment__header">
            <span class="comment__author">
              <ActorLabel :actor="c.author" />
            </span>
            <span class="comment__date">{{ new Date(c.createdAt).toLocaleString() }}</span>
            <button class="comment__delete" @click="handleDeleteComment(c.id)">Delete</button>
          </div>
          <div class="comment__body">{{ c.body }}</div>
        </div>
      </div>
      <div class="comment-form">
        <textarea
          v-model="newComment"
          placeholder="Add a comment..."
          class="detail__textarea"
          rows="2"
        />
        <button
          class="detail__btn"
          :disabled="!newComment.trim()"
          @click="handleAddComment"
        >
          Comment
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail__loading {
  text-align: center;
  padding: 2rem;
}

.detail__back {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  margin-bottom: 1rem;
  font-weight: 500;
}

.detail__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.detail__id {
  font-weight: 600;
  color: var(--text-secondary);
}

.detail__status {
  background: var(--accent);
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.detail__priority {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.priority--critical { color: var(--priority-critical); }
.priority--high { color: var(--priority-high); }
.priority--medium { color: var(--priority-medium); }
.priority--low { color: var(--priority-low); }

.detail__title {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.detail__description {
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.detail__projects {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.detail__project-chip {
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.05));
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.detail__project-chip strong {
  color: var(--accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.timeline__reassign {
  color: var(--text-secondary);
  font-style: italic;
}

.detail__meta {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
  display: flex;
  gap: 1.5rem;
}

.detail__section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-primary);
}

.detail__section h3 {
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.detail__error {
  color: var(--priority-critical);
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.detail__select,
.detail__textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.detail__btn {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.detail__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.timeline__item {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-soft);
}

.timeline__header {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.timeline__actor {
  font-weight: 600;
}

.timeline__date {
  color: var(--text-secondary);
}

.timeline__transition {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0.25rem 0;
}

.timeline__note {
  font-size: 0.875rem;
  white-space: pre-wrap;
}

.comment {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-soft);
}

.comment__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  margin-bottom: 0.25rem;
}

.comment__author {
  font-weight: 600;
}

.comment__date {
  color: var(--text-secondary);
}

.comment__delete {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--priority-critical);
  cursor: pointer;
  font-size: 0.75rem;
}

.comment__body {
  white-space: pre-wrap;
}

.comment-form {
  margin-top: 0.75rem;
}
</style>
