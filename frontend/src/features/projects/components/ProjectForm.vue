<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Project } from "@/api/projects.api";
import type { Team } from "@/api/teams.api";

interface Props {
  project?: Project | null;
  teams: Team[];
  flows: { id: string; slug: string; name: string }[];
  users: { id: string; displayName: string }[];
  submitting?: boolean;
  error?: string | null;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  submit: [payload: {
    key: string;
    name: string;
    ownerUserId: string;
    defaultAssigneeUserId: string | null;
    defaultFlowId: string | null;
    teamIds: string[];
  }];
  cancel: [];
}>();

const isEdit = computed(() => !!props.project);

const key = ref(props.project?.key ?? "");
const name = ref(props.project?.name ?? "");
const ownerUserId = ref(props.project?.owner.id ?? "");
const defaultAssigneeUserId = ref(props.project?.defaultAssignee?.id ?? "");
const defaultFlowId = ref(props.project?.defaultFlow?.id ?? "");
const teamIds = ref<string[]>(props.project?.teams.map((t) => t.id) ?? []);

watch(
  () => props.project,
  (p) => {
    if (!p) return;
    key.value = p.key;
    name.value = p.name;
    ownerUserId.value = p.owner.id;
    defaultAssigneeUserId.value = p.defaultAssignee?.id ?? "";
    defaultFlowId.value = p.defaultFlow?.id ?? "";
    teamIds.value = p.teams.map((t) => t.id);
  },
);

const canSubmit = computed(
  () =>
    !!name.value.trim() &&
    !!ownerUserId.value &&
    teamIds.value.length > 0 &&
    (isEdit.value || /^[A-Z][A-Z0-9_-]{1,31}$/.test(key.value)),
);

function submit() {
  emit("submit", {
    key: key.value,
    name: name.value.trim(),
    ownerUserId: ownerUserId.value,
    defaultAssigneeUserId: defaultAssigneeUserId.value || null,
    defaultFlowId: defaultFlowId.value || null,
    teamIds: teamIds.value,
  });
}

function toggleTeam(id: string) {
  const idx = teamIds.value.indexOf(id);
  if (idx >= 0) teamIds.value.splice(idx, 1);
  else teamIds.value.push(id);
}
</script>

<template>
  <form class="project-form" @submit.prevent="submit">
    <div class="project-form__field">
      <label>Key</label>
      <input
        v-model="key"
        :disabled="isEdit"
        placeholder="REP"
        data-testid="project-key"
      />
      <p v-if="!isEdit" class="project-form__hint">
        Uppercase letters, digits, _ or - (2–32 chars).
      </p>
    </div>

    <div class="project-form__field">
      <label>Name</label>
      <input v-model="name" placeholder="Reportal" data-testid="project-name" />
    </div>

    <div class="project-form__field">
      <label>Owner</label>
      <select v-model="ownerUserId" data-testid="project-owner">
        <option value="">— select —</option>
        <option v-for="u in users" :key="u.id" :value="u.id">
          {{ u.displayName }}
        </option>
      </select>
    </div>

    <div class="project-form__field">
      <label>Default assignee (optional)</label>
      <select v-model="defaultAssigneeUserId">
        <option value="">— none —</option>
        <option v-for="u in users" :key="u.id" :value="u.id">
          {{ u.displayName }}
        </option>
      </select>
    </div>

    <div class="project-form__field">
      <label>Default flow (optional)</label>
      <select v-model="defaultFlowId">
        <option value="">— none —</option>
        <option v-for="f in flows" :key="f.id" :value="f.id">
          {{ f.name }}
        </option>
      </select>
    </div>

    <div class="project-form__field">
      <label>Teams</label>
      <div class="project-form__teams">
        <label v-for="t in teams" :key="t.id" class="project-form__team">
          <input
            type="checkbox"
            :checked="teamIds.includes(t.id)"
            @change="toggleTeam(t.id)"
          />
          {{ t.name }}
        </label>
      </div>
    </div>

    <p v-if="error" class="project-form__error">{{ error }}</p>

    <div class="project-form__actions">
      <button type="button" @click="emit('cancel')">Cancel</button>
      <button
        type="submit"
        :disabled="!canSubmit || submitting"
        data-testid="project-submit"
      >
        {{ isEdit ? "Save" : "Create project" }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.project-form {
  display: grid;
  gap: 1rem;
  max-width: 32rem;
}
.project-form__field {
  display: grid;
  gap: 0.25rem;
  font-size: 0.875rem;
}
.project-form__field label {
  font-weight: 500;
  color: var(--text-secondary);
}
.project-form__field input,
.project-form__field select {
  padding: 0.5rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.875rem;
}
.project-form__hint {
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.project-form__teams {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.project-form__team {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}
.project-form__error {
  color: var(--priority-critical, #c0392b);
  font-size: 0.8125rem;
}
.project-form__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.project-form__actions button {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid var(--border-primary);
  background: var(--bg-primary);
  cursor: pointer;
  font-size: 0.875rem;
}
.project-form__actions button[type="submit"] {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.project-form__actions button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
