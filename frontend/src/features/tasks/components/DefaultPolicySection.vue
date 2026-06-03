<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { getTask } from "@/api/tasks.api";
import {
  listPolicies,
  createPolicy,
  addPolicySlot,
  setTaskDefaultPolicy,
  type SignoffPolicy,
} from "@/api/signoff-policies.api";

const props = defineProps<{ taskId: string }>();
const emit = defineEmits<{ (e: "changed"): void }>();

const policies = ref<SignoffPolicy[]>([]);
const currentPolicyId = ref<string | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

// Picker state
const showPicker = ref(false);
const selectedPolicyId = ref("");

// Create-new form state
const showCreateForm = ref(false);
const newPolicyName = ref("");
const newSlotRows = ref<{ label: string; actorType: string }[]>([]);

const currentPolicy = computed(
  () => policies.value.find((p) => p.id === currentPolicyId.value) ?? null
);

async function load() {
  error.value = null;
  try {
    const [task, pols] = await Promise.all([
      getTask(props.taskId),
      listPolicies(),
    ]);
    currentPolicyId.value = task.defaultSignoffPolicyId ?? null;
    policies.value = pols;
    selectedPolicyId.value = currentPolicyId.value ?? "";
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to load policy";
  }
}

watch(() => props.taskId, load, { immediate: true });

function openPicker() {
  showPicker.value = true;
  showCreateForm.value = false;
  selectedPolicyId.value = currentPolicyId.value ?? "";
}

function cancelPicker() {
  showPicker.value = false;
  showCreateForm.value = false;
}

async function applyPolicy() {
  if (!selectedPolicyId.value) return;
  busy.value = true;
  error.value = null;
  try {
    await setTaskDefaultPolicy(props.taskId, selectedPolicyId.value);
    showPicker.value = false;
    await load();
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to apply policy";
  } finally {
    busy.value = false;
  }
}

async function clearPolicy() {
  busy.value = true;
  error.value = null;
  try {
    await setTaskDefaultPolicy(props.taskId, null);
    currentPolicyId.value = null;
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to clear policy";
  } finally {
    busy.value = false;
  }
}

function openCreateForm() {
  showCreateForm.value = true;
  newPolicyName.value = "";
  newSlotRows.value = [];
}

function addSlotRow() {
  newSlotRows.value.push({ label: "", actorType: "" });
}

function removeSlotRow(i: number) {
  newSlotRows.value.splice(i, 1);
}

async function createAndApply() {
  if (!newPolicyName.value.trim()) return;
  busy.value = true;
  error.value = null;
  try {
    const slug = newPolicyName.value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const policy = await createPolicy({ slug: `${slug}-${Date.now()}`, name: newPolicyName.value.trim() });
    for (let i = 0; i < newSlotRows.value.length; i++) {
      const row = newSlotRows.value[i];
      if (!row.label.trim()) continue;
      await addPolicySlot(policy.id, {
        label: row.label.trim(),
        requiredActorType: row.actorType || null,
      });
    }
    await setTaskDefaultPolicy(props.taskId, policy.id);
    showPicker.value = false;
    showCreateForm.value = false;
    await load();
    emit("changed");
  } catch (e: any) {
    error.value = e?.error?.message ?? "Failed to create policy";
  } finally {
    busy.value = false;
  }
}

function actorLabel(type: string | null) {
  if (type === "human") return "human";
  if (type === "agent") return "agent";
  return "any";
}
</script>

<template>
  <div class="dps">
    <div class="dps__header">
      <span class="dps__label">Default slots</span>

      <template v-if="currentPolicy">
        <span class="dps__current-name" data-testid="current-policy-name">{{ currentPolicy.name }}</span>
        <span
          v-for="s in currentPolicy.slots"
          :key="s.id"
          class="dps__slot-chip"
          :class="`dps__slot-chip--${actorLabel(s.requiredActorType)}`"
        >
          {{ s.label }}
          <em class="dps__slot-type">{{ actorLabel(s.requiredActorType) }}</em>
        </span>
        <button
          type="button"
          class="dps__btn dps__btn--ghost dps__btn--sm"
          data-testid="change-policy-btn"
          :disabled="busy"
          @click="openPicker"
        >
          Change
        </button>
        <button
          type="button"
          class="dps__btn dps__btn--danger dps__btn--sm"
          data-testid="clear-policy-btn"
          :disabled="busy"
          @click="clearPolicy"
        >
          Clear
        </button>
      </template>

      <template v-else>
        <span class="dps__none">None — new requirements get no default slots</span>
        <button
          type="button"
          class="dps__btn dps__btn--sm"
          data-testid="set-policy-btn"
          :disabled="busy"
          @click="openPicker"
        >
          Set
        </button>
      </template>
    </div>

    <p v-if="error" class="dps__error" role="alert">{{ error }}</p>

    <!-- Picker panel -->
    <div v-if="showPicker && !showCreateForm" class="dps__picker" data-testid="policy-picker">
      <select
        v-model="selectedPolicyId"
        class="dps__select"
        data-testid="policy-select"
        :disabled="busy"
      >
        <option value="">Select a policy…</option>
        <option v-for="p in policies" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <button
        type="button"
        class="dps__btn dps__btn--sm"
        data-testid="apply-policy-btn"
        :disabled="busy || !selectedPolicyId"
        @click="applyPolicy"
      >
        Apply
      </button>
      <button
        type="button"
        class="dps__btn dps__btn--ghost dps__btn--sm"
        data-testid="create-policy-btn"
        :disabled="busy"
        @click="openCreateForm"
      >
        + Create new
      </button>
      <button
        type="button"
        class="dps__btn dps__btn--ghost dps__btn--sm"
        @click="cancelPicker"
      >
        Cancel
      </button>
    </div>

    <!-- Create-new policy form -->
    <div v-if="showCreateForm" class="dps__create-form">
      <input
        v-model="newPolicyName"
        type="text"
        class="dps__input"
        placeholder="Policy name (e.g. 3-eyes)"
        data-testid="new-policy-name"
        :disabled="busy"
      />

      <div
        v-for="(row, i) in newSlotRows"
        :key="i"
        class="dps__slot-row"
      >
        <input
          v-model="row.label"
          type="text"
          class="dps__input dps__input--sm"
          placeholder="Slot label"
          :data-testid="`slot-label-${i}`"
          :disabled="busy"
        />
        <select
          v-model="row.actorType"
          class="dps__select dps__select--sm"
          :data-testid="`slot-actor-${i}`"
          :disabled="busy"
        >
          <option value="">Any actor</option>
          <option value="human">Human only</option>
          <option value="agent">Agent only</option>
        </select>
        <button
          type="button"
          class="dps__btn dps__btn--ghost dps__btn--sm"
          :disabled="busy"
          @click="removeSlotRow(i)"
        >
          ×
        </button>
      </div>

      <div class="dps__create-actions">
        <button
          type="button"
          class="dps__btn dps__btn--ghost dps__btn--sm"
          data-testid="add-slot-row-btn"
          :disabled="busy"
          @click="addSlotRow"
        >
          + Add slot
        </button>
        <button
          type="button"
          class="dps__btn dps__btn--sm"
          data-testid="create-apply-btn"
          :disabled="busy || !newPolicyName.trim()"
          @click="createAndApply"
        >
          Create &amp; apply
        </button>
        <button
          type="button"
          class="dps__btn dps__btn--ghost dps__btn--sm"
          @click="showCreateForm = false"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dps {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.6rem;
  background: var(--color-bg-muted, #f8f8f8);
  border-radius: 6px;
  border: 1px solid var(--color-border, #e8e8e8);
}

.dps__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.dps__label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-muted, #666);
  flex-shrink: 0;
}

.dps__current-name {
  font-size: 0.82rem;
  font-weight: 600;
}

.dps__none {
  font-size: 0.8rem;
  color: var(--color-text-muted, #999);
  font-style: italic;
}

.dps__slot-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: #e8e8e8;
}

.dps__slot-chip--human { background: #d4edda; }
.dps__slot-chip--agent { background: #cce5ff; }
.dps__slot-chip--any   { background: #e8e8e8; }

.dps__slot-type {
  font-style: normal;
  opacity: 0.6;
  font-size: 0.65rem;
}

.dps__error {
  color: var(--color-danger, #c0392b);
  font-size: 0.8rem;
  margin: 0.25rem 0 0;
}

.dps__picker {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}

.dps__create-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.dps__slot-row {
  display: flex;
  gap: 0.3rem;
  align-items: center;
}

.dps__create-actions {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.dps__input {
  padding: 0.28rem 0.45rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  font-size: 0.82rem;
}

.dps__input--sm { font-size: 0.78rem; }

.dps__select {
  padding: 0.28rem 0.4rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  font-size: 0.82rem;
}

.dps__select--sm { font-size: 0.78rem; }

.dps__btn {
  padding: 0.22rem 0.55rem;
  border-radius: 4px;
  border: 1px solid var(--accent, #004de6);
  background: var(--accent, #004de6);
  color: white;
  cursor: pointer;
  font-size: 0.78rem;
  white-space: nowrap;
}

.dps__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dps__btn--sm { font-size: 0.74rem; padding: 0.17rem 0.4rem; }

.dps__btn--ghost {
  background: none;
  color: var(--color-text-muted, #666);
  border-color: var(--color-border, #ccc);
}

.dps__btn--danger {
  background: none;
  color: #c0392b;
  border-color: #c0392b;
}
</style>
