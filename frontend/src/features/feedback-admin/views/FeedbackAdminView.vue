<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useOrg } from "@/composables/useOrg";
import {
  listFeedback,
  retryFeedbackLink,
  archiveFeedback,
  updateFeedbackNotes,
  exportFeedbackCsv,
  type FeedbackWithUser,
  type TaskLinkStatus,
} from "@/api/feedback.api";
import FeedbackStatusBadge from "../components/FeedbackStatusBadge.vue";
import FeedbackTypeBadge from "../components/FeedbackTypeBadge.vue";

const PAGE_SIZE = 20;
const MESSAGE_EXCERPT_LENGTH = 80;
const SAVED_INDICATOR_MS = 1500;

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

const org = useOrg();
const router = useRouter();

const rows = ref<FeedbackWithUser[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const total = ref(0);

const filterStatus = ref<TaskLinkStatus | "">("");
const filterArchived = ref(false);
const currentPage = ref(1);
const retryingId = ref<string | null>(null);
const expandedId = ref<string | null>(null);
const notesDraft = ref<Record<string, string>>({});
const notesInitial = ref<Record<string, string>>({});
const savedFlag = ref<Record<string, boolean>>({});
const exporting = ref(false);

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const canPrev = computed(() => currentPage.value > 1);
const canNext = computed(() => currentPage.value < pageCount.value);
const isMember = computed(() => org.activeOrg.value?.role === "member");

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await listFeedback({
      archived: filterArchived.value,
      taskLinkStatus: filterStatus.value || undefined,
      page: currentPage.value,
      limit: PAGE_SIZE,
    });
    rows.value = res.data;
    total.value = res.total;
    // Reset notes drafts to reflect freshly-loaded server state.
    notesInitial.value = {};
    notesDraft.value = {};
    for (const r of res.data) {
      notesInitial.value[r.id] = r.adminNotes ?? "";
      notesDraft.value[r.id] = r.adminNotes ?? "";
    }
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
    // Whether toggled to archived or active, the row no longer belongs in the
    // currently-displayed list — drop it so the user sees the move land.
    rows.value = rows.value.filter((r) => r.id !== updated.id);
    total.value = Math.max(0, total.value - 1);
    if (expandedId.value === updated.id) expandedId.value = null;
  } catch (e: any) {
    error.value = e?.error?.message || "Archive toggle failed";
  }
}

function toggleExpand(row: FeedbackWithUser) {
  expandedId.value = expandedId.value === row.id ? null : row.id;
}

async function saveNotes(row: FeedbackWithUser) {
  const draft = notesDraft.value[row.id] ?? "";
  const initial = notesInitial.value[row.id] ?? "";
  if (draft === initial) return;
  try {
    const updated = await updateFeedbackNotes(row.id, draft);
    Object.assign(row, updated);
    notesInitial.value[row.id] = updated.adminNotes ?? "";
    savedFlag.value = { ...savedFlag.value, [row.id]: true };
    window.setTimeout(() => {
      const next = { ...savedFlag.value };
      delete next[row.id];
      savedFlag.value = next;
    }, SAVED_INDICATOR_MS);
  } catch (e: any) {
    error.value = e?.error?.message || "Notes save failed";
  }
}

async function handleExport() {
  exporting.value = true;
  try {
    const blob = await exportFeedbackCsv();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "feedback-export.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    error.value = e?.error?.message || "Export failed";
  } finally {
    exporting.value = false;
  }
}

function isFailed(s: TaskLinkStatus): boolean {
  return s === "failed_create" || s === "failed_link";
}

function excerpt(s: string, length: number = MESSAGE_EXCERPT_LENGTH): string {
  return s.length > length ? s.slice(0, length - 1) + "…" : s;
}

function goToPage(p: number) {
  const target = Math.min(Math.max(1, p), pageCount.value);
  if (target === currentPage.value) return;
  currentPage.value = target;
}

onMounted(() => {
  if (isMember.value) {
    router.replace("/");
    return;
  }
  load();
});

watch([filterStatus, filterArchived], () => {
  currentPage.value = 1;
  if (!isMember.value) load();
});

watch(currentPage, () => {
  if (!isMember.value) load();
});
</script>

<template>
  <main v-if="!isMember" class="feedback-admin" data-testid="feedback-admin-view">
    <header class="feedback-admin__header">
      <div>
        <h1>Feedback</h1>
        <p class="feedback-admin__hint">
          Submissions from the in-app feedback bubble. Status reflects whether
          the submission was translated into a TaskFlow task.
        </p>
      </div>
      <button
        type="button"
        class="feedback-admin__export"
        :disabled="exporting"
        data-testid="feedback-export"
        @click="handleExport"
      >
        {{ exporting ? "Exporting…" : "Export CSV" }}
      </button>
    </header>

    <div class="feedback-admin__filters">
      <label class="feedback-admin__filter">
        <span>Status</span>
        <select v-model="filterStatus" data-testid="feedback-status-filter">
          <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label class="feedback-admin__filter">
        <input
          type="checkbox"
          v-model="filterArchived"
          data-testid="feedback-archived-toggle"
        />
        <span>Show archived only</span>
      </label>
      <span v-if="!loading" class="feedback-admin__total">{{ total }} item(s)</span>
    </div>

    <p v-if="error" class="feedback-admin__error">{{ error }}</p>
    <p v-if="loading">Loading…</p>

    <template v-else>
      <div
        v-if="rows.length === 0"
        class="feedback-admin__empty"
        data-testid="feedback-empty"
      >
        {{ filterArchived ? "No archived feedback." : "No feedback yet." }}
      </div>

      <table v-else class="feedback-admin__table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Message</th>
            <th>Page</th>
            <th>Submitted by</th>
            <th>Date</th>
            <th>Link status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr
              class="feedback-admin__row"
              :class="{ 'feedback-admin__row--open': expandedId === row.id }"
              :data-testid="`feedback-row-${row.id}`"
              @click="toggleExpand(row)"
            >
              <td>
                <FeedbackTypeBadge
                  :type="row.type"
                  :data-testid="`feedback-type-${row.id}`"
                />
              </td>
              <td :title="row.message" class="feedback-admin__message">
                {{ excerpt(row.message) }}
              </td>
              <td>
                <a
                  v-if="row.page"
                  :href="row.page"
                  class="feedback-admin__page-link"
                  @click.stop
                >
                  {{ row.page }}
                </a>
                <span v-else>—</span>
              </td>
              <td>{{ row.user.displayName }}</td>
              <td>{{ new Date(row.createdAt).toLocaleDateString() }}</td>
              <td>
                <FeedbackStatusBadge :status="row.taskLinkStatus" />
                <a
                  v-if="row.taskId"
                  :href="`/tasks/feature/${row.taskId}`"
                  class="feedback-admin__task-chip"
                  @click.stop
                >
                  task
                </a>
              </td>
              <td class="feedback-admin__row-actions" @click.stop>
                <button
                  v-if="isFailed(row.taskLinkStatus)"
                  type="button"
                  :disabled="retryingId === row.id"
                  :data-testid="`feedback-retry-${row.id}`"
                  @click="handleRetry(row)"
                >
                  {{ retryingId === row.id ? "Retrying…" : "Retry" }}
                </button>
              </td>
            </tr>
            <tr
              v-if="expandedId === row.id"
              class="feedback-admin__row-expanded"
              :data-testid="`feedback-expanded-${row.id}`"
            >
              <td colspan="7">
                <div class="feedback-admin__expanded-grid">
                  <div>
                    <h3 class="feedback-admin__expanded-heading">Full message</h3>
                    <p class="feedback-admin__expanded-message">{{ row.message }}</p>
                    <p
                      v-if="row.taskLinkError"
                      class="feedback-admin__expanded-error"
                    >
                      Link error: {{ row.taskLinkError }}
                    </p>
                  </div>
                  <div>
                    <label class="feedback-admin__notes-label">
                      <span>
                        Admin notes
                        <span
                          v-if="savedFlag[row.id]"
                          class="feedback-admin__saved"
                          role="status"
                          :data-testid="`feedback-saved-${row.id}`"
                        >
                          Saved
                        </span>
                      </span>
                      <textarea
                        v-model="notesDraft[row.id]"
                        rows="4"
                        class="feedback-admin__notes"
                        :data-testid="`feedback-notes-${row.id}`"
                        @blur="saveNotes(row)"
                      />
                    </label>
                    <div class="feedback-admin__expanded-actions">
                      <button
                        type="button"
                        :data-testid="`feedback-archive-toggle-${row.id}`"
                        @click="handleArchiveToggle(row)"
                      >
                        {{ row.archivedAt ? "Unarchive" : "Archive" }}
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <nav
        v-if="rows.length > 0"
        class="feedback-admin__pagination"
        data-testid="feedback-pagination"
        aria-label="Feedback pagination"
      >
        <button
          type="button"
          :disabled="!canPrev"
          data-testid="feedback-prev"
          @click="goToPage(currentPage - 1)"
        >
          ‹ Prev
        </button>
        <span>Page {{ currentPage }} of {{ pageCount }}</span>
        <button
          type="button"
          :disabled="!canNext"
          data-testid="feedback-next"
          @click="goToPage(currentPage + 1)"
        >
          Next ›
        </button>
      </nav>
    </template>
  </main>
</template>

<style scoped>
.feedback-admin {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.feedback-admin__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.feedback-admin__header h1 {
  margin: 0 0 0.25rem 0;
}

.feedback-admin__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.feedback-admin__export {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.8125rem;
  white-space: nowrap;
}

.feedback-admin__export:hover:not(:disabled) {
  background: var(--accent-hover);
}

.feedback-admin__export:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.feedback-admin__filters {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.feedback-admin__filter {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.feedback-admin__total {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.feedback-admin__error {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
}

.feedback-admin__empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 3rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
}

.feedback-admin__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.feedback-admin__table th,
.feedback-admin__table td {
  padding: 0.625rem 0.5rem;
  border-bottom: 1px solid var(--border-soft);
  text-align: left;
  vertical-align: middle;
}

.feedback-admin__table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.feedback-admin__row {
  cursor: pointer;
}

.feedback-admin__row:hover {
  background: var(--bg-secondary);
}

.feedback-admin__row--open {
  background: var(--bg-secondary);
}

.feedback-admin__message {
  max-width: 32rem;
}

.feedback-admin__page-link {
  color: var(--accent);
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.75rem;
}

.feedback-admin__page-link:hover {
  text-decoration: underline;
}

.feedback-admin__task-chip {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--accent);
  text-decoration: none;
  font-size: 0.6875rem;
  border: 1px solid var(--border-soft);
}

.feedback-admin__row-actions {
  text-align: right;
}

.feedback-admin__row-expanded > td {
  background: var(--bg-secondary);
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-soft);
}

.feedback-admin__expanded-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 720px) {
  .feedback-admin__expanded-grid {
    grid-template-columns: 1fr;
  }
}

.feedback-admin__expanded-heading {
  margin: 0 0 0.5rem 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.feedback-admin__expanded-message {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.875rem;
  line-height: 1.45;
}

.feedback-admin__expanded-error {
  margin-top: 0.5rem;
  color: #991b1b;
  font-size: 0.75rem;
}

.feedback-admin__notes-label {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.feedback-admin__notes {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;
}

.feedback-admin__saved {
  display: inline-block;
  margin-left: 0.5rem;
  color: var(--priority-low, #166534);
  font-weight: 600;
  font-size: 0.6875rem;
  text-transform: none;
  letter-spacing: 0;
}

.feedback-admin__expanded-actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
}

.feedback-admin__expanded-actions button {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
}

.feedback-admin__expanded-actions button:hover {
  background: var(--bg-secondary);
}

.feedback-admin__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.25rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.feedback-admin__pagination button {
  padding: 0.25rem 0.625rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.feedback-admin__pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
