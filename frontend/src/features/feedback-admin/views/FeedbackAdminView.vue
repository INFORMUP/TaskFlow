<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import {
  listFeedback,
  retryFeedbackLink,
  archiveFeedback,
  updateFeedbackNotes,
  type FeedbackWithUser,
  type TaskLinkStatus,
} from "@/api/feedback.api";
import FeedbackStatusBadge from "../components/FeedbackStatusBadge.vue";

const STATUS_OPTIONS: Array<{ value: TaskLinkStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "linked", label: "Linked" },
  { value: "skipped_no_config", label: "Skipped: no config" },
  { value: "skipped_no_project", label: "Skipped: no project" },
  { value: "skipped_no_flow", label: "Skipped: no flow" },
  { value: "failed_create", label: "Failed: create" },
  { value: "failed_link", label: "Failed: link" },
  { value: "pending", label: "Pending" },
];

const rows = ref<FeedbackWithUser[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const total = ref(0);

const filterStatus = ref<TaskLinkStatus | "">("");
const filterArchived = ref(false);
const retryingId = ref<string | null>(null);
const editingNotesId = ref<string | null>(null);
const notesDraft = ref("");

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await listFeedback({
      archived: filterArchived.value,
      taskLinkStatus: filterStatus.value || undefined,
      limit: 50,
    });
    rows.value = res.data;
    total.value = res.total;
  } catch (e: any) {
    error.value = e?.error?.message || e?.message || "Failed to load feedback";
  } finally {
    loading.value = false;
  }
}

async function handleRetry(row: FeedbackWithUser) {
  retryingId.value = row.id;
  try {
    const updated = await retryFeedbackLink(row.id);
    Object.assign(row, updated);
  } catch (e: any) {
    error.value = e?.error?.message || "Retry failed";
  } finally {
    retryingId.value = null;
  }
}

async function handleArchiveToggle(row: FeedbackWithUser) {
  const next = !row.archivedAt;
  try {
    const updated = await archiveFeedback(row.id, next);
    Object.assign(row, updated);
  } catch (e: any) {
    error.value = e?.error?.message || "Archive toggle failed";
  }
}

function startEditNotes(row: FeedbackWithUser) {
  editingNotesId.value = row.id;
  notesDraft.value = row.adminNotes ?? "";
}

async function saveNotes(row: FeedbackWithUser) {
  try {
    const updated = await updateFeedbackNotes(row.id, notesDraft.value);
    Object.assign(row, updated);
  } catch (e: any) {
    error.value = e?.error?.message || "Notes save failed";
  } finally {
    editingNotesId.value = null;
  }
}

function isFailed(s: TaskLinkStatus): boolean {
  return s === "failed_create" || s === "failed_link";
}

function excerpt(s: string): string {
  return s.length > 100 ? s.slice(0, 99) + "…" : s;
}

onMounted(load);
watch([filterStatus, filterArchived], load);
</script>

<template>
  <main class="feedback-admin">
    <header class="feedback-admin__header">
      <h1>Feedback</h1>
      <p class="feedback-admin__hint">
        Submissions from the in-app feedback bubble. Status reflects whether the
        submission was translated into a TaskFlow task.
      </p>
    </header>

    <div class="feedback-admin__filters">
      <label>
        <span>Status</span>
        <select v-model="filterStatus" data-testid="feedback-status-filter">
          <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label>
        <input type="checkbox" v-model="filterArchived" />
        <span>Show archived only</span>
      </label>
      <span v-if="!loading" class="feedback-admin__total">{{ total }} item(s)</span>
    </div>

    <p v-if="error" class="feedback-admin__error">{{ error }}</p>
    <p v-if="loading">Loading…</p>

    <table v-else class="feedback-admin__table">
      <thead>
        <tr>
          <th>Date</th>
          <th>User</th>
          <th>Type</th>
          <th>Message</th>
          <th>Status</th>
          <th>Linked task</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="rows.length === 0">
          <td colspan="8" class="feedback-admin__empty">No feedback.</td>
        </tr>
        <tr v-for="row in rows" :key="row.id" :data-testid="`feedback-row-${row.id}`">
          <td>{{ new Date(row.createdAt).toLocaleString() }}</td>
          <td>{{ row.user.displayName }}</td>
          <td>{{ row.type }}</td>
          <td :title="row.message">{{ excerpt(row.message) }}</td>
          <td>
            <FeedbackStatusBadge :status="row.taskLinkStatus" />
            <div v-if="row.taskLinkError" class="feedback-admin__err" :title="row.taskLinkError">
              {{ excerpt(row.taskLinkError) }}
            </div>
          </td>
          <td>
            <a
              v-if="row.taskId"
              :href="`/tasks/feature/${row.taskId}`"
              class="feedback-admin__task-chip"
            >
              {{ row.taskId.slice(0, 8) }}
            </a>
            <span v-else>—</span>
          </td>
          <td>
            <template v-if="editingNotesId === row.id">
              <textarea v-model="notesDraft" rows="2" />
              <button type="button" @click="saveNotes(row)">Save</button>
              <button type="button" @click="editingNotesId = null">Cancel</button>
            </template>
            <template v-else>
              <span class="feedback-admin__notes">{{ row.adminNotes || "—" }}</span>
              <button type="button" class="feedback-admin__link" @click="startEditNotes(row)">
                Edit
              </button>
            </template>
          </td>
          <td class="feedback-admin__actions">
            <button
              v-if="isFailed(row.taskLinkStatus)"
              type="button"
              :disabled="retryingId === row.id"
              :data-testid="`feedback-retry-${row.id}`"
              @click="handleRetry(row)"
            >
              {{ retryingId === row.id ? "Retrying…" : "Retry" }}
            </button>
            <button type="button" @click="handleArchiveToggle(row)">
              {{ row.archivedAt ? "Unarchive" : "Archive" }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
.feedback-admin {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.feedback-admin__header h1 {
  margin: 0 0 0.25rem 0;
}

.feedback-admin__hint {
  margin: 0 0 1rem 0;
  color: #6b7280;
  font-size: 0.875rem;
}

.feedback-admin__filters {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.feedback-admin__filters label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.feedback-admin__total {
  margin-left: auto;
  font-size: 0.8125rem;
  color: #6b7280;
}

.feedback-admin__error {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
}

.feedback-admin__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.feedback-admin__table th,
.feedback-admin__table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: top;
}

.feedback-admin__table th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
}

.feedback-admin__empty {
  text-align: center;
  color: #9ca3af;
  padding: 2rem;
}

.feedback-admin__err {
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  color: #991b1b;
  max-width: 14rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feedback-admin__task-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  background: #eef2ff;
  color: #3730a3;
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.75rem;
}

.feedback-admin__notes {
  display: inline-block;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  margin-right: 0.5rem;
}

.feedback-admin__link {
  background: none;
  border: none;
  color: #3730a3;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}

.feedback-admin__actions {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.feedback-admin__actions button {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}
</style>
