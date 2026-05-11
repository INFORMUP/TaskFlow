<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useOrg } from "@/composables/useOrg";
import {
  listFeedback,
  archiveFeedback,
  updateFeedbackNotes,
  exportFeedbackCsv,
  promoteFeedback,
  type FeedbackWithUser,
} from "@/api/feedback.api";
import { listProjects, type Project } from "@/api/projects.api";
import { listFlows, type Flow } from "@/api/flows.api";
import FeedbackTypeBadge from "../components/FeedbackTypeBadge.vue";

const PAGE_SIZE = 20;
const MESSAGE_EXCERPT_LENGTH = 80;
const SAVED_INDICATOR_MS = 1500;
const TYPE_TO_FLOW_SLUG: Record<string, string> = {
  BUG: "bug",
  FEATURE: "feature",
  IMPROVEMENT: "improvement",
};

const org = useOrg();
const router = useRouter();

const rows = ref<FeedbackWithUser[]>([]);
const projects = ref<Project[]>([]);
const flows = ref<Flow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const total = ref(0);

const filterArchived = ref(false);
const currentPage = ref(1);
const expandedId = ref<string | null>(null);
const notesDraft = ref<Record<string, string>>({});
const notesInitial = ref<Record<string, string>>({});
const savedFlag = ref<Record<string, boolean>>({});
const exporting = ref(false);
const promotingId = ref<string | null>(null);
const projectChoice = ref<Record<string, string>>({});
const flowChoice = ref<Record<string, string>>({});

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
      page: currentPage.value,
      limit: PAGE_SIZE,
    });
    rows.value = res.data;
    total.value = res.total;
    notesInitial.value = {};
    notesDraft.value = {};
    flowChoice.value = {};
    for (const r of res.data) {
      notesInitial.value[r.id] = r.adminNotes ?? "";
      notesDraft.value[r.id] = r.adminNotes ?? "";
      flowChoice.value[r.id] = TYPE_TO_FLOW_SLUG[r.type];
    }
  } catch (e: any) {
    error.value = e?.error?.message || e?.message || "Failed to load feedback";
  } finally {
    loading.value = false;
  }
}

async function loadProjects() {
  try {
    projects.value = await listProjects();
  } catch (e: any) {
    // Non-fatal — the rest of the view still works; promote button just won't
    // have any targets to choose from.
    error.value = e?.error?.message || "Failed to load projects";
  }
}

async function loadFlows() {
  try {
    flows.value = await listFlows();
  } catch (e: any) {
    error.value = e?.error?.message || "Failed to load flows";
  }
}

async function handleArchiveToggle(row: FeedbackWithUser) {
  const next = !row.archivedAt;
  try {
    const updated = await archiveFeedback(row.id, next);
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

async function handlePromote(row: FeedbackWithUser) {
  const projectId = projectChoice.value[row.id];
  if (!projectId) {
    error.value = "Pick a project before promoting.";
    return;
  }
  const flowSlug = flowChoice.value[row.id] || targetFlowSlug(row);
  promotingId.value = row.id;
  try {
    const updated = await promoteFeedback(row.id, projectId, flowSlug);
    Object.assign(row, updated);
  } catch (e: any) {
    error.value = e?.error?.message || "Promote failed";
  } finally {
    promotingId.value = null;
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

function excerpt(s: string, length: number = MESSAGE_EXCERPT_LENGTH): string {
  return s.length > length ? s.slice(0, length - 1) + "…" : s;
}

function goToPage(p: number) {
  const target = Math.min(Math.max(1, p), pageCount.value);
  if (target === currentPage.value) return;
  currentPage.value = target;
}

function targetFlowSlug(row: FeedbackWithUser): string {
  return TYPE_TO_FLOW_SLUG[row.type];
}

function linkedTaskFlowSlug(row: FeedbackWithUser): string {
  return row.task?.flow.slug ?? targetFlowSlug(row);
}

onMounted(() => {
  if (isMember.value) {
    router.replace("/");
    return;
  }
  load();
  loadProjects();
  loadFlows();
});

watch(filterArchived, () => {
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
          Submissions from the in-app feedback bubble. Promote a row into a
          task when it deserves engineering work, archive it when it's been
          handled.
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
            <th>Task</th>
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
                <a
                  v-if="row.taskId"
                  :href="`/tasks/${linkedTaskFlowSlug(row)}/${row.taskId}`"
                  class="feedback-admin__task-chip"
                  :data-testid="`feedback-task-link-${row.id}`"
                  @click.stop
                >
                  View task
                </a>
                <span v-else class="feedback-admin__task-none">—</span>
              </td>
            </tr>
            <tr
              v-if="expandedId === row.id"
              class="feedback-admin__row-expanded"
              :data-testid="`feedback-expanded-${row.id}`"
            >
              <td colspan="6">
                <div class="feedback-admin__expanded-grid">
                  <div>
                    <h3 class="feedback-admin__expanded-heading">Full message</h3>
                    <p class="feedback-admin__expanded-message">{{ row.message }}</p>
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
                      <template v-if="!row.taskId">
                        <select
                          v-model="projectChoice[row.id]"
                          class="feedback-admin__project-select"
                          :data-testid="`feedback-project-select-${row.id}`"
                        >
                          <option value="" disabled>Pick a project…</option>
                          <option
                            v-for="p in projects"
                            :key="p.id"
                            :value="p.id"
                          >
                            {{ p.key }} — {{ p.name }}
                          </option>
                        </select>
                        <select
                          v-model="flowChoice[row.id]"
                          class="feedback-admin__project-select"
                          :data-testid="`feedback-flow-select-${row.id}`"
                        >
                          <option
                            v-for="f in flows"
                            :key="f.id"
                            :value="f.slug"
                          >
                            {{ f.name }}
                          </option>
                        </select>
                        <button
                          type="button"
                          :disabled="
                            !projectChoice[row.id] || promotingId === row.id
                          "
                          :data-testid="`feedback-promote-${row.id}`"
                          @click="handlePromote(row)"
                        >
                          {{
                            promotingId === row.id
                              ? "Promoting…"
                              : `Promote to ${flowChoice[row.id] || targetFlowSlug(row)} task`
                          }}
                        </button>
                      </template>
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
  padding: 0.125rem 0.5rem;
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--accent);
  text-decoration: none;
  font-size: 0.75rem;
  border: 1px solid var(--border-soft);
}

.feedback-admin__task-chip:hover {
  background: var(--bg-secondary);
}

.feedback-admin__task-none {
  color: var(--text-secondary);
  font-size: 0.75rem;
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
  flex-wrap: wrap;
  align-items: center;
}

.feedback-admin__expanded-actions button {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
}

.feedback-admin__expanded-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feedback-admin__expanded-actions button:hover:not(:disabled) {
  background: var(--bg-secondary);
}

.feedback-admin__project-select {
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  min-width: 12rem;
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
