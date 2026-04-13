<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { createTask } from "@/api/tasks.api";
import { listProjects, type Project } from "@/api/projects.api";
import { apiFetch } from "@/api/client";

const props = defineProps<{
  flow: string;
}>();

const emit = defineEmits<{
  created: [];
  cancel: [];
}>();

const title = ref("");
const description = ref("");
const priority = ref("medium");
const dueDate = ref("");
const selectedProjectIds = ref<string[]>([]);
const assigneeUserId = ref("");
const assigneeTouched = ref(false);

const projects = ref<Project[]>([]);
const users = ref<{ id: string; displayName: string }[]>([]);

const submitting = ref(false);
const error = ref("");

onMounted(async () => {
  projects.value = await listProjects();
  try {
    users.value = (await apiFetch<{ data: any[] }>("/api/v1/users")).data;
  } catch {
    users.value = [];
  }
});

// Auto-fill assignee from the first selected project's default, unless the
// user has manually touched the field.
watch(selectedProjectIds, (ids) => {
  if (assigneeTouched.value || ids.length === 0) return;
  const first = projects.value.find((p) => p.id === ids[0]);
  if (first?.defaultAssignee) {
    assigneeUserId.value = first.defaultAssignee.id;
  }
});

function toggleProject(id: string) {
  const idx = selectedProjectIds.value.indexOf(id);
  if (idx >= 0) selectedProjectIds.value.splice(idx, 1);
  else selectedProjectIds.value.push(id);
}

const canSubmit = computed(
  () => title.value.trim() && selectedProjectIds.value.length > 0 && assigneeUserId.value,
);

async function handleSubmit() {
  if (!canSubmit.value) {
    error.value = "Title, at least one project, and an assignee are required";
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    await createTask({
      flow: props.flow,
      title: title.value,
      description: description.value || undefined,
      priority: priority.value,
      projectIds: selectedProjectIds.value,
      assigneeUserId: assigneeUserId.value,
      dueDate: dueDate.value || null,
    });
    emit("created");
  } catch (e: any) {
    error.value = e?.error?.message || "Failed to create task";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="create-form">
    <h3>New {{ flow.charAt(0).toUpperCase() + flow.slice(1) }} Task</h3>
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

    <label class="create-form__label">Assignee *</label>
    <select
      v-model="assigneeUserId"
      class="create-form__select"
      @change="assigneeTouched = true"
    >
      <option value="">— select —</option>
      <option v-for="u in users" :key="u.id" :value="u.id">
        {{ u.displayName }}
      </option>
    </select>

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
      <button class="create-form__cancel" @click="emit('cancel')">Cancel</button>
      <button
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
</style>
