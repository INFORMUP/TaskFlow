<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { createTask, getTasks, type Task } from "@/api/tasks.api";
import TaskPicker from "@/features/tasks/components/TaskPicker.vue";
import { listProjects, listProjectFlows, type AttachedFlow, type Project } from "@/api/projects.api";
import { listFlowStatuses, type FlowStatus } from "@/api/flows.api";
import { listLabels, attachLabelToTask, type Label } from "@/api/labels.api";
import { createTransition } from "@/api/transitions.api";
import { listOrgMembers, type OrgMember } from "@/api/org-members.api";

const props = defineProps<{
  flow?: string;
  parentId?: string;
}>();

const emit = defineEmits<{
  created: [task: Task];
  cancel: [];
}>();

const title = ref("");
const description = ref("");
const priority = ref("medium");
const dueDate = ref("");
const selectedProjectIds = ref<string[]>([]);
const assigneeUserId = ref("");
const assigneeTouched = ref(false);
const selectedFlowSlug = ref(props.flow ?? "");
const selectedStatusSlug = ref("");
const selectedLabelIds = ref<string[]>([]);

// Parent (spawned-from) selection
const selectedParentId = ref<string | null>(props.parentId ?? null);
const selectedParentLabel = ref<string | null>(null);
const showParentPicker = ref(false);

const projects = ref<Project[]>([]);
const users = ref<OrgMember[]>([]);
const labels = ref<Label[]>([]);
// Flows attached per project, loaded lazily on selection.
const flowsByProject = ref<Record<string, AttachedFlow[]>>({});
// Statuses per flow slug, loaded lazily once a flow is chosen.
const statusesByFlow = ref<Record<string, FlowStatus[]>>({});

const submitting = ref(false);
const error = ref("");

onMounted(async () => {
  projects.value = await listProjects();
  try {
    users.value = await listOrgMembers();
  } catch {
    users.value = [];
  }
  try {
    labels.value = await listLabels();
  } catch {
    labels.value = [];
  }
  if (selectedParentId.value) {
    // Fire-and-forget: resolving the label must not delay form readiness
    // (assignee autofill, flow/status watchers).
    void resolveParentLabel(selectedParentId.value);
  }
});

async function resolveParentLabel(id: string) {
  try {
    const res = await getTasks({ q: "" });
    const match = res.data.find((t) => t.id === id);
    selectedParentLabel.value = match
      ? `${match.displayId} — ${match.title}`
      : id;
  } catch {
    selectedParentLabel.value = id;
  }
}

function openParentPicker() {
  showParentPicker.value = true;
}

function closeParentPicker() {
  showParentPicker.value = false;
}

function handleParentSelect(taskId: string) {
  selectedParentId.value = taskId;
  closeParentPicker();
  resolveParentLabel(taskId);
}

function clearParent() {
  selectedParentId.value = null;
  selectedParentLabel.value = null;
}

// Auto-fill assignee from the first selected project's default, unless the
// user has manually touched the field. Load flow menus for newly-selected
// projects. Deep watch so array mutations (push/splice) are tracked.
watch(
  selectedProjectIds,
  async (ids) => {
    if (!assigneeTouched.value && ids.length > 0) {
      const first = projects.value.find((p) => p.id === ids[0]);
      if (first?.defaultAssignee) {
        assigneeUserId.value = first.defaultAssignee.id;
      }
    }
    for (const id of ids) {
      if (!flowsByProject.value[id]) {
        try {
          flowsByProject.value[id] = await listProjectFlows(id);
        } catch {
          flowsByProject.value[id] = [];
        }
      }
    }
  },
  { deep: true },
);

// Union of flows across selected projects, deduped by slug.
const availableFlows = computed<AttachedFlow[]>(() => {
  const seen = new Set<string>();
  const out: AttachedFlow[] = [];
  for (const id of selectedProjectIds.value) {
    for (const f of flowsByProject.value[id] ?? []) {
      if (seen.has(f.slug)) continue;
      seen.add(f.slug);
      out.push(f);
    }
  }
  return out;
});

const defaultFlowHint = computed(() => {
  if (selectedProjectIds.value.length === 0) return null;
  const firstId = selectedProjectIds.value[0];
  const firstFlows = flowsByProject.value[firstId] ?? [];
  return firstFlows.find((f) => f.isDefault) ?? null;
});

// When selected projects change, ensure selectedFlowSlug remains valid.
watch(availableFlows, (flows) => {
  if (flows.length === 0) return;
  if (!flows.some((f) => f.slug === selectedFlowSlug.value)) {
    selectedFlowSlug.value = defaultFlowHint.value?.slug ?? flows[0].slug;
  }
});

// Load statuses for the chosen flow. Resets the selected status to the flow's
// first status (lowest sortOrder) — that's the API's default landing status,
// so no transition is needed. Re-fires when `availableFlows` updates so a
// preset `flow` prop can resolve once the user picks a project.
watch(
  [selectedFlowSlug, availableFlows],
  async ([slug, flows]) => {
    if (!slug) {
      selectedStatusSlug.value = "";
      return;
    }
    const flow = flows.find((f) => f.slug === slug);
    if (!flow) return;
    await loadStatuses(flow.id, slug);
  },
  { immediate: true },
);

async function loadStatuses(flowId: string, flowSlug: string) {
  if (!statusesByFlow.value[flowSlug]) {
    try {
      const list = await listFlowStatuses(flowId);
      statusesByFlow.value[flowSlug] = [...list].sort((a, b) => a.sortOrder - b.sortOrder);
    } catch {
      statusesByFlow.value[flowSlug] = [];
    }
  }
  const first = statusesByFlow.value[flowSlug][0];
  selectedStatusSlug.value = first?.slug ?? "";
}

const availableStatuses = computed<FlowStatus[]>(
  () => statusesByFlow.value[selectedFlowSlug.value] ?? [],
);

const defaultStatusSlug = computed(() => availableStatuses.value[0]?.slug ?? "");

function toggleProject(id: string) {
  const idx = selectedProjectIds.value.indexOf(id);
  if (idx >= 0) selectedProjectIds.value.splice(idx, 1);
  else selectedProjectIds.value.push(id);
}

function toggleLabel(id: string) {
  const idx = selectedLabelIds.value.indexOf(id);
  if (idx >= 0) selectedLabelIds.value.splice(idx, 1);
  else selectedLabelIds.value.push(id);
}

const heading = computed(() => {
  if (!selectedFlowSlug.value) return "New Task";
  const name = selectedFlowSlug.value.charAt(0).toUpperCase() + selectedFlowSlug.value.slice(1);
  return `New ${name} Task`;
});

const canSubmit = computed(
  () =>
    title.value.trim() &&
    selectedProjectIds.value.length > 0 &&
    assigneeUserId.value &&
    selectedFlowSlug.value,
);

async function handleSubmit() {
  if (!canSubmit.value) {
    error.value = "Title, at least one project, a flow, and an assignee are required";
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    const task = await createTask({
      flow: selectedFlowSlug.value,
      title: title.value,
      description: description.value || undefined,
      priority: priority.value,
      projectIds: selectedProjectIds.value,
      assigneeUserId: assigneeUserId.value,
      dueDate: dueDate.value || null,
      spawnedFromTaskId: selectedParentId.value,
    });

    const postCreateErrors: string[] = [];
    for (const labelId of selectedLabelIds.value) {
      try {
        await attachLabelToTask(task.id, labelId);
      } catch (e: any) {
        postCreateErrors.push(e?.error?.message || `Failed to attach label ${labelId}`);
      }
    }

    if (
      selectedStatusSlug.value &&
      selectedStatusSlug.value !== defaultStatusSlug.value
    ) {
      try {
        await createTransition(task.id, { toStatus: selectedStatusSlug.value, note: "" });
      } catch (e: any) {
        postCreateErrors.push(
          e?.error?.message || `Failed to set status to ${selectedStatusSlug.value}`,
        );
      }
    }

    if (postCreateErrors.length > 0) {
      error.value = `Task created, but: ${postCreateErrors.join("; ")}`;
    }
    emit("created", task);
  } catch (e: any) {
    error.value = e?.error?.message || "Failed to create task";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="create-form">
    <h3>{{ heading }}</h3>
    <div v-if="error" class="create-form__error">{{ error }}</div>

    <label class="create-form__label">Title *</label>
    <input v-model="title" placeholder="Title" class="create-form__input" />

    <label class="create-form__label">Projects *</label>
    <div class="create-form__projects">
      <label
        v-for="p in projects"
        :key="p.id"
        class="create-form__project"
      >
        <input
          type="checkbox"
          :checked="selectedProjectIds.includes(p.id)"
          @change="toggleProject(p.id)"
        />
        <span class="create-form__project-key">{{ p.key }}</span>
        {{ p.name }}
      </label>
    </div>

    <label class="create-form__label">Flow *</label>
    <select v-model="selectedFlowSlug" class="create-form__select">
      <option v-if="availableFlows.length === 0" value="">
        — select projects first —
      </option>
      <option v-for="f in availableFlows" :key="f.id" :value="f.slug">
        {{ f.name }}
      </option>
    </select>
    <p
      v-if="defaultFlowHint && selectedFlowSlug !== defaultFlowHint.slug"
      class="create-form__hint"
    >
      Default for this project: {{ defaultFlowHint.name }}
    </p>

    <label class="create-form__label">Initial status</label>
    <select
      v-model="selectedStatusSlug"
      class="create-form__select"
      data-testid="task-create-status"
      :disabled="availableStatuses.length === 0"
    >
      <option v-if="availableStatuses.length === 0" value="">
        — pick a flow first —
      </option>
      <option v-for="s in availableStatuses" :key="s.id" :value="s.slug">
        {{ s.name }}
      </option>
    </select>
    <p
      v-if="
        selectedStatusSlug &&
        defaultStatusSlug &&
        selectedStatusSlug !== defaultStatusSlug
      "
      class="create-form__hint"
    >
      Task will be created at "{{ availableStatuses[0]?.name }}" then transitioned.
    </p>

    <label class="create-form__label">Assignee *</label>
    <select
      v-model="assigneeUserId"
      class="create-form__select"
      data-testid="task-create-assignee"
      @change="assigneeTouched = true"
    >
      <option value="">— select —</option>
      <option v-for="u in users" :key="u.id" :value="u.id">
        {{ u.displayName }}
      </option>
    </select>

    <label class="create-form__label">Tags</label>
    <div class="create-form__labels" data-testid="task-create-labels">
      <span v-if="labels.length === 0" class="create-form__hint">No tags available</span>
      <label v-for="l in labels" :key="l.id" class="create-form__label-chip">
        <input
          type="checkbox"
          :checked="selectedLabelIds.includes(l.id)"
          @change="toggleLabel(l.id)"
        />
        <span
          class="create-form__label-swatch"
          :style="{ background: l.color }"
        />
        {{ l.name }}
      </label>
    </div>

    <label class="create-form__label">Parent task (optional)</label>
    <div class="create-form__parent" data-testid="task-create-parent">
      <span v-if="selectedParentLabel" class="create-form__parent-label">
        {{ selectedParentLabel }}
      </span>
      <span v-else class="create-form__hint">No parent</span>
      <button
        type="button"
        class="create-form__parent-btn"
        data-testid="task-create-parent-btn"
        @click="openParentPicker"
      >
        {{ selectedParentId ? "Change" : "Set parent" }}
      </button>
      <button
        v-if="selectedParentId"
        type="button"
        class="create-form__parent-btn"
        data-testid="task-create-parent-clear"
        @click="clearParent"
      >
        Clear
      </button>
      <TaskPicker
        v-if="showParentPicker"
        :exclude-id="null"
        class="create-form__parent-picker"
        @select="handleParentSelect"
        @close="closeParentPicker"
      />
    </div>

    <label class="create-form__label">Description (optional)</label>
    <textarea
      v-model="description"
      placeholder="Markdown supported"
      class="create-form__textarea"
      rows="3"
    />

    <label class="create-form__label">Priority</label>
    <select v-model="priority" class="create-form__select">
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>

    <label class="create-form__label">Due date (optional)</label>
    <input v-model="dueDate" type="date" class="create-form__input" />

    <div class="create-form__actions">
      <button type="button" class="create-form__cancel" @click="emit('cancel')">Cancel</button>
      <button
        type="button"
        class="create-form__submit"
        :disabled="submitting || !canSubmit"
        @click="handleSubmit"
      >
        {{ submitting ? "Creating..." : "Create" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.create-form {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius);
  padding: 1rem;
  margin-bottom: 1rem;
}

.create-form h3 {
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.create-form__error {
  color: var(--priority-critical);
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.create-form__input,
.create-form__textarea,
.create-form__select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.create-form__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.create-form__cancel {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.create-form__submit {
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.create-form__submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.create-form__label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
  margin-top: 0.25rem;
}

.create-form__projects {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  margin-bottom: 0.5rem;
  max-height: 10rem;
  overflow-y: auto;
}

.create-form__project {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

.create-form__project-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
}

.create-form__hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: -0.25rem;
  margin-bottom: 0.5rem;
}

.create-form__labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  margin-bottom: 0.5rem;
  max-height: 10rem;
  overflow-y: auto;
}

.create-form__label-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

.create-form__parent {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
}

.create-form__parent-label {
  font-size: 0.8125rem;
  font-weight: 500;
}

.create-form__parent-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  font-size: 0.8125rem;
}

.create-form__parent-btn:hover,
.create-form__parent-btn:focus-visible {
  text-decoration: underline;
  outline: none;
}

.create-form__parent-picker {
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
}

.create-form__label-swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border-primary);
}
</style>
